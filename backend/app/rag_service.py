import os
import json
import re
from pydantic import ValidationError
from sqlalchemy import text
import threading  
from pydantic import ValidationError
from sqlalchemy import text
from flask import current_app
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_postgres.vectorstores import PGVector
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

from .prompts import get_requirements_generation_prompt, get_summary_generation_prompt
from .schemas import GeneratedRequirements, MeetingSummary
from .database_ops import save_requirements_to_db
# Import db and models for clearing tables and looping docs
from .main import db
from .models import Document, Requirement, Tag, ProjectSummary

COLLECTION_NAME = "document_chunks"

# --- NEW: Default query for automated requirement generation ---
DEFAULT_REQUIREMENTS_QUERY = """
Analyze the provided context and extract all functional requirements, non-functional requirements,
and user stories. For each item, provide a unique ID, a descriptive title, a detailed description,
an estimated priority (Low, Medium, High), the requirement_type (Functional, Non-Functional), and a status ('To Do').
Also include relevant tags (e.g., 'Security', 'UI/UX', 'Performance', 'Database').

Structure the output as a JSON object with a single "epics" key. Each epic should contain
a list of "user_stories", and each user story should have "story", "acceptance_criteria",
"priority", 'requirement_type', and "suggested_tags".
"""

def get_vector_store():
    if not os.getenv("OPENAI_API_KEY"):
        raise ValueError("OPENAI_API_KEY is not set in the environment variables.")
    embeddings = OpenAIEmbeddings()
    user = os.getenv("POSTGRES_USER")
    password = os.getenv("POSTGRES_PASSWORD", "")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT")
    dbname = os.getenv("POSTGRES_DB")
    connection = f"postgresql+psycopg://{user}:{password}@{host}:{port}/{dbname}"
    return PGVector(
        embeddings=embeddings,
        collection_name=COLLECTION_NAME,
        connection=connection,
        use_jsonb=True,
    )

def _save_summary_to_db(summary_content: str, owner_id: str):
    """
    Saves a new project summary (as a JSON string), ensuring it's tied to the user.
    """
    try:
        new_summary = ProjectSummary(
            content=summary_content,
            owner_id=owner_id
        )
        db.session.add(new_summary)
        db.session.commit()
        print(f"Successfully saved new summary for owner_id: {owner_id}")
    except Exception as e:
        db.session.rollback()
        print(f"Error saving summary to DB: {e}")
        raise

def _run_summary_generation_in_background(app_context, owner_id: str):
    """
    This function is executed in a separate thread.
    It requires the app_context to access the database and config.
    """
    with app_context:
        print(f"Background summary generation started for owner: {owner_id}...")
        try:
            # 1. This is the slow LLM call, returns a Pydantic object
            summary_object = generate_project_summary(owner_id=owner_id)
            
            # 2. Convert the Pydantic object to a JSON string
            summary_json_string = summary_object.model_dump_json()
            
            # 3. Save the JSON string to the DB
            _save_summary_to_db(summary_json_string, owner_id)
            
            print(f"Background summary generation finished for owner: {owner_id}")
        except Exception as e:
            print(f"Background summary generation FAILED for owner {owner_id}: {e}")

def process_and_store_document(document):
    """
    Processes a document, adds it to RAG, and triggers a
    background summary generation.
    """
    print(f"Starting RAG processing for document ID: {document.id}...")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
    docs = text_splitter.create_documents(
        [document.content],
        metadatas=[{
            "document_id": str(document.id),
            "owner_id": document.owner_id or "public"
        }]
    )
    vector_store = get_vector_store()
    vector_store.add_documents(docs)
    print(f"Successfully processed and stored {len(docs)} chunks for document ID: {document.id}")

    # --- NEW: Trigger background summary generation ---
    try:
        owner_id = document.owner_id
        if owner_id:
            print(f"Triggering background summary generation for owner: {owner_id}")
            # Get the app context from the main thread
            app_context = current_app.app_context()
            
            # Create and start the background thread
            thread = threading.Thread(
                target=_run_summary_generation_in_background,
                args=(app_context, owner_id)
            )
            thread.start()
        else:
            print("Skipping summary generation: Document has no owner_id.")
            
    except Exception as e:
        # Catch errors from starting the thread (e.g., runtime errors)
        print(f"Failed to start summary generation thread: {e}")

