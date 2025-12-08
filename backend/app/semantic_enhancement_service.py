"""
Semantic Enhancement Service for Ambiguity Detection

Finds semantically similar terms to lexicon entries using embeddings.
Extends ambiguity detection beyond exact lexicon matches.
"""

from typing import List, Dict, Optional, Tuple
import numpy as np
from langchain_openai import OpenAIEmbeddings
from .lexicon_manager import LexiconManager
import re


class SemanticEnhancementService:
    """
    Enhances ambiguity detection by finding semantically similar terms
    to those in the lexicon using OpenAI embeddings.
    
    Example:
        "The system should respond quickly and smoothly"
        
        Lexicon: [fast, quick, responsive, easy, simple, ...]
        
        Without semantic enhancement:
            Exact matches: ["quickly" → "quick"]
        
        With semantic enhancement:
            Exact matches: ["quickly" → "quick"]
            Semantic matches: 
                "smoothly" → similarity to "responsive"/"easy" = 0.84
                "respond" → similarity to "responsive" = 0.81
    """
    
    # Cosine similarity threshold for considering a term semantically similar
    SIMILARITY_THRESHOLD = 0.85
    
    def __init__(self, lexicon_manager: Optional[LexiconManager] = None):
        """Initialize semantic enhancement service with embeddings model.

        Args:
            lexicon_manager: Optional shared LexiconManager instance. If not
                provided, a new one is created. Providing one allows reuse of
                owner scoping and any cached state.
        """
        try:
            self.embeddings_model = OpenAIEmbeddings()
            self.embeddings_available = True
        except Exception as e:
            print(f"Warning: OpenAI embeddings not available: {e}")
            self.embeddings_available = False
        
        # Reuse the passed-in manager when available so we share lexicon scope
        # and avoid duplicating seed/state lookups.
        self.lexicon_manager = lexicon_manager or LexiconManager()
        self._cached_lexicon_embeddings: Dict[str, Dict] = {}
    
    def find_semantically_similar_terms(
        self,
        text: str,
        owner_id: Optional[str] = None,
        threshold: Optional[float] = None,
        include_exact_matches: bool = False
    ) -> List[Dict]:
        """
        Find semantically similar ambiguous terms in text.
        
        Args:
            text: Text to analyze
            owner_id: User ID for lexicon scope
            threshold: Override default similarity threshold
            include_exact_matches: Whether to include terms that exactly match lexicon
            
        Returns:
            List of detected terms with structure:
            {
                'term': str,
                'position_start': int,
                'position_end': int,
                'is_exact_match': bool,
                'similarity_score': float (0-1),
                'matched_lexicon_term': str,
                'detection_method': 'semantic_similarity' | 'lexicon_exact'
            }
        """
        if not self.embeddings_available:
            return []
        
        if threshold is None:
            threshold = self.SIMILARITY_THRESHOLD
        
        results = []
        
        # Step 1: Get lexicon terms
        try:
            lexicon_terms = self.lexicon_manager.get_lexicon(owner_id)
        except Exception as e:
            print(f"Error getting lexicon: {e}")
            return []
        
        if not lexicon_terms:
            return []
        
        # Step 2: Get cached embeddings for lexicon
        try:
            lexicon_embeddings = self._get_lexicon_embeddings(lexicon_terms)
        except Exception as e:
            print(f"Error getting lexicon embeddings: {e}")
            return []
        
        # Step 3: Tokenize text into words with positions
        words = self._tokenize_text(text)
        
        # Step 4: For each word, compute similarity to lexicon
        for word_info in words:
            word = word_info['word'].lower()
            position_start = word_info['start']
            position_end = word_info['end']
            
            # Skip exact lexicon matches if not including them
            if word in lexicon_terms:
                if include_exact_matches:
                    results.append({
                        'term': word,
                        'position_start': position_start,
                        'position_end': position_end,
                        'is_exact_match': True,
                        'similarity_score': 1.0,
                        'matched_lexicon_term': word,
                        'detection_method': 'lexicon_exact'
                    })
                continue
            
            # Find most similar term in lexicon
            try:
                similar_match = self._find_most_similar_term(
                    word,
                    lexicon_terms,
                    lexicon_embeddings
                )
                
                if similar_match and similar_match['similarity'] >= threshold:
                    results.append({
                        'term': word,
                        'position_start': position_start,
                        'position_end': position_end,
                        'is_exact_match': False,
                        'similarity_score': similar_match['similarity'],
                        'matched_lexicon_term': similar_match['lexicon_term'],
                        'detection_method': 'semantic_similarity'
                    })
            except Exception as e:
                # Skip this word if embedding fails
                print(f"Error computing similarity for '{word}': {e}")
                continue
        
        return results
    
    def _get_lexicon_embeddings(self, terms: List[str]) -> Dict[str, np.ndarray]:
        """
        Get cached embeddings for lexicon terms.
        Computes embeddings once and caches for performance.
        
        Args:
            terms: List of lexicon terms
            
        Returns:
            Dictionary mapping term → embedding vector
        """
        # Use sorted tuple as cache key
        cache_key = tuple(sorted(set(terms)))
        cache_key_str = ','.join(cache_key)
        
        if cache_key_str in self._cached_lexicon_embeddings:
            return self._cached_lexicon_embeddings[cache_key_str]
        
        # Generate embeddings for all lexicon terms
        embeddings = {}
        
        print(f"Computing embeddings for {len(cache_key)} lexicon terms...")
        
        for term in cache_key:
            try:
                embedding = self.embeddings_model.embed_query(term)
                embeddings[term] = np.array(embedding, dtype=np.float32)
            except Exception as e:
                print(f"Warning: Could not embed term '{term}': {e}")
                continue
        
        # Cache the result
        self._cached_lexicon_embeddings[cache_key_str] = embeddings
        
        print(f"Cached {len(embeddings)} term embeddings")
        
        return embeddings
    
    def _find_most_similar_term(
        self,
        word: str,
        lexicon_terms: List[str],
        lexicon_embeddings: Dict[str, np.ndarray]
    ) -> Optional[Dict]:
        """
        Find the most similar lexicon term using cosine similarity.
        
        Args:
            word: Word to find similarity for
            lexicon_terms: List of lexicon terms to compare against
            lexicon_embeddings: Precomputed embeddings for lexicon terms
            
        Returns:
            Dict with 'lexicon_term' and 'similarity' (0-1), or None if no matches
        """
        try:
            word_embedding = np.array(
                self.embeddings_model.embed_query(word),
                dtype=np.float32
            )
        except Exception:
            return None
        
        best_match = None
        best_similarity = 0.0
        
        for lexicon_term in lexicon_terms:
            if lexicon_term not in lexicon_embeddings:
                continue
            
            lexicon_embedding = lexicon_embeddings[lexicon_term]
            
            # Compute cosine similarity: (A·B) / (|A| * |B|)
            similarity = self._cosine_similarity(word_embedding, lexicon_embedding)
            
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = {
                    'lexicon_term': lexicon_term,
                    'similarity': float(similarity)
                }
        
        return best_match
    
    @staticmethod
    def _cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
        """
        Compute cosine similarity between two vectors.
        
        Args:
            vec1: First embedding vector
            vec2: Second embedding vector
            
        Returns:
            Cosine similarity score (0-1)
        """
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
    
    def _tokenize_text(self, text: str) -> List[Dict]:
        """
        Tokenize text into words with their positions.
        
        Args:
            text: Text to tokenize
            
        Returns:
            List of dicts with 'word', 'start', 'end' positions
        """
        words = []
        
        # Use regex to find word boundaries
        # Matches sequences of alphanumeric characters and apostrophes
        pattern = r"\b[\w'-]+\b"
        
        for match in re.finditer(pattern, text):
            word = match.group()
            start = match.start()
            end = match.end()
            
            # Skip very short words (1-2 chars) to avoid false positives
            if len(word) > 2:
                words.append({
                    'word': word,
                    'start': start,
                    'end': end
                })
        
        return words
    
    def clear_cache(self):
        """Clear all cached embeddings."""
        self._cached_lexicon_embeddings.clear()
        print("Semantic enhancement cache cleared")
