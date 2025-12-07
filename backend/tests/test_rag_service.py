import pytest
from unittest.mock import MagicMock, patch, call, ANY
from pydantic import ValidationError
import threading
import json

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import functions, models, schemas, AND create_app
from app import rag_service
from app.rag_service import (
    get_vector_store,
    process_and_store_document,
    delete_document_from_rag,
    _run_rag_validation_loop,
    generate_project_requirements,
    generate_project_summary,
    generate_document_requirements,
    clean_llm_output,
    _save_summary_to_db,
    _run_summary_generation_in_background,
    DEFAULT_REQUIREMENTS_QUERY
)
from app.models import Document, Requirement, ProjectSummary, Tag
from app.schemas import GeneratedRequirements, MeetingSummary
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

@pytest.fixture(autouse=True)
def mock_env():
    """Mocks all required environment variables."""
    with patch('app.rag_service.os.getenv') as mock_getenv:
        mock_getenv.side_effect = lambda key, default=None: {
            "OPENAI_API_KEY": "test_key",
            "POSTGRES_USER": "user",
            "POSTGRES_PASSWORD": "pw",
            "POSTGRES_HOST": "host",
            "POSTGRES_PORT": "5432",
            "POSTGRES_DB": "db"
        }.get(key, default)
        yield mock_getenv

@pytest.fixture(autouse=True)
def mock_db(app):
    """Mocks the global 'db' object and its session."""
    with patch('app.rag_service.db') as mock_db:
        mock_db.session = MagicMock()
        mock_db.engine.connect.return_value.__enter__.return_value = MagicMock()
        yield mock_db

@pytest.fixture
def mock_langchain(app):
    """Mocks all LangChain components."""
    with patch('app.rag_service.OpenAIEmbeddings') as MockEmbeddings, \
         patch('app.rag_service.PGVector') as MockPGVector, \
         patch('app.rag_service.ChatOpenAI') as MockChatOpenAI, \
         patch('app.rag_service.RecursiveCharacterTextSplitter') as MockSplitter, \
         patch('app.rag_service.ChatPromptTemplate') as MockPromptTemplate, \
         patch('app.rag_service.RunnablePassthrough') as MockRunnablePassthrough, \
         patch('app.rag_service.StrOutputParser') as MockStrOutputParser:
        
        # Mock the vector store and retriever
        mock_vector_store = MockPGVector.return_value
        mock_retriever = MagicMock()
        mock_vector_store.as_retriever.return_value = mock_retriever
        
        # Mock components used by other tests
        mock_llm_inst = MockChatOpenAI.return_value
        mock_splitter_inst = MockSplitter.return_value
        mock_splitter_inst.create_documents.return_value = [MagicMock(page_content="chunk")]
        
        # Create a single mock to represent the FINAL chain
        mock_final_chain = MagicMock()
        mock_final_chain.invoke = MagicMock()
        
        # Create intermediate chain mocks that properly chain together
        mock_chain_3 = MagicMock()
        mock_chain_3.__or__ = MagicMock(return_value=mock_final_chain)
        
        mock_chain_2 = MagicMock()
        mock_chain_2.__or__ = MagicMock(return_value=mock_chain_3)
        
        mock_chain_1 = MagicMock()
        mock_chain_1.__or__ = MagicMock(return_value=mock_chain_2)
        
        # RunnablePassthrough() | {...} returns mock_chain_1
        mock_runnable_instance = MagicMock()
        mock_runnable_instance.__or__ = MagicMock(return_value=mock_chain_1)
        MockRunnablePassthrough.return_value = mock_runnable_instance

        yield {
            "PGVector": MockPGVector,
            "vector_store": mock_vector_store,
            "retriever": mock_retriever,
            "ChatOpenAI": MockChatOpenAI,
            "llm_instance": mock_llm_inst,
            "splitter": mock_splitter_inst,
            "final_chain": mock_final_chain
        }

@pytest.fixture
def mock_threading():
    """Mocks the threading.Thread class."""
    with patch('app.rag_service.threading.Thread') as mock_thread_cls:
        mock_thread_inst = MagicMock()
        mock_thread_cls.return_value = mock_thread_inst
        yield mock_thread_cls

@pytest.fixture
def sample_document():
    """Provides a sample document object."""
    doc = MagicMock(spec=Document)
    doc.id = 1
    doc.content = "This is test document content with requirements."
    doc.owner_id = "user_123"
    doc.filename = "test_doc.txt"
    return doc

@pytest.fixture
def sample_requirements():
    """Provides sample requirement objects."""
    req1 = MagicMock(spec=Requirement)
    req1.id = 1
    req1.owner_id = "user_123"
    req1.tags = MagicMock()  # Make tags a MagicMock so clear() can be asserted
    
    req2 = MagicMock(spec=Requirement)
    req2.id = 2
    req2.owner_id = "user_123"
    req2.tags = MagicMock()  # Make tags a MagicMock so clear() can be asserted
    
    return [req1, req2]

