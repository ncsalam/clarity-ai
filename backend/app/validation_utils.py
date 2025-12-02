"""
Validation and Sanitization Utilities

Provides utilities for input validation, sanitization, and LLM response validation
to ensure security and data integrity.
"""

import re
import json
from typing import Any, Dict, List, Optional
from html import escape
import time


class InputSanitizer:
    """
    Sanitizes user input to prevent injection attacks and ensure data integrity.
    """
    
    # Patterns for detecting potential injection attempts
    SUSPICIOUS_PATTERNS = [
        r'<script[^>]*>.*?</script>',  # Script tags
        r'javascript:',  # JavaScript protocol
        r'on\w+\s*=',  # Event handlers
        r'<iframe[^>]*>',  # Iframes
        r'eval\s*\(',  # Eval calls
        r'exec\s*\(',  # Exec calls
    ]
    
    @staticmethod
    def sanitize_text(text: str, max_length: int = 50000) -> str:
        """
        Sanitize text input for safe processing.
        
        Args:
            text: Input text to sanitize
            max_length: Maximum allowed length
            
        Returns:
            Sanitized text
            
        Raises:
            ValueError: If text is invalid or contains suspicious content
        """
        if not text:
            raise ValueError("Text cannot be empty")
        
        # Remove null bytes and non-printable characters (except newlines, tabs)
        sanitized = ''.join(
            char for char in text 
            if char.isprintable() or char in '\n\r\t'
        )
        
        # Check length
        if len(sanitized) > max_length:
            raise ValueError(f"Text exceeds maximum length of {max_length} characters")
        
        # Check for suspicious patterns
        for pattern in InputSanitizer.SUSPICIOUS_PATTERNS:
            if re.search(pattern, sanitized, re.IGNORECASE):
                raise ValueError("Text contains potentially malicious content")
        
        return sanitized.strip()
    
    @staticmethod
    def sanitize_for_llm_prompt(text: str) -> str:
        """
        Sanitize text specifically for inclusion in LLM prompts.
        Prevents prompt injection attacks.
        
        Args:
            text: Text to include in LLM prompt
            
        Returns:
            Sanitized text safe for LLM prompts
        """
        # First apply general sanitization
        sanitized = InputSanitizer.sanitize_text(text)
        
        # Escape special characters that could be used for prompt injection
        # Replace multiple newlines with single newline
        sanitized = re.sub(r'\n{3,}', '\n\n', sanitized)
        
        # Remove or escape prompt injection patterns
        injection_patterns = [
            (r'ignore\s+previous\s+instructions', '[REDACTED]'),
            (r'disregard\s+all\s+previous', '[REDACTED]'),
            (r'forget\s+everything', '[REDACTED]'),
            (r'new\s+instructions:', '[REDACTED]'),
            (r'system\s*:', '[REDACTED]'),
            (r'assistant\s*:', '[REDACTED]'),
        ]
        
        for pattern, replacement in injection_patterns:
            sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
        
        return sanitized
    
    @staticmethod
    def sanitize_term(term: str) -> str:
        """
        Sanitize a lexicon term.
        
        Args:
            term: Term to sanitize
            
        Returns:
            Sanitized term
            
        Raises:
            ValueError: If term is invalid
        """
        if not term or not term.strip():
            raise ValueError("Term cannot be empty")
        
        # Only allow alphanumeric, spaces, hyphens, and underscores
        sanitized = ''.join(
            char for char in term 
            if char.isalnum() or char in ' -_'
        )
        
        sanitized = sanitized.strip().lower()
        
        if not sanitized:
            raise ValueError("Term must contain at least one alphanumeric character")
        
        if len(sanitized) > 100:
            raise ValueError("Term exceeds maximum length of 100 characters")
        
        return sanitized
    
    @staticmethod
    def validate_json_structure(data: Any, expected_keys: List[str]) -> bool:
        """
        Validate that JSON data has expected structure.
        
        Args:
            data: Parsed JSON data
            expected_keys: List of required keys
            
        Returns:
            True if valid, False otherwise
        """
        if not isinstance(data, dict):
            return False
        
        for key in expected_keys:
            if key not in data:
                return False
        
        return True


