import pytest
from unittest.mock import MagicMock, patch
import json  # NEW: for building JSON payloads in tests

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.edge_case_service import EdgeCaseService
from app.models import Requirement
from app.main import create_app


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
def service(app):
    """
    Provides an EdgeCaseService instance.
    We'll patch ChatOpenAI and Requirement query at test level.
    """
    return EdgeCaseService()


class TestEdgeCaseService:
    def test_init_llm_failure(self, app):
        """Service should mark llm_available=False if ChatOpenAI init fails."""
        with patch(
            "app.edge_case_service.ChatOpenAI",
            side_effect=Exception("API Key Error"),
        ):
            svc = EdgeCaseService()
            assert svc.llm_available is False
            assert svc.llm_client is None

    @patch("app.edge_case_service.Requirement.query")
    @patch("app.edge_case_service.ChatOpenAI")
    def test_generate_for_requirement_markdown_wrapped_json(
        self,
        mock_chat_openai,
        mock_req_query,
        service,
    ):
        """
        When the LLM returns ```json ... ``` fenced JSON,
        the service should strip the fences, parse JSON,
        and return the 'edge_cases' list.
        """
        # Mock requirement
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        req = Requirement(id=1, owner_id="user_123", title="Title", description="Desc")
        mock_filter.first.return_value = req

        # Mock LLM response object
        llm_response = MagicMock()
        llm_response.content = """```json
{
  "edge_cases": [
    "Attempt to use an expired magic link.",
    "Use the magic link twice."
  ]
}
```"""
        mock_llm_instance = mock_chat_openai.return_value
        mock_llm_instance.invoke.return_value = llm_response

        # Mark LLM as available (in case __init__ was run before)
        service.llm_available = True
        service.llm_client = mock_llm_instance

        # Call service
        edge_cases = service.generate_for_requirement(
            requirement_id=1,
            owner_id="user_123",
            max_cases=5,
        )

        # Should parse into separate strings
        assert isinstance(edge_cases, list)
        assert len(edge_cases) == 2
        assert "Attempt to use an expired magic link." in edge_cases
        assert "Use the magic link twice." in edge_cases

        # Ensure LLM was called with messages
        mock_llm_instance.invoke.assert_called_once()

    @patch("app.edge_case_service.Requirement.query")
    def test_generate_for_requirement_not_found(
        self,
        mock_req_query,
        service,
    ):
        """If the requirement does not exist, a ValueError should be raised."""
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        mock_filter.first.return_value = None

        with pytest.raises(ValueError, match="Requirement with ID 1 not found"):
            service.generate_for_requirement(
                requirement_id=1,
                owner_id="user_123",
            )

    @patch("app.edge_case_service.Requirement.query")
    def test_generate_for_requirement_access_denied(
        self,
        mock_req_query,
        service,
    ):
        """If owner_id does not match, raise ValueError for access denied."""
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        # Requirement owned by someone else
        req = Requirement(id=1, owner_id="other_user", title="Title", description="Desc")
        mock_filter.first.return_value = req

        with pytest.raises(ValueError, match="Access denied"):
            service.generate_for_requirement(
                requirement_id=1,
                owner_id="user_123",
            )

    @patch("app.edge_case_service.Requirement.query")
    def test_generate_for_requirement_no_llm_available(
        self,
        mock_req_query,
        service,
    ):
        """If LLM is not available, return a fallback message."""
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        req = Requirement(id=1, owner_id="user_123", title="Title", description="Desc")
        mock_filter.first.return_value = req

        # Simulate no LLM client
        service.llm_available = False
        service.llm_client = None

        edge_cases = service.generate_for_requirement(
            requirement_id=1,
            owner_id="user_123",
        )

        assert isinstance(edge_cases, list)
        assert len(edge_cases) == 1
        assert "Edge case generation is currently unavailable" in edge_cases[0]

    # ------------------------------------------------------------------
    # NEW TESTS
    # ------------------------------------------------------------------

    @patch("app.edge_case_service.Requirement.query")
    def test_generate_for_requirement_empty_text_raises(
        self,
        mock_req_query,
        service,
    ):
        """
        If both title and description are effectively empty,
        service should raise ValueError about no text to analyze.
        """
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        # Title and description empty/whitespace
        req = Requirement(id=1, owner_id="user_123", title="", description="   ")
        mock_filter.first.return_value = req

        with pytest.raises(ValueError, match="Requirement has no text to analyze"):
            service.generate_for_requirement(
                requirement_id=1,
                owner_id="user_123",
            )

    @patch("app.edge_case_service.Requirement.query")
    def test_generate_for_requirement_llm_invocation_error_fallback(
        self,
        mock_req_query,
        service,
    ):
        """
        If the LLM call itself raises an exception,
        the service should return a friendly error message.
        """
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        req = Requirement(id=1, owner_id="user_123", title="Title", description="Desc")
        mock_filter.first.return_value = req

        # Mark LLM as available but make invoke() raise
        mock_llm = MagicMock()
        mock_llm.invoke.side_effect = Exception("Network error")
        service.llm_available = True
        service.llm_client = mock_llm

        edge_cases = service.generate_for_requirement(
            requirement_id=1,
            owner_id="user_123",
        )

        assert isinstance(edge_cases, list)
        assert len(edge_cases) == 1
        assert "Edge case generation failed due to an LLM error." in edge_cases[0]

    @patch("app.edge_case_service.Requirement.query")
    def test_generate_for_requirement_filters_non_string_and_empty_items(
        self,
        mock_req_query,
        service,
    ):
        """
        The service should only keep non-empty strings from edge_cases list,
        ignoring empty strings, whitespace-only strings, and non-string items.
        """
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        req = Requirement(id=1, owner_id="user_123", title="Title", description="Desc")
        mock_filter.first.return_value = req

        raw_cases = ["  valid  ", "", "   ", 123, None]
        llm_response = MagicMock()
        llm_response.content = json.dumps({"edge_cases": raw_cases})

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = llm_response

        service.llm_available = True
        service.llm_client = mock_llm

        edge_cases = service.generate_for_requirement(
            requirement_id=1,
            owner_id="user_123",
        )

        assert edge_cases == ["valid"]

    @patch("app.edge_case_service.Requirement.query")
    def test_generate_for_requirement_invalid_json_falls_back_to_raw_text(
        self,
        mock_req_query,
        service,
    ):
        """
        If JSON parsing fails, the raw text should be stripped and returned
        as a single edge case entry.
        """
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        req = Requirement(id=1, owner_id="user_123", title="Title", description="Desc")
        mock_filter.first.return_value = req

        raw_text = "   not-json but still content   "
        llm_response = MagicMock()
        llm_response.content = raw_text

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = llm_response

        service.llm_available = True
        service.llm_client = mock_llm

        edge_cases = service.generate_for_requirement(
            requirement_id=1,
            owner_id="user_123",
        )

        assert edge_cases == ["not-json but still content"]

    @patch("app.edge_case_service.Requirement.query")
    def test_generate_for_requirement_empty_edge_cases_list_fallback_message(
        self,
        mock_req_query,
        service,
    ):
        """
        If JSON parses but 'edge_cases' is empty, the service should
        return a default informative message.
        """
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        req = Requirement(id=1, owner_id="user_123", title="Title", description="Desc")
        mock_filter.first.return_value = req

        llm_response = MagicMock()
        llm_response.content = json.dumps({"edge_cases": []})

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = llm_response

        service.llm_available = True
        service.llm_client = mock_llm

        edge_cases = service.generate_for_requirement(
            requirement_id=1,
            owner_id="user_123",
        )

        assert len(edge_cases) == 1
        assert "No edge cases were generated for this requirement." in edge_cases[0]

    @patch("app.edge_case_service.Requirement.query")
    @patch("app.edge_case_service.get_edge_case_generation_prompt")
    def test_generate_for_requirement_uses_prompt_builder_with_max_cases(
        self,
        mock_prompt_builder,
        mock_req_query,
        service,
    ):
        """
        Verify that get_edge_case_generation_prompt is called with the
        combined requirement text and the provided max_cases.
        """
        mock_filter = MagicMock()
        mock_req_query.filter_by.return_value = mock_filter
        req = Requirement(
            id=1,
            owner_id="user_123",
            title="Title",
            description="Desc",
        )
        mock_filter.first.return_value = req

        # Prompt builder returns some prompt string
        mock_prompt_builder.return_value = "EDGE CASE PROMPT"

        # LLM returns a simple valid JSON body
        llm_response = MagicMock()
        llm_response.content = json.dumps({"edge_cases": ["Case 1"]})

        mock_llm = MagicMock()
        mock_llm.invoke.return_value = llm_response

        service.llm_available = True
        service.llm_client = mock_llm

        edge_cases = service.generate_for_requirement(
            requirement_id=1,
            owner_id="user_123",
            max_cases=7,
        )

        # Ensure prompt builder was called with full_text and max_cases
        expected_full_text = "Title\n\nDesc"
        mock_prompt_builder.assert_called_once_with(expected_full_text, max_cases=7)

        # And we still got the parsed result back
        assert edge_cases == ["Case 1"]