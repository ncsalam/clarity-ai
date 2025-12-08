import pytest
from unittest.mock import MagicMock, patch, call

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import the service, models, AND create_app
from app.ambiguity_service import AmbiguityService
from app.models import AmbiguityAnalysis, AmbiguousTerm, Requirement
from app.main import create_app

# --- Fixtures ---

@pytest.fixture(scope="module")
def app():
    """Provides a test Flask app context for the module."""
    test_app = create_app()
    test_app.config.update({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
    })
    with test_app.app_context():
        yield test_app

@pytest.fixture
def mock_db_session(app): # <-- Add app dependency
    """Mocks the database session."""
    # Patch with app. prefix
    with patch('app.ambiguity_service.db.session') as mock_session:
        yield mock_session

@pytest.fixture
def mock_components(app): # <-- Add app dependency
    """Mocks all components (LexiconManager, Detector, Analyzer, Generator)."""
    # Patch with app. prefix
    with patch('app.ambiguity_service.LexiconManager') as MockLexicon, \
         patch('app.ambiguity_service.AmbiguityDetector') as MockDetector, \
         patch('app.ambiguity_service.ContextAnalyzer') as MockAnalyzer, \
         patch('app.ambiguity_service.SuggestionGenerator') as MockGenerator, \
         patch('app.ambiguity_service.ChatOpenAI'): # Mock the LLM client
        
        mock_detector_inst = MockDetector.return_value
        mock_analyzer_inst = MockAnalyzer.return_value
        mock_generator_inst = MockGenerator.return_value
        
        yield {
            "lexicon": MockLexicon.return_value,
            "detector": mock_detector_inst,
            "analyzer": mock_analyzer_inst,
            "generator": mock_generator_inst
        }

@pytest.fixture
def service(mock_components, mock_db_session):
    """Provides an AmbiguityService instance with mocked components."""
    # This will init with all mocked components
    service_instance = AmbiguityService()
    service_instance.llm_available = True # Assume LLM is available
    return service_instance

# --- Test Cases ---