class LLMResponseValidator:
    """
    Validates LLM responses to ensure they meet expected format and content requirements.
    """
    
    @staticmethod
    def validate_context_evaluation(response: Dict) -> Dict:
        """
        Validate context evaluation response from LLM.
        
        Args:
            response: Parsed LLM response
            
        Returns:
            Validated and normalized response
            
        Raises:
            ValueError: If response is invalid
        """
        if not isinstance(response, dict):
            raise ValueError("Response must be a dictionary")
        
        # Check required fields
        required_fields = ['is_ambiguous', 'confidence', 'reasoning']
        for field in required_fields:
            if field not in response:
                raise ValueError(f"Missing required field: {field}")
        
        # Validate types and values
        is_ambiguous = response['is_ambiguous']
        if not isinstance(is_ambiguous, bool):
            raise ValueError("is_ambiguous must be a boolean")
        
        confidence = float(response['confidence'])
        if not 0.0 <= confidence <= 1.0:
            raise ValueError("confidence must be between 0.0 and 1.0")
        
        reasoning = str(response['reasoning'])
        if not reasoning or len(reasoning) > 1000:
            raise ValueError("reasoning must be non-empty and under 1000 characters")
        
        # Sanitize reasoning text
        reasoning = InputSanitizer.sanitize_text(reasoning, max_length=1000)
        
        return {
            'is_ambiguous': is_ambiguous,
            'confidence': confidence,
            'reasoning': reasoning
        }
    
    @staticmethod
    def validate_suggestions(suggestions: List) -> List[str]:
        """
        Validate suggestion list from LLM.
        
        Args:
            suggestions: List of suggestions
            
        Returns:
            Validated and sanitized suggestions
            
        Raises:
            ValueError: If suggestions are invalid
        """
        if not isinstance(suggestions, list):
            raise ValueError("Suggestions must be a list")
        
        if len(suggestions) < 2:
            raise ValueError("Must provide at least 2 suggestions")
        
        validated = []
        for suggestion in suggestions:
            if not isinstance(suggestion, str):
                continue
            
            # Sanitize suggestion
            sanitized = InputSanitizer.sanitize_text(suggestion, max_length=500)
            
            if sanitized and len(sanitized) >= 5:  # Minimum meaningful length
                validated.append(sanitized)
        
        if len(validated) < 2:
            raise ValueError("Must have at least 2 valid suggestions")
        
        return validated[:5]  # Return max 5
    
    @staticmethod
    def validate_clarification_prompt(prompt: str) -> str:
        """
        Validate clarification prompt from LLM.
        
        Args:
            prompt: Clarification prompt text
            
        Returns:
            Validated and sanitized prompt
            
        Raises:
            ValueError: If prompt is invalid
        """
        if not isinstance(prompt, str):
            raise ValueError("Prompt must be a string")
        
        # Sanitize prompt
        sanitized = InputSanitizer.sanitize_text(prompt, max_length=500)
        
        if not sanitized or len(sanitized) < 10:
            raise ValueError("Prompt must be at least 10 characters")
        
        # Remove quotes if present
        if sanitized.startswith('"') and sanitized.endswith('"'):
            sanitized = sanitized[1:-1]
        if sanitized.startswith("'") and sanitized.endswith("'"):
            sanitized = sanitized[1:-1]
        
        return sanitized
    
    @staticmethod
    def validate_batch_evaluation(responses: List) -> List[Dict]:
        """
        Validate batch evaluation responses from LLM.
        
        Args:
            responses: List of evaluation responses
            
        Returns:
            List of validated responses
            
        Raises:
            ValueError: If responses are invalid
        """
        if not isinstance(responses, list):
            raise ValueError("Responses must be a list")
        
        if len(responses) == 0:
            raise ValueError("Responses list cannot be empty")
        
        validated = []
        for response in responses:
            try:
                validated_response = LLMResponseValidator.validate_context_evaluation(response)
                validated.append(validated_response)
            except ValueError as e:
                # Log error but continue with default
                print(f"Invalid response in batch: {e}")
                validated.append({
                    'is_ambiguous': True,
                    'confidence': 0.5,
                    'reasoning': 'Invalid response from LLM'
                })
        
        return validated


class RateLimiter:
    """
    Simple in-memory rate limiter for API endpoints.
    For production, consider using Redis-based rate limiting.
    """
    
    def __init__(self):
        """Initialize rate limiter"""
        self._requests: Dict[str, List[float]] = {}
    
    def check_rate_limit(self, user_id: str, max_requests: int = 500, 
                        window_seconds: int = 3600) -> bool:
        """
        Check if user has exceeded rate limit.
        
        Args:
            user_id: User identifier
            max_requests: Maximum requests allowed in window
            window_seconds: Time window in seconds
            
        Returns:
            True if within limit, False if exceeded
        """
        
        current_time = time.time()
        
        # Initialize user's request list if not exists
        if user_id not in self._requests:
            self._requests[user_id] = []
        
        # Remove old requests outside the window
        self._requests[user_id] = [
            req_time for req_time in self._requests[user_id]
            if current_time - req_time < window_seconds
        ]
        
        # Check if limit exceeded
        if len(self._requests[user_id]) >= max_requests:
            return False
        
        # Add current request
        self._requests[user_id].append(current_time)
        
        return True
    
    def get_remaining_requests(self, user_id: str, max_requests: int = 500,
                              window_seconds: int = 3600) -> int:
        """
        Get number of remaining requests for user.
        
        Args:
            user_id: User identifier
            max_requests: Maximum requests allowed
            window_seconds: Time window in seconds
            
        Returns:
            Number of remaining requests
        """
        
        current_time = time.time()
        
        if user_id not in self._requests:
            return max_requests
        
        # Count valid requests in window
        valid_requests = [
            req_time for req_time in self._requests[user_id]
            if current_time - req_time < window_seconds
        ]
        
        return max(0, max_requests - len(valid_requests))


# Global rate limiter instance
rate_limiter = RateLimiter()
