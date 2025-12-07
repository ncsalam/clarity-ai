"""
Ambiguity Service - Main Orchestrator

Coordinates all components of the Ambiguity Detection Engine to provide
complete ambiguity analysis with error handling and graceful degradation.
"""

from typing import List, Dict, Optional
from datetime import datetime
from langchain_openai import ChatOpenAI

from .main import db
from .models import (
    AmbiguityAnalysis, AmbiguousTerm, Requirement
)
from .lexicon_manager import LexiconManager
from .ambiguity_detector import AmbiguityDetector
from .context_analyzer import ContextAnalyzer
from .suggestion_generator import SuggestionGenerator
from .semantic_enhancement_service import SemanticEnhancementService


class AmbiguityService:
    """
    Main orchestrator for the Ambiguity Detection Engine.
    Coordinates detector, analyzer, and generator components.
    """
    
    def __init__(self):
        """Initialize the service with all components"""
        self.lexicon_manager = LexiconManager()
        self.detector = AmbiguityDetector(self.lexicon_manager)
        self.semantic_enhancement_service = SemanticEnhancementService(self.lexicon_manager)
        
        # Initialize LLM client (shared across components)
        try:
            self.llm_client = ChatOpenAI(model="gpt-4o",max_retries=5, temperature=0.1)
            self.context_analyzer = ContextAnalyzer(self.llm_client)
            self.suggestion_generator = SuggestionGenerator(self.llm_client)
            self.llm_available = True
        except Exception as e:
            print(f"Warning: LLM initialization failed: {e}")
            print("Running in lexicon-only mode")
            self.context_analyzer = None
            self.suggestion_generator = None
            self.llm_available = False
    
    def run_analysis(self, text: str, requirement_id: Optional[int] = None,
                    owner_id: Optional[str] = None, 
                    use_llm: bool = True) -> AmbiguityAnalysis:
        """
        Run complete ambiguity analysis on text.
        
        Args:
            text: Text to analyze
            requirement_id: Optional requirement ID to associate with analysis
            owner_id: User ID for authorization and lexicon scoping
            use_llm: Whether to use LLM for context analysis (default: True)
            
        Returns:
            AmbiguityAnalysis object saved to database
        """
        print(f"Starting ambiguity analysis (LLM: {use_llm and self.llm_available})...")
        
        # Step 1: Initial lexicon-based detection
        detection_result = self.detector.analyze_text(text, owner_id)
        flagged_terms = detection_result['flagged_terms']
        for t in flagged_terms:
            t.setdefault('detection_method', 'lexicon_exact')
        
        print(f"Lexicon scan found {len(flagged_terms)} potential ambiguous terms")
        
        # Step 2: Semantic enhancement (always enabled)
        try:
            semantic_terms = self.semantic_enhancement_service.find_semantically_similar_terms(text)
            print(f"Semantic enhancement found {len(semantic_terms)} semantically similar terms")
            
            existing_positions = {(t['position_start'], t['position_end']) for t in flagged_terms}
            sentences = self.detector._segment_sentences(text)  # reuse same segmentation
            new_semantic_terms = [
                {
                    **t,
                    'sentence_context': self.detector._find_sentence_for_position(
                        t['position_start'], sentences
                    ),
                    'detection_method': 'semantic_similarity'
                }
                for t in semantic_terms
                if (t['position_start'], t['position_end']) not in existing_positions
            ]
            
            flagged_terms.extend(new_semantic_terms)
            # Re-sort by position
            flagged_terms.sort(key=lambda t: t['position_start'])
            
            print(f"After semantic enhancement: {len(flagged_terms)} total terms")
        except Exception as e:
            print(f"Semantic enhancement failed: {e}")
            print("Continuing with lexicon-only detection")
        
        # Step 3: Context evaluation (if LLM available and enabled)
        evaluated_terms = []
        
        if use_llm and self.llm_available and self.context_analyzer:
            try:
                evaluated_terms = self._evaluate_terms_with_llm(flagged_terms, text)
            except Exception as e:
                print(f"LLM evaluation failed: {e}")
                print("Falling back to lexicon-only mode")
                evaluated_terms = self._create_lexicon_only_terms(flagged_terms)
        else:
            # Lexicon-only mode
            evaluated_terms = self._create_lexicon_only_terms(flagged_terms)
        
        # Filter to only truly ambiguous terms
        ambiguous_terms = [t for t in evaluated_terms if t['is_ambiguous']]
        
        print(f"Final analysis: {len(ambiguous_terms)} ambiguous terms confirmed")
        
        # Step 4: Save to database
        analysis = self._save_analysis_to_db(
            text=text,
            requirement_id=requirement_id,
            owner_id=owner_id,
            ambiguous_terms=ambiguous_terms
        )
        
        return analysis
    
    def run_requirement_analysis(self, requirement_id: int, 
                                owner_id: Optional[str] = None,
                                use_llm: bool = True) -> AmbiguityAnalysis:
        """
        Run analysis on a specific requirement from database.
        
        Args:
            requirement_id: ID of requirement to analyze
            owner_id: User ID for authorization
            use_llm: Whether to use LLM for context analysis
            
        Returns:
            AmbiguityAnalysis object
            
        Raises:
            ValueError: If requirement not found or access denied
        """
        # Fetch requirement
        requirement = Requirement.query.filter_by(id=requirement_id).first()
        
        if not requirement:
            raise ValueError(f"Requirement with ID {requirement_id} not found")
        
        # Check authorization
        if owner_id and requirement.owner_id != owner_id:
            raise ValueError(f"Access denied to requirement {requirement_id}")
        
        # Combine title and description
        text_parts = [requirement.title]
        if requirement.description:
            text_parts.append(requirement.description)
        
        full_text = "\n".join(text_parts)
        
        # Run analysis
        return self.run_analysis(
            text=full_text,
            requirement_id=requirement_id,
            owner_id=owner_id,
            use_llm=use_llm
        )
    
    def run_batch_analysis(self, requirement_ids: List[int],
                          owner_id: Optional[str] = None,
                          use_llm: bool = True) -> List[AmbiguityAnalysis]:
        """
        Run analysis on multiple requirements.
        
        Args:
            requirement_ids: List of requirement IDs to analyze
            owner_id: User ID for authorization
            use_llm: Whether to use LLM for context analysis
            
        Returns:
            List of AmbiguityAnalysis objects
        """
        results = []
        
        for req_id in requirement_ids:
            try:
                analysis = self.run_requirement_analysis(req_id, owner_id, use_llm)
                results.append(analysis)
            except Exception as e:
                print(f"Error analyzing requirement {req_id}: {e}")
                # Continue with next requirement
                continue
        
        return results
    
    def _evaluate_terms_with_llm(self, flagged_terms: List[Dict], 
                                 full_text: str) -> List[Dict]:
        """
        Evaluate flagged terms using LLM context analysis with optimized batch processing.
        
        Args:
            flagged_terms: List of terms from lexicon scan
            full_text: Full text for context
            
        Returns:
            List of evaluated terms with LLM analysis
        """
        evaluated = []
        
        # Prepare terms for batch evaluation
        terms_for_eval = [
            (
                term['term'],
                term['sentence_context'],
                self.detector.get_context_window(
                    full_text, 
                    term['position_start'], 
                    term['position_end']
                )
            )
            for term in flagged_terms
        ]
        
        # Use optimized batch evaluation with parallel processing
        try:
            evaluations = self.context_analyzer.batch_evaluate(terms_for_eval)
        except Exception as e:
            print(f"Batch evaluation failed: {e}")
            # Create fallback evaluations
            evaluations = [{
                'is_ambiguous': True,
                'confidence': 0.7,
                'reasoning': 'Evaluation failed, flagged by lexicon'
            }] * len(flagged_terms)
        
        # Filter to only ambiguous terms for suggestion generation
        ambiguous_indices = [
            i for i, eval_result in enumerate(evaluations)
            if eval_result['is_ambiguous']
        ]
        
        # Batch generate suggestions only for ambiguous terms
        suggestions_map = {}
        if ambiguous_indices and self.suggestion_generator:
            ambiguous_terms_data = [
                (
                    flagged_terms[i]['term'],
                    full_text,
                    flagged_terms[i]['sentence_context']
                )
                for i in ambiguous_indices
            ]
            
            try:
                suggestions_results = self.suggestion_generator.batch_generate_complete_analysis(
                    ambiguous_terms_data
                )
                # Map results back to indices
                for idx, result in zip(ambiguous_indices, suggestions_results):
                    suggestions_map[idx] = result
            except Exception as e:
                print(f"Batch suggestion generation failed: {e}")
                # Create fallback suggestions
                for idx in ambiguous_indices:
                    term = flagged_terms[idx]['term']
                    suggestions_map[idx] = {
                        'suggestions': [],
                        'clarification_prompt': f"What specific criteria do you mean by '{term}'?"
                    }
        
        # Combine all results
        for i, (term_data, evaluation) in enumerate(zip(flagged_terms, evaluations)):
            combined = {
                **term_data,
                'is_ambiguous': evaluation['is_ambiguous'],
                'confidence': evaluation['confidence'],
                'reasoning': evaluation['reasoning']
            }
            
            # Add suggestions if available
            if i in suggestions_map:
                combined['suggested_replacements'] = suggestions_map[i]['suggestions']
                combined['clarification_prompt'] = suggestions_map[i]['clarification_prompt']
            else:
                combined['suggested_replacements'] = []
                combined['clarification_prompt'] = ""
            
            evaluated.append(combined)
        
        return evaluated
    
    def _create_lexicon_only_terms(self, flagged_terms: List[Dict]) -> List[Dict]:
        """
        Create term data for lexicon-only mode (no LLM).
        
        Args:
            flagged_terms: List of terms from lexicon scan
            
        Returns:
            List of terms with default values
        """
        lexicon_terms = []
        
        for term_data in flagged_terms:
            lexicon_terms.append({
                **term_data,
                'is_ambiguous': True,  # Assume ambiguous in lexicon-only mode
                'confidence': 0.7,  # Default confidence
                'reasoning': 'Flagged by lexicon (LLM analysis not available)',
                'suggested_replacements': [],
                'clarification_prompt': f"What specific, measurable criteria do you mean by '{term_data['term']}'?"
            })
        
        return lexicon_terms
    
    def _save_analysis_to_db(self, text: str, requirement_id: Optional[int],
                            owner_id: Optional[str],
                            ambiguous_terms: List[Dict]) -> AmbiguityAnalysis:
        """
        Save analysis results to database.
        
        Args:
            text: Original text analyzed
            requirement_id: Optional requirement ID
            owner_id: User ID
            ambiguous_terms: List of ambiguous terms found
            
        Returns:
            Saved AmbiguityAnalysis object
        """
        # Create analysis record
        analysis = AmbiguityAnalysis(
            requirement_id=requirement_id,
            owner_id=owner_id,
            original_text=text,
            analyzed_at=datetime.utcnow(),
            total_terms_flagged=len(ambiguous_terms),
            terms_resolved=0,
            status='pending' if ambiguous_terms else 'completed'
        )
        
        db.session.add(analysis)
        db.session.flush()  # Get analysis ID
        
        # Create term records
        for term_data in ambiguous_terms:
            term = AmbiguousTerm(
                analysis_id=analysis.id,
                term=term_data['term'],
                position_start=term_data['position_start'],
                position_end=term_data['position_end'],
                sentence_context=term_data['sentence_context'],
                is_ambiguous=term_data['is_ambiguous'],
                confidence=term_data['confidence'],
                reasoning=term_data.get('reasoning', ''),
                clarification_prompt=term_data.get('clarification_prompt', ''),
                suggested_replacements=term_data.get('suggested_replacements', []),
                status='pending',
                created_at=datetime.utcnow()
            )
            db.session.add(term)
        
        db.session.commit()
        
        print(f"Analysis saved to database (ID: {analysis.id})")
        
        return analysis
    
    def get_analysis(self, analysis_id: int, 
                    owner_id: Optional[str] = None) -> Optional[AmbiguityAnalysis]:
        """
        Retrieve an analysis by ID.
        
        Args:
            analysis_id: ID of analysis to retrieve
            owner_id: User ID for authorization
            
        Returns:
            AmbiguityAnalysis object or None if not found
        """
        analysis = AmbiguityAnalysis.query.filter_by(id=analysis_id).first()
        
        if not analysis:
            return None
        
        # Check authorization
        if owner_id and analysis.owner_id != owner_id:
            return None
        
        return analysis
    
    def retry_with_llm(self, analysis_id: int, 
                      owner_id: Optional[str] = None) -> AmbiguityAnalysis:
        """
        Retry analysis with LLM for a lexicon-only analysis.
        
        Args:
            analysis_id: ID of existing analysis
            owner_id: User ID for authorization
            
        Returns:
            Updated AmbiguityAnalysis object
            
        Raises:
            ValueError: If analysis not found or LLM not available
        """
        if not self.llm_available:
            raise ValueError("LLM is not available")
        
        # Get existing analysis
        analysis = self.get_analysis(analysis_id, owner_id)
        
        if not analysis:
            raise ValueError(f"Analysis {analysis_id} not found")
        
        # Delete old analysis
        db.session.delete(analysis)
        db.session.commit()
        
        # Run new analysis with LLM
        return self.run_analysis(
            text=analysis.original_text,
            requirement_id=analysis.requirement_id,
            owner_id=owner_id,
            use_llm=True
        )
    
    def get_performance_stats(self) -> Dict:
        """
        Get performance statistics for batch processing and API usage.
        
        Returns:
            Dictionary with performance metrics
        """
        stats = {
            'llm_available': self.llm_available
        }
        
        if self.llm_available:
            if self.context_analyzer:
                stats['context_analyzer'] = self.context_analyzer.get_request_stats()
            if self.suggestion_generator:
                stats['suggestion_generator'] = self.suggestion_generator.get_request_stats()
        
        return stats