# --- NEW: Function to delete document from RAG ---
def delete_document_from_rag(document_id: int):
    """
    Deletes all vector chunks associated with a specific document_id from PGVector.
    """
    print(f"Deleting document ID {document_id} from vector store...")
    try:
        vector_store = get_vector_store()
        
        # Get the collection ID
        collection_uuid = None
        with db.engine.connect() as conn:
            result = conn.execute(
                text("SELECT uuid FROM langchain_pg_collection WHERE name = :name"),
                {"name": COLLECTION_NAME}
            ).first()
            if result:
                collection_uuid = result[0]
        
        if not collection_uuid:
            print(f"Warning: Could not find collection '{COLLECTION_NAME}'. Skipping RAG deletion.")
            return

        # Delete embeddings based on cmetadata filter
        with db.engine.connect() as conn:
            conn.execute(
                text(
                    """
                    DELETE FROM langchain_pg_embedding
                    WHERE collection_id = :collection_id
                    AND cmetadata->>'document_id' = :document_id
                    """
                ),
                {"collection_id": collection_uuid, "document_id": str(document_id)}
            )
            conn.commit()
        print(f"Successfully deleted chunks for document ID {document_id} from RAG.")

    except Exception as e:
        print(f"Error deleting document {document_id} from RAG: {e}")
        # We don't re-raise, as we want to allow DB deletion to proceed
        pass


def clean_llm_output(raw_output: str) -> str:
    """
    Cleans the raw LLM string output by removing markdown code fences
    and extracting only the JSON object.
    """
    match = re.search(r'```(json)?\s*(\{.*?\})\s*```', raw_output, re.DOTALL)
    if match:
        return match.group(2)
    return raw_output.strip()

def _run_rag_validation_loop(
    llm_prompt_func,
    validation_model,
    document_id: int | None = None, # MODIFIED: Now optional
    query: str | None = None,
    owner_id: str | None = None  # NEW: Add owner_id parameter for user scoping
):
    """
    Internal helper to run the core RAG, Validation, and Retry loop.
    Accepts query as optional.
    If document_id is None, retrieves from all documents.
    If owner_id is provided, scopes retrieval to user's documents.
    """
    vector_store = get_vector_store()
    llm = ChatOpenAI(model="gpt-4o", temperature=0.1)

    # --- MODIFIED: Conditional retriever with owner_id scoping ---
    retriever_kwargs = {}
    filter_conditions = {}
    
    if document_id is not None:
        print(f"Scoping retriever to document_id: {document_id}")
        filter_conditions['document_id'] = str(document_id)
    
    if owner_id is not None:
        print(f"Scoping retriever to owner_id: {owner_id}")
        filter_conditions['owner_id'] = owner_id
    elif owner_id is None and document_id is None:
        # For unauthenticated users, scope to public documents
        print("Scoping retriever to public documents")
        filter_conditions['owner_id'] = "public"
    
    if filter_conditions:
        retriever_kwargs['search_kwargs'] = {'filter': filter_conditions}
    else:
        print("Retriever is project-wide (all documents).")
        
    retriever = vector_store.as_retriever(**retriever_kwargs)
    # ---------------------------------------

    error_message = None
    max_retries = 2
    
    # Use a dummy query to retrieve context when running summarization
    rag_query_text = query if query is not None else "GENERATE SUMMARY AND ACTION ITEMS"

    for i in range(max_retries):
        print(f"Analysis attempt {i + 1}...")

        # 1. Prepare the arguments for the prompt function call
        prompt_kwargs = {
            "context": "{context}",
            "error_message": error_message
        }
        
        # Determine if we need to include {input} in the prompt
        if query is not None:
            prompt_kwargs["user_query"] = "{input}"
        
        # 2. Call the prompt function dynamically
        prompt_text = llm_prompt_func(**prompt_kwargs)
        prompt = ChatPromptTemplate.from_template(prompt_text)
        
        def format_docs(docs):
            return "\n\n".join(doc.page_content for doc in docs)

        # 3. Define the LCEL chain
        # The chain starts with a dictionary that provides the 'input' (query text)
        rag_chain = (
            # Input starts as the text needed for the retriever
            RunnablePassthrough()
            # Map the original query to the 'input' key, and run the retriever for 'context'
            | {
                "context": retriever | format_docs, 
                "input": RunnablePassthrough() 
            }
            | prompt
            | llm
            | StrOutputParser()
        )
        
        # 4. Invoke the chain. We pass the rag_query_text (string) directly here.
        # LCEL automatically assigns this string to the input of the first runnable (RunnablePassthrough).
        raw_output = rag_chain.invoke(rag_query_text)

        try:
            cleaned_output = clean_llm_output(raw_output)
            validated_data = validation_model.model_validate_json(cleaned_output)
            print("LLM output cleaned and validated successfully!")
            return validated_data

        except (ValidationError, json.JSONDecodeError) as e:
            print(f"Validation failed on attempt {i + 1}: {e}")
            error_message = str(e)
            if i == max_retries - 1:
                raise Exception("Failed to generate valid JSON after multiple retries.") from e

    raise Exception("An unexpected error occurred in the analysis pipeline.")

