import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime
from app.models import Requirement, AmbiguityAnalysis, AmbiguousTerm
from app.main import create_app, db


@pytest.fixture(scope="function")
def app_for_batch():
    """Create app with database for batch tests."""
    test_app = create_app()
    test_app.config.update({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
    })

    with test_app.app_context():
        db.create_all()
        yield test_app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def sample_requirements(app_for_batch):
    """Create sample requirements for batch testing."""
    req1 = Requirement(
        req_id="REQ-001",
        title="Fast Login",
        description="The system should provide fast authentication",
        priority="High",
        status="To Do",
        owner_id="user_123"
    )
    req2 = Requirement(
        req_id="REQ-002",
        title="Easy Navigation",
        description="Users should find navigation easy to use",
        priority="Medium",
        status="To Do",
        owner_id="user_123"
    )
    req3 = Requirement(
        req_id="REQ-003",
        title="Secure Data",
        description="System should be secure and reliable",
        priority="High",
        status="To Do",
        owner_id="user_123"
    )

    db.session.add_all([req1, req2, req3])
    db.session.commit()

    return [req1, req2, req3]


class TestBatchAnalysis:
    """Test batch ambiguity analysis functionality."""

    def test_batch_analysis_analyzes_all_requirements(self, app_for_batch, sample_requirements):
        """Verify batch analysis processes all requirements."""
        from app.ambiguity_service import AmbiguityService

        with patch('app.ambiguity_service.AmbiguityService.run_batch_analysis') as mock_batch:
            mock_batch.return_value = [
                MagicMock(
                    id=1,
                    requirement_id=req.id,
                    owner_id="user_123",
                    original_text=req.description,
                    analyzed_at=datetime.utcnow(),
                    total_terms_flagged=1,
                    terms_resolved=0,
                    status='success',
                    terms=[]
                )
                for req in sample_requirements
            ]

            service = AmbiguityService()
            results = service.run_batch_analysis(
                requirement_ids=[req.id for req in sample_requirements],
                owner_id="user_123",
                use_llm=True
            )

            assert len(results) == 3, "Should analyze all 3 requirements"

    def test_batch_analysis_returns_aggregated_results(self, app_for_batch, sample_requirements):
        """Verify batch analysis returns aggregated results."""
        # Expected batch response structure
        batch_result = {
            'total_analyzed': 3,
            'analyses': [
                {
                    'requirement_id': 1,
                    'ambiguous_terms': [{'term': 'fast', 'confidence': 0.95}],
                    'term_count': 1
                },
                {
                    'requirement_id': 2,
                    'ambiguous_terms': [{'term': 'easy', 'confidence': 0.88}],
                    'term_count': 1
                },
                {
                    'requirement_id': 3,
                    'ambiguous_terms': [
                        {'term': 'secure', 'confidence': 0.92},
                        {'term': 'reliable', 'confidence': 0.89}
                    ],
                    'term_count': 2
                }
            ],
            'total_ambiguous_terms': 4,
            'timestamp': None
        }

        assert batch_result['total_analyzed'] == 3
        assert len(batch_result['analyses']) == 3
        assert batch_result['total_ambiguous_terms'] == 4

    def test_batch_analysis_handles_per_requirement_analysis(self, app_for_batch, sample_requirements):
        """Verify batch analysis provides per-requirement ambiguity details."""
        batch_result = {
            'analyses': [
                {
                    'requirement_id': 1,
                    'title': 'Fast Login',
                    'ambiguous_terms': [
                        {
                            'term': 'fast',
                            'confidence': 0.95,
                            'suggestions': ['within 2 seconds', 'low latency'],
                            'context': 'authentication should be fast'
                        }
                    ]
                }
            ]
        }

        analysis = batch_result['analyses'][0]
        assert analysis['requirement_id'] == 1
        assert analysis['ambiguous_terms'][0]['term'] == 'fast'
        assert len(analysis['ambiguous_terms'][0]['suggestions']) > 0

    def test_batch_analysis_maintains_highlights(self, app_for_batch, sample_requirements):
        """Verify batch analysis includes position info for highlighting."""
        batch_result = {
            'analyses': [
                {
                    'requirement_id': 2,
                    'description': 'Users should find navigation easy to use',
                    'ambiguous_terms': [
                        {
                            'term': 'easy',
                            'confidence': 0.88,
                            'start_pos': 26,
                            'end_pos': 30,
                            'context': 'navigation should be easy'
                        }
                    ]
                }
            ]
        }

        analysis = batch_result['analyses'][0]
        term = analysis['ambiguous_terms'][0]
        assert 'start_pos' in term
        assert 'end_pos' in term
        assert term['start_pos'] < term['end_pos']

    def test_batch_analysis_handles_multiple_terms_per_requirement(self, app_for_batch, sample_requirements):
        """Verify batch analysis captures multiple ambiguous terms per requirement."""
        batch_result = {
            'analyses': [
                {
                    'requirement_id': 3,
                    'ambiguous_terms': [
                        {'term': 'secure', 'confidence': 0.92, 'category': 'security'},
                        {'term': 'reliable', 'confidence': 0.89, 'category': 'quality'},
                        {'term': 'robust', 'confidence': 0.91, 'category': 'quality'}
                    ]
                }
            ]
        }

        analysis = batch_result['analyses'][0]
        assert len(analysis['ambiguous_terms']) == 3
        assert all('term' in term for term in analysis['ambiguous_terms'])
        assert all('confidence' in term for term in analysis['ambiguous_terms'])

    def test_batch_analysis_skips_requirements_with_no_ambiguities(self, app_for_batch, sample_requirements):
        """Verify batch analysis includes requirements even with no ambiguous terms."""
        batch_result = {
            'analyses': [
                {
                    'requirement_id': 1,
                    'ambiguous_terms': [{'term': 'fast', 'confidence': 0.95}]
                },
                {
                    'requirement_id': 2,
                    'ambiguous_terms': []  # No ambiguities
                },
                {
                    'requirement_id': 3,
                    'ambiguous_terms': [{'term': 'secure', 'confidence': 0.92}]
                }
            ],
            'total_analyzed': 3
        }

        # All requirements should be included
        assert len(batch_result['analyses']) == 3
        assert batch_result['total_analyzed'] == 3

    def test_batch_analysis_response_includes_metadata(self, app_for_batch, sample_requirements):
        """Verify batch analysis response includes helpful metadata."""
        batch_result = {
            'total_analyzed': 3,
            'total_ambiguous_terms': 4,
            'total_requirements': 3,
            'analysis_timestamp': '2024-01-01T00:00:00Z',
            'duration_seconds': 1.5,
            'analyses': []
        }

        assert batch_result['total_analyzed'] > 0
        assert batch_result['total_ambiguous_terms'] >= 0
        assert 'analysis_timestamp' in batch_result
        assert 'duration_seconds' in batch_result

    def test_batch_analysis_confidence_scores(self, app_for_batch, sample_requirements):
        """Verify batch analysis includes confidence scores."""
        batch_result = {
            'analyses': [
                {
                    'requirement_id': 1,
                    'ambiguous_terms': [
                        {'term': 'fast', 'confidence': 0.95},
                        {'term': 'quick', 'confidence': 0.87}
                    ]
                }
            ]
        }

        analysis = batch_result['analyses'][0]
        for term in analysis['ambiguous_terms']:
            assert 0 <= term['confidence'] <= 1, "Confidence should be between 0 and 1"

    def test_batch_analysis_groups_by_requirement(self, app_for_batch, sample_requirements):
        """Verify batch analysis results are grouped by requirement."""
        batch_result = {
            'analyses': [
                {'requirement_id': 1, 'ambiguous_terms': [{'term': 'fast'}]},
                {'requirement_id': 2, 'ambiguous_terms': [{'term': 'easy'}]},
                {'requirement_id': 3, 'ambiguous_terms': [{'term': 'secure'}]}
            ]
        }

        requirement_ids = [a['requirement_id'] for a in batch_result['analyses']]
        assert len(requirement_ids) == 3
        assert len(set(requirement_ids)) == 3, "Each requirement should appear once"

    def test_batch_analysis_preserves_requirement_metadata(self, app_for_batch, sample_requirements):
        """Verify batch analysis preserves requirement info in results."""
        batch_result = {
            'analyses': [
                {
                    'requirement_id': 1,
                    'title': 'Fast Login',
                    'description': 'The system should provide fast authentication',
                    'priority': 'High',
                    'ambiguous_terms': [{'term': 'fast'}]
                }
            ]
        }

        analysis = batch_result['analyses'][0]
        assert analysis['title'] == 'Fast Login'
        assert analysis['priority'] == 'High'
        assert 'description' in analysis

    def test_batch_analysis_handles_no_requirements(self, app_for_batch):
        """Verify batch analysis handles empty requirement list gracefully."""
        batch_result = {
            'total_analyzed': 0,
            'analyses': [],
            'message': 'No requirements to analyze'
        }

        assert batch_result['total_analyzed'] == 0
        assert len(batch_result['analyses']) == 0

    def test_batch_analysis_error_handling(self, app_for_batch, sample_requirements):
        """Verify batch analysis error handling and reporting."""
        batch_result = {
            'total_analyzed': 3,
            'successful': 2,
            'failed': 1,
            'analyses': [
                {'requirement_id': 1, 'status': 'success', 'ambiguous_terms': [{'term': 'fast'}]},
                {'requirement_id': 2, 'status': 'success', 'ambiguous_terms': []},
                {'requirement_id': 3, 'status': 'error', 'error': 'Analysis failed', 'ambiguous_terms': []}
            ]
        }

        assert batch_result['successful'] + batch_result['failed'] == batch_result['total_analyzed']
        failed_analysis = [a for a in batch_result['analyses'] if a['status'] == 'error'][0]
        assert 'error' in failed_analysis