class TestAmbiguityService:

    def test_init_llm_failure(self, mock_db_session):
        """Test service init when ChatOpenAI fails."""
        # Patch with app. prefix
        with patch('app.ambiguity_service.ChatOpenAI', side_effect=Exception("API Key Error")):
            # db mock is already active
            service = AmbiguityService()
            
            assert service.llm_available == False
            assert service.context_analyzer is None
            assert service.suggestion_generator is None

    def test_run_analysis_llm_success(self, service, mock_components, mock_db_session):
        """Test full flow with LLM success."""
        detector = mock_components['detector']
        analyzer = mock_components['analyzer']
        generator = mock_components['generator']
        
        # 1. Detector finds terms
        flagged_terms = [{
            'term': 'fast', 'sentence_context': 's1', 
            'position_start': 0, 'position_end': 4
        }]
        detector.analyze_text.return_value = {'flagged_terms': flagged_terms}
        
        # 2. Analyzer confirms ambiguity
        evaluations = [{'is_ambiguous': True, 'confidence': 0.9, 'reasoning': 'vague'}]
        analyzer.batch_evaluate.return_value = evaluations
        
        # 3. Generator provides suggestions
        suggestions = [{
            'suggestions': ['< 200ms'], 
            'clarification_prompt': 'What do you mean?'
        }]
        generator.batch_generate_complete_analysis.return_value = suggestions
        
        # 4. Run analysis
        analysis = service.run_analysis("The system is fast", owner_id="user_123")
        
        # 5. Verify
        detector.analyze_text.assert_called_with("The system is fast", "user_123")
        analyzer.batch_evaluate.assert_called_once()
        generator.batch_generate_complete_analysis.assert_called_once()
        
        # Verify saved data
        mock_db_session.add.call_count == 2 # 1 Analysis, 1 Term
        saved_term = mock_db_session.add.call_args_list[1][0][0]
        assert isinstance(saved_term, AmbiguousTerm)
        assert saved_term.term == 'fast'
        assert saved_term.reasoning == 'vague'
        assert saved_term.suggested_replacements == ['< 200ms']
        
        mock_db_session.commit.assert_called_once()

    def test_run_analysis_llm_off(self, service, mock_components, mock_db_session):
        """Test flow when use_llm=False (lexicon-only mode)."""
        detector = mock_components['detector']
        analyzer = mock_components['analyzer']
        
        # 1. Detector finds terms
        flagged_terms = [{'term': 'fast', 'sentence_context': 's1', 'position_start': 0, 'position_end': 4}]
        detector.analyze_text.return_value = {'flagged_terms': flagged_terms}
        
        # 2. Run analysis
        service.run_analysis("The system is fast", owner_id="user_123", use_llm=False)
        
        # 3. Verify
        # Analyzer should NOT be called
        analyzer.batch_evaluate.assert_not_called()
        
        # Verify saved term has lexicon-only defaults
        saved_term = mock_db_session.add.call_args_list[1][0][0]
        assert saved_term.is_ambiguous == True
        assert "LLM analysis not available" in saved_term.reasoning

    def test_run_analysis_combines_lexicon_and_semantic(self, service, mock_components, mock_db_session):
        """Ensure analysis includes both exact lexicon matches and semantic matches."""
        detector = mock_components['detector']

        # Lexicon detection finds an exact term
        flagged_terms = [{
            'term': 'fast',
            'sentence_context': 'System must be fast to respond',
            'position_start': 11,
            'position_end': 15
        }]
        detector.analyze_text.return_value = {'flagged_terms': flagged_terms}
        detector._segment_sentences.return_value = [("System must be fast to respond", 0, 32)]
        detector._find_sentence_for_position.return_value = "System must be fast to respond"

        # Mock semantic enhancement to return a similar term
        semantic_terms = [{
            'term': 'quick',
            'position_start': 20,
            'position_end': 25,
            'is_exact_match': False,
            'similarity_score': 0.9,
            'matched_lexicon_term': 'fast',
            'detection_method': 'semantic_similarity'
        }]
        service.semantic_enhancement_service = MagicMock()
        service.semantic_enhancement_service.find_semantically_similar_terms.return_value = semantic_terms

        # Disable LLM path to stay in lexicon-only mode
        service.llm_available = False

        # Capture save payload
        with patch.object(service, '_save_analysis_to_db', return_value=AmbiguityAnalysis()) as mock_save:
            service.run_analysis("System must be fast to respond quickly", owner_id="user_123", use_llm=False)

        # Extract ambiguous_terms passed to persistence layer
        saved_terms = mock_save.call_args.kwargs['ambiguous_terms']
        terms_by_label = {t['term']: t for t in saved_terms}

        assert 'fast' in terms_by_label, "Lexicon match should be included"
        assert 'quick' in terms_by_label, "Semantic match should be included"

        assert terms_by_label['fast']['detection_method'] == 'lexicon_exact'
        assert terms_by_label['quick']['detection_method'] == 'semantic_similarity'

    @patch('app.ambiguity_service.Requirement.query') # Patch with app. prefix
    def test_run_requirement_analysis_access_denied(self, mock_req_query, service):
        """Test access denial on a specific requirement."""
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        
        # Mock a requirement owned by someone else
        req = Requirement(id=1, owner_id="other_user", title="Title")
        mock_filter.first.return_value = req
        
        with pytest.raises(ValueError, match="Access denied"):
            service.run_requirement_analysis(1, owner_id="user_123")

    def test_retry_with_llm_success(self, service, mock_db_session):
        """Test successful retry of a lexicon-only analysis."""
        # 1. Mock the existing analysis
        analysis = AmbiguityAnalysis(id=1, requirement_id=10, owner_id="user_123", original_text="Text")
        with patch.object(service, 'get_analysis', return_value=analysis):
            # 2. Mock the new analysis run
            with patch.object(service, 'run_analysis') as mock_run_analysis:
                
                service.retry_with_llm(1, owner_id="user_123")
                
                # 3. Verify old analysis was deleted
                mock_db_session.delete.assert_called_with(analysis)
                mock_db_session.commit.assert_called_once()
                
                # 4. Verify new analysis was run
                mock_run_analysis.assert_called_with(
                    text="Text",
                    requirement_id=10,
                    owner_id="user_123",
                    use_llm=True
                )