def generate_document_requirements(document_id: int, owner_id: str = None):
    """
    Generates requirements for a SINGLE document using the default query.
    
    Args:
        document_id: ID of the document to process
        owner_id: User ID to associate with the requirements (optional)
    """
    print(f"Starting analysis for document ID: {document_id} with default query.")
    
    validated_data = _run_rag_validation_loop(
        llm_prompt_func=get_requirements_generation_prompt,
        validation_model=GeneratedRequirements,
        document_id=document_id,
        query=DEFAULT_REQUIREMENTS_QUERY,
        owner_id=owner_id
    )
    
    # Post-processing: Save to the database with owner_id
    save_requirements_to_db(validated_data, document_id, owner_id)
    return len(validated_data.epics) # Return count of epics, or you could sum user stories

# --- NEW: Project-wide requirements generation ---
def generate_project_requirements(owner_id: str = None):
    """
    Generates requirements for documents in the database, scoped by owner_id if provided.
    This clears existing user requirements first.
    
    Args:
        owner_id: User ID to scope the generation to (optional)
    """
    if owner_id:
        print(f"Starting requirements generation for user: {owner_id}")
    else:
        print("Starting requirements generation for public documents...")
    
    # 1. Clear existing requirements and tags for the user/public scope
    print("Clearing old requirements and tags...")
    try:
        # Order of deletion matters if there are foreign key constraints
        if owner_id:
            # Clear user-specific requirements
            user_requirements = Requirement.query.filter_by(owner_id=owner_id).all()
            for req in user_requirements:
                # Clear tags association for this requirement
                req.tags.clear()
                db.session.delete(req)
        else:
            # Clear public requirements (owner_id is None)
            public_requirements = Requirement.query.filter(Requirement.owner_id.is_(None)).all()
            for req in public_requirements:
                # Clear tags association for this requirement
                req.tags.clear()
                db.session.delete(req)
        
        db.session.commit()
        print(f"Cleared {len(user_requirements if owner_id else public_requirements)} existing requirements")
    except Exception as e:
        db.session.rollback()
        print(f"Error clearing requirements: {e}")
        raise
        
    # 2. Get documents for the user/public scope
    if owner_id:
        all_documents = Document.query.filter_by(owner_id=owner_id).all()
    else:
        all_documents = Document.query.filter(Document.owner_id.is_(None)).all()
    
    if not all_documents:
        print("No documents found to process.")
        return 0
        
    print(f"Found {len(all_documents)} documents to process...")
    total_generated = 0
    
    for doc in all_documents:
        try:
            # Ensure clean session state before each document
            db.session.rollback()
            count = generate_document_requirements(doc.id, owner_id)
            total_generated += count
            print(f"Generated {count} requirement epics for document: {doc.filename}")
        except Exception as e:
            db.session.rollback()
            print(f"Failed to process document {doc.id} ({doc.filename}): {e}")
            # Continue to the next document
            pass
            
    print(f"Requirements generation complete. Total new requirement epics: {total_generated}")
    return total_generated

def generate_project_summary(owner_id: str = None) -> MeetingSummary:
    """
    Generates a single summary from documents, scoped by owner_id if provided.
    
    Args:
        owner_id: User ID to scope the summary to (optional)
        
    Returns:
        A MeetingSummary Pydantic object
    """
    if owner_id:
        print(f"Starting summary generation for user: {owner_id}")
    else:
        print(f"Starting summary generation for public documents...")

    validated_data = _run_rag_validation_loop(
        llm_prompt_func=get_summary_generation_prompt,
        validation_model=MeetingSummary,
        document_id=None,
        query=None,
        owner_id=owner_id
    )
    return validated_data