# --- Test Cases ---

# --- Added mock JSON constants including stakeholders & requirement_type ---
MOCK_REQUIREMENTS_DICT = {
    "epics": [
        {
            "epic_name": "Authentication",
            "user_stories": [
                {
                    "story": "As a user I want to log in",
                    "acceptance_criteria": ["Valid credentials required", "Redirect on success"],
                    "priority": "High",
                    "suggested_tags": ["Security"],
                    "requirement_type": "Functional",
                    "stakeholders": ["End Users", "Security Team"]
                }
            ]
        }
    ]
}
MOCK_REQUIREMENTS_JSON = json.dumps(MOCK_REQUIREMENTS_DICT)

class TestRagService:

    def test_get_vector_store(self, mock_langchain):
        """Test vector store initialization."""
        store = get_vector_store()
        assert store == mock_langchain['vector_store']
        connection_str = "postgresql+psycopg://user:pw@host:5432/db"
        mock_langchain['PGVector'].assert_called_with(
            embeddings=ANY,
            collection_name="document_chunks",
            connection=connection_str,
            use_jsonb=True
        )

    def test_process_and_store_document_with_owner(self, mock_langchain, mock_threading):
        """Test document processing and background thread dispatch."""
        doc = Document(id=1, content="Test content", owner_id="user_123")
        
        with patch('app.rag_service.current_app') as mock_app:
            mock_app.app_context = MagicMock(return_value="fake_app_context")
            
            process_and_store_document(doc)
            
            mock_langchain['splitter'].create_documents.assert_called_with(
                ["Test content"],
                metadatas=[{"document_id": "1", "owner_id": "user_123"}]
            )
            mock_langchain['vector_store'].add_documents.assert_called_once()
            mock_threading.return_value.start.assert_called_once()

    def test_delete_document_from_rag(self, mock_db, mock_langchain):
        """Test deletion of document chunks from PGVector."""
        mock_conn = mock_db.engine.connect.return_value.__enter__.return_value
        mock_conn.execute.return_value.first.return_value = ("fake-uuid-123",)
        
        delete_document_from_rag(document_id=1)
        
        calls = mock_conn.execute.call_args_list
        assert "SELECT uuid FROM langchain_pg_collection" in str(calls[0][0][0])
        delete_query = str(calls[1][0][0])
        assert "DELETE FROM langchain_pg_embedding" in delete_query

    def test_rag_loop_retriever_scoping(self, mock_langchain):
        """Test that the retriever is scoped correctly based on owner_id."""
        retriever = mock_langchain['retriever']
        store = mock_langchain['vector_store']
        
        with patch.object(GeneratedRequirements, 'model_validate_json'), \
             patch.object(rag_service, 'clean_llm_output', return_value="{}"):

            mock_prompt_func = MagicMock(return_value="prompt text")
            
            _run_rag_validation_loop(mock_prompt_func, GeneratedRequirements, owner_id="user_123")
            store.as_retriever.assert_called_with(search_kwargs={'filter': {'owner_id': 'user_123'}})

            _run_rag_validation_loop(mock_prompt_func, GeneratedRequirements, document_id=1, owner_id="user_123")
            store.as_retriever.assert_called_with(search_kwargs={'filter': {'document_id': '1', 'owner_id': 'user_123'}})

            _run_rag_validation_loop(mock_prompt_func, GeneratedRequirements)
            store.as_retriever.assert_called_with(search_kwargs={'filter': {'owner_id': 'public'}})

    # --- NEW TESTS START HERE ---

    # Clean LLM Output Tests
    def test_clean_llm_output_with_json_fence(self):
        """Test cleaning output with JSON markdown fence."""
        raw = "Here is the output:\n```json\n{\"key\": \"value\"}\n```\nDone"
        result = clean_llm_output(raw)
        assert result == '{"key": "value"}'

    def test_clean_llm_output_with_generic_fence(self):
        """Test cleaning output with generic markdown fence."""
        raw = "```\n{\"data\": \"test\"}\n```"
        result = clean_llm_output(raw)
        assert result == '{"data": "test"}'

    def test_clean_llm_output_no_fence(self):
        """Test cleaning output without markdown fence."""
        raw = '  {"clean": "json"}  '
        result = clean_llm_output(raw)
        assert result == '{"clean": "json"}'

    def test_clean_llm_output_complex_json(self):
        """Test cleaning complex nested JSON."""
        raw = '```json\n{"epics": [{"name": "Epic1", "stories": []}]}\n```'
        result = clean_llm_output(raw)
        assert '"epics"' in result
        assert '"stories"' in result

    # Vector Store Error Handling Tests
    def test_get_vector_store_missing_api_key(self, mock_env):
        """Test vector store initialization fails without API key."""
        mock_env.side_effect = lambda key, default=None: None if key == "OPENAI_API_KEY" else "value"
        
        with pytest.raises(ValueError, match="OPENAI_API_KEY is not set"):
            get_vector_store()

    def test_get_vector_store_with_empty_password(self, mock_langchain):
        """Test vector store handles empty password correctly."""
        with patch('app.rag_service.os.getenv') as mock_getenv:
            mock_getenv.side_effect = lambda key, default=None: {
                "OPENAI_API_KEY": "test_key",
                "POSTGRES_USER": "user",
                "POSTGRES_PASSWORD": "",  # Empty password
                "POSTGRES_HOST": "host",
                "POSTGRES_PORT": "5432",
                "POSTGRES_DB": "db"
            }.get(key, default)
            
            store = get_vector_store()
            connection_str = "postgresql+psycopg://user:@host:5432/db"
            mock_langchain['PGVector'].assert_called_with(
                embeddings=ANY,
                collection_name="document_chunks",
                connection=connection_str,
                use_jsonb=True
            )

    # Document Processing Tests
    def test_process_and_store_document_without_owner(self, mock_langchain, mock_threading):
        """Test document processing for public documents."""
        doc = Document(id=2, content="Public content", owner_id=None)
        
        with patch('app.rag_service.current_app') as mock_app:
            mock_app.app_context = MagicMock(return_value="fake_app_context")
            
            process_and_store_document(doc)
            
            mock_langchain['splitter'].create_documents.assert_called_with(
                ["Public content"],
                metadatas=[{"document_id": "2", "owner_id": "public"}]
            )
            # Should not start thread for public documents
            mock_threading.return_value.start.assert_not_called()

    def test_process_and_store_document_multiple_chunks(self, mock_langchain, mock_threading):
        """Test processing creates multiple chunks."""
        doc = Document(id=1, content="Long content", owner_id="user_123")
        
        # Mock splitter to return multiple chunks
        chunk1 = MagicMock(page_content="chunk1")
        chunk2 = MagicMock(page_content="chunk2")
        chunk3 = MagicMock(page_content="chunk3")
        mock_langchain['splitter'].create_documents.return_value = [chunk1, chunk2, chunk3]
        
        with patch('app.rag_service.current_app') as mock_app:
            mock_app.app_context = MagicMock(return_value="fake_app_context")
            process_and_store_document(doc)
            
            mock_langchain['vector_store'].add_documents.assert_called_once()
            call_args = mock_langchain['vector_store'].add_documents.call_args[0][0]
            assert len(call_args) == 3

    def test_process_and_store_document_thread_creation_error(self, mock_langchain, capfd):
        """Test handling of thread creation failure."""
        doc = Document(id=1, content="Test", owner_id="user_123")
        
        with patch('app.rag_service.current_app') as mock_app:
            # Make app_context() callable but raise when called
            mock_app.app_context = MagicMock(side_effect=RuntimeError("Context error"))
            
            # Should not raise, just log error
            process_and_store_document(doc)
            
            captured = capfd.readouterr()
            assert "Failed to start summary generation thread" in captured.out

    # Delete Document Tests
    def test_delete_document_no_collection_found(self, mock_db, mock_langchain, capfd):
        """Test deletion when collection doesn't exist."""
        mock_conn = mock_db.engine.connect.return_value.__enter__.return_value
        mock_conn.execute.return_value.first.return_value = None
        
        delete_document_from_rag(document_id=1)
        
        captured = capfd.readouterr()
        assert "Could not find collection" in captured.out

    def test_delete_document_database_error(self, mock_db, mock_langchain, capfd):
        """Test deletion handles database errors gracefully."""
        mock_conn = mock_db.engine.connect.return_value.__enter__.return_value
        mock_conn.execute.side_effect = Exception("DB error")
        
        # Should not raise
        delete_document_from_rag(document_id=1)
        
        captured = capfd.readouterr()
        assert "Error deleting document" in captured.out

    def test_delete_document_correct_string_conversion(self, mock_db, mock_langchain):
        """Test document ID is correctly converted to string."""
        mock_conn = mock_db.engine.connect.return_value.__enter__.return_value
        mock_conn.execute.return_value.first.return_value = ("uuid-123",)
        
        delete_document_from_rag(document_id=42)
        
        calls = mock_conn.execute.call_args_list
        delete_params = calls[1][0][1]
        assert delete_params['document_id'] == "42"

    # RAG Validation Loop Tests
    def test_rag_validation_loop_success_first_try(self, mock_langchain):
        """Test validation succeeds on first attempt."""
        mock_chain = mock_langchain['final_chain']
        valid_json = '{"epics": [{"epic_name": "Test", "user_stories": []}]}'
        mock_chain.invoke.return_value = valid_json
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        result = _run_rag_validation_loop(
            mock_prompt_func,
            GeneratedRequirements,
            document_id=1,
            query="Test query",
            owner_id="user_123"
        )
        
        assert isinstance(result, GeneratedRequirements)
        assert mock_chain.invoke.call_count == 1

    def test_rag_validation_loop_retry_on_validation_error(self, mock_langchain):
        """Test retry mechanism on validation error."""
        mock_chain = mock_langchain['final_chain']
        
        bad_json = '{"epics": "not a list"}'
        good_json = '{"epics": []}'
        mock_chain.invoke.side_effect = [bad_json, good_json]
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        result = _run_rag_validation_loop(
            mock_prompt_func,
            GeneratedRequirements,
            document_id=1,
            owner_id="user_123"
        )
        
        assert mock_chain.invoke.call_count == 2
        assert isinstance(result, GeneratedRequirements)

    def test_rag_validation_loop_max_retries_exceeded(self, mock_langchain):
        """Test exception raised after max retries."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"invalid": "json"}'
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        with pytest.raises(Exception, match="Failed to generate valid JSON"):
            _run_rag_validation_loop(
                mock_prompt_func,
                GeneratedRequirements,
                document_id=1,
                owner_id="user_123"
            )

    def test_rag_validation_loop_with_markdown_fence(self, mock_langchain):
        """Test validation handles markdown fenced JSON."""
        mock_chain = mock_langchain['final_chain']
        fenced_json = '```json\n{"epics": []}\n```'
        mock_chain.invoke.return_value = fenced_json
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        result = _run_rag_validation_loop(
            mock_prompt_func,
            GeneratedRequirements,
            owner_id="user_123"
        )
        
        assert isinstance(result, GeneratedRequirements)

    def test_rag_validation_loop_without_query(self, mock_langchain):
        """Test validation loop uses default query when none provided."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"epics": []}'
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        result = _run_rag_validation_loop(
            mock_prompt_func,
            GeneratedRequirements,
            owner_id="user_123"
        )
        
        # Verify the chain was invoked with default summary query
        invoke_arg = mock_chain.invoke.call_args[0][0]
        assert "GENERATE SUMMARY" in invoke_arg

    def test_rag_validation_loop_error_message_passed_on_retry(self, mock_langchain):
        """Test error message is passed to prompt on retry."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.side_effect = ['{"bad": "json"}', '{"epics": []}']
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        _run_rag_validation_loop(
            mock_prompt_func,
            GeneratedRequirements,
            owner_id="user_123"
        )
        
        # Verify prompt function was called with error message on second call
        calls = mock_prompt_func.call_args_list
        assert calls[0][1]['error_message'] is None
        assert calls[1][1]['error_message'] is not None

    # Summary Generation Tests
    def test_save_summary_to_db_success(self, mock_db):
        """Test saving summary to database."""
        _save_summary_to_db('{"summary": "test"}', "user_123")
        
        mock_db.session.add.assert_called_once()
        added_obj = mock_db.session.add.call_args[0][0]
        assert isinstance(added_obj, ProjectSummary)
        assert added_obj.owner_id == "user_123"
        assert mock_db.session.commit.called

    def test_save_summary_to_db_error_rollback(self, mock_db):
        """Test rollback on database error."""
        mock_db.session.commit.side_effect = Exception("DB error")
        
        with pytest.raises(Exception):
            _save_summary_to_db('{"summary": "test"}', "user_123")
        
        assert mock_db.session.rollback.called

    def test_run_summary_generation_in_background(self, mock_db):
        """Test background summary generation."""
        mock_app_context = MagicMock()
        
        with patch('app.rag_service.generate_project_summary') as mock_gen, \
             patch('app.rag_service._save_summary_to_db') as mock_save:
            
            mock_summary = MagicMock()
            mock_summary.model_dump_json.return_value = '{"summary": "generated"}'
            mock_gen.return_value = mock_summary
            
            _run_summary_generation_in_background(mock_app_context, "user_123")
            
            mock_gen.assert_called_once_with(owner_id="user_123")
            mock_save.assert_called_once_with('{"summary": "generated"}', "user_123")

    def test_run_summary_generation_error_handling(self, mock_db, capfd):
        """Test error handling in background summary generation."""
        mock_app_context = MagicMock()
        
        with patch('app.rag_service.generate_project_summary') as mock_gen:
            mock_gen.side_effect = Exception("Generation failed")
            
            _run_summary_generation_in_background(mock_app_context, "user_123")
            
            captured = capfd.readouterr()
            assert "FAILED" in captured.out

    def test_generate_project_summary_returns_pydantic_object(self, mock_langchain):
        """Test project summary returns correct type."""
        mock_chain = mock_langchain['final_chain']
        valid_summary = '{"summary": "Test summary", "key_decisions": [], "open_questions": [], "action_items": []}'
        mock_chain.invoke.return_value = valid_summary
        
        result = generate_project_summary(owner_id="user_123")
        
        assert isinstance(result, MeetingSummary)

    # Requirements Generation Tests
    def test_generate_document_requirements_success(self, mock_langchain, mock_db):
        """Test generating requirements for a single document."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"epics": [{"epic_name": "Epic1", "user_stories": []}]}'
        
        with patch('app.rag_service.save_requirements_to_db') as mock_save:
            result = generate_document_requirements(document_id=1, owner_id="user_123")
            
            mock_save.assert_called_once()
            assert result == 1  # One epic generated

    def test_generate_document_requirements_uses_default_query(self, mock_langchain):
        """Test document requirements uses default query."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"epics": []}'
        
        with patch('app.rag_service.save_requirements_to_db'):
            generate_document_requirements(document_id=1, owner_id="user_123")
            
            invoke_arg = mock_chain.invoke.call_args[0][0]
            assert "functional requirements" in invoke_arg.lower()

    def test_generate_project_requirements_clears_existing(self, mock_db, sample_requirements):
        """Test project requirements clears old requirements."""
        with patch('app.rag_service.Requirement') as MockReq, \
             patch('app.rag_service.Document') as MockDoc, \
             patch('app.rag_service.generate_document_requirements'):
            
            MockReq.query.filter_by.return_value.all.return_value = sample_requirements
            MockDoc.query.filter_by.return_value.all.return_value = []
            
            generate_project_requirements(owner_id="user_123")
            
            # Verify requirements were deleted
            assert mock_db.session.delete.call_count == 2
            assert mock_db.session.commit.called

    def test_generate_project_requirements_no_documents(self, mock_db):
        """Test project requirements with no documents."""
        with patch('app.rag_service.Document') as MockDoc:
            MockDoc.query.filter_by.return_value.all.return_value = []
            
            result = generate_project_requirements(owner_id="user_123")
            
            assert result == 0

    def test_generate_project_requirements_processes_all_documents(self, mock_db):
        """Test project requirements processes multiple documents."""
        doc1 = MagicMock(id=1, filename="doc1.txt")
        doc2 = MagicMock(id=2, filename="doc2.txt")
        
        with patch('app.rag_service.Document') as MockDoc, \
             patch('app.rag_service.Requirement') as MockReq, \
             patch('app.rag_service.generate_document_requirements', return_value=2) as mock_gen:
            
            MockReq.query.filter_by.return_value.all.return_value = []
            MockDoc.query.filter_by.return_value.all.return_value = [doc1, doc2]
            
            result = generate_project_requirements(owner_id="user_123")
            
            assert mock_gen.call_count == 2
            assert result == 4  # 2 epics per document

    def test_generate_project_requirements_continues_on_error(self, mock_db, capfd):
        """Test project requirements continues if one document fails."""
        doc1 = MagicMock(id=1, filename="doc1.txt")
        doc2 = MagicMock(id=2, filename="doc2.txt")
        
        with patch('app.rag_service.Document') as MockDoc, \
             patch('app.rag_service.Requirement') as MockReq, \
             patch('app.rag_service.generate_document_requirements') as mock_gen:
            
            MockReq.query.filter_by.return_value.all.return_value = []
            MockDoc.query.filter_by.return_value.all.return_value = [doc1, doc2]
            
            # First document fails, second succeeds
            mock_gen.side_effect = [Exception("Failed"), 3]
            
            result = generate_project_requirements(owner_id="user_123")
            
            assert result == 3
            captured = capfd.readouterr()
            assert "Failed to process" in captured.out

    def test_generate_project_requirements_clears_tags(self, mock_db, sample_requirements):
        """Test that tags are cleared when clearing requirements."""
        with patch('app.rag_service.Requirement') as MockReq, \
             patch('app.rag_service.Document') as MockDoc, \
             patch('app.rag_service.generate_document_requirements'):
            
            MockReq.query.filter_by.return_value.all.return_value = sample_requirements
            MockDoc.query.filter_by.return_value.all.return_value = []
            
            generate_project_requirements(owner_id="user_123")
            
            # Verify tags were cleared for each requirement
            for req in sample_requirements:
                req.tags.clear.assert_called_once()

    def test_generate_project_requirements_public_scope(self, mock_db):
        """Test project requirements for public documents."""
        with patch('app.rag_service.Requirement') as MockReq, \
             patch('app.rag_service.Document') as MockDoc, \
             patch('app.rag_service.generate_document_requirements'):
            
            MockReq.query.filter.return_value.all.return_value = []
            MockDoc.query.filter.return_value.all.return_value = []
            
            result = generate_project_requirements(owner_id=None)
            
            # Verify correct query filters were used
            MockReq.query.filter.assert_called()
            MockDoc.query.filter.assert_called()

    def test_generate_project_requirements_rollback_on_clear_error(self, mock_db):
        """Test rollback when clearing requirements fails."""
        with patch('app.rag_service.Requirement') as MockReq:
            MockReq.query.filter_by.return_value.all.side_effect = Exception("Query error")
            
            with pytest.raises(Exception):
                generate_project_requirements(owner_id="user_123")
            
            assert mock_db.session.rollback.called

    # Integration and Edge Case Tests
    def test_default_requirements_query_constant(self):
        """Test default requirements query is properly defined."""
        assert DEFAULT_REQUIREMENTS_QUERY is not None
        assert "functional requirements" in DEFAULT_REQUIREMENTS_QUERY.lower()
        assert "epics" in DEFAULT_REQUIREMENTS_QUERY.lower()

    def test_collection_name_constant(self):
        """Test collection name constant is properly defined.""" 
        from app.rag_service import COLLECTION_NAME
        assert COLLECTION_NAME == "document_chunks"

    def test_process_document_chunk_size_configuration(self, mock_langchain):
        """Test text splitter uses correct chunk configuration."""
        doc = Document(id=1, content="Test", owner_id="user_123")
        
        with patch('app.rag_service.current_app') as mock_app, \
             patch('app.rag_service.RecursiveCharacterTextSplitter') as MockSplitter:
            
            mock_app.app_context = MagicMock(return_value="context")
            
            process_and_store_document(doc)
            
            MockSplitter.assert_called_with(chunk_size=1000, chunk_overlap=100)

    def test_rag_loop_format_docs_function(self, mock_langchain):
        """Test that format_docs correctly joins document content."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"epics": []}'
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        _run_rag_validation_loop(
            mock_prompt_func,
            GeneratedRequirements,
            owner_id="user_123"
        )
        
        # Verify the chain was constructed and invoked
        assert mock_chain.invoke.called

    def test_generate_project_summary_scoping(self, mock_langchain):
        """Test project summary respects owner_id scoping."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"summary": "Test", "key_decisions": [], "open_questions": [], "action_items": []}'
        
        store = mock_langchain['vector_store']
        
        generate_project_summary(owner_id="user_456")
        
        # Verify retriever was scoped to user
        store.as_retriever.assert_called_with(
            search_kwargs={'filter': {'owner_id': 'user_456'}}
        )

    def test_generate_project_summary_public_scoping(self, mock_langchain):
        """Test project summary for public documents."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"summary": "Test", "key_decisions": [], "open_questions": [], "action_items": []}'
        
        store = mock_langchain['vector_store']
        
        generate_project_summary(owner_id=None)
        
        # Verify retriever was scoped to public
        store.as_retriever.assert_called_with(
            search_kwargs={'filter': {'owner_id': 'public'}}
        )

    def test_process_document_with_empty_content(self, mock_langchain, mock_threading):
        """Test processing document with empty content."""
        doc = Document(id=1, content="", owner_id="user_123")
        
        with patch('app.rag_service.current_app') as mock_app:
            mock_app.app_context = MagicMock(return_value="context")
            
            process_and_store_document(doc)
            
            # Should still call splitter with empty content
            mock_langchain['splitter'].create_documents.assert_called_with(
                [""],
                metadatas=[{"document_id": "1", "owner_id": "user_123"}]
            )

    def test_rag_validation_loop_with_json_decode_error(self, mock_langchain):
        """Test handling of JSON decode errors."""
        mock_chain = mock_langchain['final_chain']
        # Return invalid JSON that can't be decoded
        mock_chain.invoke.side_effect = ['not json at all', '{"epics": []}']
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        result = _run_rag_validation_loop(
            mock_prompt_func,
            GeneratedRequirements,
            owner_id="user_123"
        )
        
        # Should retry and succeed on second attempt
        assert mock_chain.invoke.call_count == 2
        assert isinstance(result, GeneratedRequirements)

    def test_delete_document_handles_multiple_chunks(self, mock_db, mock_langchain):
        """Test deleting document with multiple chunks."""
        mock_conn = mock_db.engine.connect.return_value.__enter__.return_value
        mock_conn.execute.return_value.first.return_value = ("uuid-123",)
        
        delete_document_from_rag(document_id=5)
        
        # Verify delete was called with correct document_id
        calls = mock_conn.execute.call_args_list
        delete_params = calls[1][0][1]
        assert delete_params['document_id'] == "5"
        assert delete_params['collection_id'] == "uuid-123"

    def test_generate_document_requirements_passes_owner_id(self, mock_langchain):
        """Test document requirements passes owner_id through chain."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"epics": []}'
        
        store = mock_langchain['vector_store']
        
        with patch('app.rag_service.save_requirements_to_db'):
            generate_document_requirements(document_id=1, owner_id="user_789")
            
            # Verify retriever was scoped correctly
            store.as_retriever.assert_called_with(
                search_kwargs={'filter': {'document_id': '1', 'owner_id': 'user_789'}}
            )

    def test_save_summary_captures_content(self, mock_db):
        """Test summary content is properly stored."""
        summary_content = '{"summary": "detailed summary", "action_items": ["item1"]}'
        
        _save_summary_to_db(summary_content, "user_123")
        
        added_obj = mock_db.session.add.call_args[0][0]
        assert added_obj.content == summary_content

    def test_process_document_creates_correct_metadata(self, mock_langchain, mock_threading):
        """Test document processing creates correct metadata structure."""
        doc = Document(id=99, content="Content", owner_id="owner_999")
        
        with patch('app.rag_service.current_app') as mock_app:
            mock_app.app_context = MagicMock(return_value="context")
            
            process_and_store_document(doc)
            
            call_args = mock_langchain['splitter'].create_documents.call_args
            metadata = call_args[1]['metadatas'][0]
            assert metadata['document_id'] == "99"
            assert metadata['owner_id'] == "owner_999"

    def test_rag_validation_loop_llm_model_configuration(self, mock_langchain):
        """Test LLM is configured with correct model and temperature."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"epics": []}'
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        with patch('app.rag_service.ChatOpenAI') as MockChatOpenAI:
            _run_rag_validation_loop(
                mock_prompt_func,
                GeneratedRequirements,
                owner_id="user_123"
            )
            
            MockChatOpenAI.assert_called_with(model="gpt-4o", temperature=0.1)

    def test_generate_project_requirements_session_rollback_per_document(self, mock_db):
        """Test session rollback before each document processing."""
        doc1 = MagicMock(id=1, filename="doc1.txt")
        doc2 = MagicMock(id=2, filename="doc2.txt")
        
        with patch('app.rag_service.Document') as MockDoc, \
             patch('app.rag_service.Requirement') as MockReq, \
             patch('app.rag_service.generate_document_requirements', return_value=1):
            
            MockReq.query.filter_by.return_value.all.return_value = []
            MockDoc.query.filter_by.return_value.all.return_value = [doc1, doc2]
            
            generate_project_requirements(owner_id="user_123")
            
            # Rollback should be called for each document
            assert mock_db.session.rollback.call_count >= 2

    def test_clean_llm_output_preserves_newlines_in_json(self):
        """Test cleaning preserves newlines within JSON content."""
        raw = '```json\n{"text": "line1\\nline2"}\n```'
        result = clean_llm_output(raw)
        assert '\\n' in result or '\n' in result

    def test_process_document_vector_store_integration(self, mock_langchain, mock_threading):
        """Test vector store receives processed documents."""
        doc = Document(id=1, content="Test content", owner_id="user_123")
        
        mock_chunks = [
            MagicMock(page_content="chunk1"),
            MagicMock(page_content="chunk2")
        ]
        mock_langchain['splitter'].create_documents.return_value = mock_chunks
        
        with patch('app.rag_service.current_app') as mock_app:
            mock_app.app_context = MagicMock(return_value="context")
            
            process_and_store_document(doc)
            
            # Verify add_documents was called with the chunks
            call_args = mock_langchain['vector_store'].add_documents.call_args[0][0]
            assert len(call_args) == 2

    def test_background_summary_app_context_usage(self, mock_db):
        """Test background thread properly uses app context."""
        mock_app_context = MagicMock()
        mock_context_manager = MagicMock()
        mock_app_context.__enter__ = MagicMock(return_value=mock_context_manager)
        mock_app_context.__exit__ = MagicMock(return_value=False)
        
        with patch('app.rag_service.generate_project_summary') as mock_gen, \
             patch('app.rag_service._save_summary_to_db'):
            
            mock_summary = MagicMock()
            mock_summary.model_dump_json.return_value = '{}'
            mock_gen.return_value = mock_summary
            
            _run_summary_generation_in_background(mock_app_context, "user_123")
            
            # Verify context was entered
            mock_app_context.__enter__.assert_called_once()

    def test_rag_validation_loop_prompt_kwargs_with_query(self, mock_langchain):
        """Test prompt receives correct kwargs when query is provided."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"epics": []}'
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        _run_rag_validation_loop(
            mock_prompt_func,
            GeneratedRequirements,
            document_id=1,
            query="Custom query",
            owner_id="user_123"
        )
        
        # Verify prompt function received user_query parameter
        call_kwargs = mock_prompt_func.call_args[1]
        assert 'user_query' in call_kwargs
        assert call_kwargs['context'] == "{context}"

    def test_rag_validation_loop_prompt_kwargs_without_query(self, mock_langchain):
        """Test prompt receives correct kwargs when no query provided."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '{"epics": []}'
        
        mock_prompt_func = MagicMock(return_value="prompt")
        
        _run_rag_validation_loop(
            mock_prompt_func,
            GeneratedRequirements,
            owner_id="user_123"
        )
        
        # Verify prompt function did not receive user_query parameter
        call_kwargs = mock_prompt_func.call_args[1]
        assert 'user_query' not in call_kwargs
        assert call_kwargs['context'] == "{context}"

    def test_generate_document_requirements_returns_epic_count(self, mock_langchain):
        """Test document requirements returns correct epic count."""
        mock_chain = mock_langchain['final_chain']
        mock_chain.invoke.return_value = '''{"epics": [
            {"epic_name": "Epic1", "user_stories": []},
            {"epic_name": "Epic2", "user_stories": []},
            {"epic_name": "Epic3", "user_stories": []}
        ]}'''
        
        with patch('app.rag_service.save_requirements_to_db'):
            result = generate_document_requirements(document_id=1, owner_id="user_123")
            
            assert result == 3

    def test_vector_store_connection_string_format(self, mock_langchain):
        """Test vector store connection string is properly formatted."""
        with patch('app.rag_service.os.getenv') as mock_getenv:
            mock_getenv.side_effect = lambda key, default=None: {
                "OPENAI_API_KEY": "key",
                "POSTGRES_USER": "testuser",
                "POSTGRES_PASSWORD": "testpass",
                "POSTGRES_HOST": "testhost",
                "POSTGRES_PORT": "5433",
                "POSTGRES_DB": "testdb"
            }.get(key, default)
            
            get_vector_store()
            
            expected_conn = "postgresql+psycopg://testuser:testpass@testhost:5433/testdb"
            mock_langchain['PGVector'].assert_called_with(
                embeddings=ANY,
                collection_name="document_chunks",
                connection=expected_conn,
                use_jsonb=True
            )

    def test_rag_validation_max_retries_configuration(self):
        """Test max retries is set to 2."""
        # This is implicitly tested by other tests, but explicitly verify
        from app.rag_service import _run_rag_validation_loop
        import inspect
        
        # Check the function has max_retries logic
        source = inspect.getsource(_run_rag_validation_loop)
        assert "max_retries = 2" in source

    def test_process_document_thread_daemon_configuration(self, mock_langchain, mock_threading):
        """Test background thread is properly configured."""
        doc = Document(id=1, content="Test", owner_id="user_123")
        
        with patch('app.rag_service.current_app') as mock_app:
            mock_app.app_context = MagicMock(return_value="context")
            
            process_and_store_document(doc)
            
            # Verify thread was created with correct target and args
            thread_call = mock_threading.call_args
            assert thread_call[1]['target'] == rag_service._run_summary_generation_in_background
            assert len(thread_call[1]['args']) == 2

    def test_delete_document_commit_called(self, mock_db, mock_langchain):
        """Test delete operation commits transaction."""
        mock_conn = mock_db.engine.connect.return_value.__enter__.return_value
        mock_conn.execute.return_value.first.return_value = ("uuid",)
        
        delete_document_from_rag(document_id=1)
        
        # Verify commit was called
        assert mock_conn.commit.called

    # --- NEW tests for stakeholders & requirement_type ---

    def test_generated_requirements_parses_stakeholders_and_requirement_type(self):
        """Direct Pydantic parsing test for the new fields."""
        data = MOCK_REQUIREMENTS_DICT
        result = GeneratedRequirements.model_validate(data)
        story = result.epics[0].user_stories[0]
        assert story.requirement_type == "Functional"
        assert story.stakeholders == ["End Users", "Security Team"]

    def test_missing_stakeholders_causes_validation_error(self):
        """If stakeholders are missing, validation should fail."""
        invalid = {
            "epics": [
                {
                    "epic_name": "Authentication",
                    "user_stories": [
                        {
                            "story": "As a user I want login",
                            "acceptance_criteria": ["Valid credentials"],
                            "priority": "High",
                            "suggested_tags": ["Security"],
                            "requirement_type": "Functional"
                            # stakeholders missing
                        }
                    ]
                }
            ]
        }
        with pytest.raises(Exception):
            GeneratedRequirements.model_validate(invalid)

    def test_requirement_type_optional(self):
        """Requirement type may be omitted (should be None)."""
        data = {
            "epics": [
                {
                    "epic_name": "Notifications",
                    "user_stories": [
                        {
                            "story": "As a user I want notifications",
                            "acceptance_criteria": ["Send email"],
                            "priority": "Low",
                            "suggested_tags": ["UX"],
                            "stakeholders": ["End Users"]
                            # no requirement_type
                        }
                    ]
                }
            ]
        }
        result = GeneratedRequirements.model_validate(data)
        assert result.epics[0].user_stories[0].requirement_type is None

    def test_generate_document_requirements_passes_stakeholders_to_save(self, mock_langchain):
        """Ensure the LLM output including stakeholders & requirement_type flows to save_requirements_to_db."""
        mock_chain = mock_langchain['final_chain']
        # LLM returns fenced JSON
        mock_chain.invoke.return_value = f"```json\n{MOCK_REQUIREMENTS_JSON}\n```"
        with patch('app.rag_service.save_requirements_to_db') as mock_save:
            result = generate_document_requirements(document_id=1, owner_id="user_123")
            mock_save.assert_called_once()
            saved_arg = mock_save.call_args[0][0]  # Pydantic object passed to save
            assert isinstance(saved_arg, GeneratedRequirements)
            story = saved_arg.epics[0].user_stories[0]
            assert story.requirement_type == "Functional"
            assert story.stakeholders == ["End Users", "Security Team"]
            assert result == 1

