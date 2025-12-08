from datetime import datetime
from pydantic import BaseModel, Field, validator, constr, conint
from typing import List, Literal, Optional, Dict

class UserStory(BaseModel):
    """Defines the structure for a single, now classified, user story."""
    story: str = Field(..., description="The user story in the format 'As a...'")
    acceptance_criteria: List[str]
    # New fields for AI-powered classification
    priority: str = Field(..., description="The suggested priority: 'High', 'Medium', or 'Low'.")
    suggested_tags: List[str] = Field(..., description="A list of suggested tags for categorization.")
    requirement_type: Optional[str] = Field(
        None, description="The type/classification of the requirement: 'Functional', 'Non-functional'."
    )
    stakeholders: List[str] = Field(..., description="A list of suggested stakeholders.")


class Epic(BaseModel):
    """Groups a collection of related user stories under a single feature or epic."""
    epic_name: str = Field(..., description="The name of the feature or epic.")
    user_stories: List[UserStory]

class GeneratedRequirements(BaseModel):
    """The top-level JSON object that the LLM must return."""
    epics: List[Epic]

class ActionItem(BaseModel):
    task: str = Field(..., description="A single action item or task identified.")
    assignee: Optional[str] = Field(None, description="The person assigned, if mentioned (e.g., 'Dave', 'Maria').")

class MeetingSummary(BaseModel):
    summary: str = Field(..., description="A concise, high-level summary of the meeting discussion.")
    key_decisions: List[str] = Field(..., description="A list of final decisions made during the meeting.")
    open_questions: List[str] = Field(..., description="A list of topics that were left unresolved or require follow-up.")
    action_items: List[ActionItem]


# --- Ambiguity Detection Schemas ---

class AmbiguityAnalyzeRequest(BaseModel):
    """Schema for ambiguity analysis request"""
    text: constr(min_length=1, max_length=50000) = Field(
        ..., 
        description="Text to analyze for ambiguous terms"
    )
    requirement_id: Optional[conint(gt=0)] = Field(
        None,
        description="Optional requirement ID to associate with analysis"
    )
    use_llm: bool = Field(
        True,
        description="Whether to use LLM for context analysis"
    )
    
    @validator('text')
    def validate_text(cls, v):
        """Validate and sanitize text input"""
        if not v or not v.strip():
            raise ValueError('Text cannot be empty or whitespace only')
        # Remove null bytes and other control characters
        sanitized = ''.join(char for char in v if char.isprintable() or char in '\n\r\t')
        return sanitized.strip()


class AmbiguityAnalyzeRequirementRequest(BaseModel):
    """Schema for analyzing a specific requirement"""
    use_llm: bool = Field(
        True,
        description="Whether to use LLM for context analysis"
    )


class AmbiguityBatchAnalyzeRequest(BaseModel):
    """Schema for batch analysis request"""
    requirement_ids: List[conint(gt=0)] = Field(
        ...,
        min_items=1,
        max_items=100,
        description="List of requirement IDs to analyze (max 100)"
    )
    use_llm: bool = Field(
        True,
        description="Whether to use LLM for context analysis"
    )


class ClarificationSubmitRequest(BaseModel):
    """Schema for submitting clarification"""
    analysis_id: conint(gt=0) = Field(
        ...,
        description="ID of the analysis"
    )
    term_id: conint(gt=0) = Field(
        ...,
        description="ID of the ambiguous term"
    )
    clarified_text: constr(min_length=1, max_length=5000) = Field(
        ...,
        description="Clarified text to replace or append"
    )
    action: Literal['replace', 'append'] = Field(
        'replace',
        description="Action to perform: replace or append"
    )
    
    @validator('clarified_text')
    def validate_clarified_text(cls, v):
        """Validate and sanitize clarified text"""
        if not v or not v.strip():
            raise ValueError('Clarified text cannot be empty')
        # Remove null bytes and control characters
        sanitized = ''.join(char for char in v if char.isprintable() or char in '\n\r\t')
        return sanitized.strip()


class ReportExportRequest(BaseModel):
    """Schema for report export request"""
    requirement_ids: Optional[List[conint(gt=0)]] = Field(
        None,
        max_items=1000,
        description="Optional list of requirement IDs (max 1000)"
    )
    format: Literal['txt', 'md'] = Field(
        'md',
        description="Export format: txt or md"
    )


class LexiconAddRequest(BaseModel):
    """Schema for adding lexicon term"""
    term: constr(min_length=1, max_length=100) = Field(
        ...,
        description="Term to add to lexicon"
    )
    type: Literal['include', 'exclude'] = Field(
        'include',
        description="Type of term: include or exclude"
    )
    category: Optional[constr(max_length=100)] = Field(
        None,
        description="Optional category for the term"
    )
    
    @validator('term')
    def validate_term(cls, v):
        """Validate and sanitize term"""
        if not v or not v.strip():
            raise ValueError('Term cannot be empty')
        # Only allow alphanumeric, spaces, hyphens, and underscores
        sanitized = ''.join(char for char in v if char.isalnum() or char in ' -_')
        sanitized = sanitized.strip()
        if not sanitized:
            raise ValueError('Term must contain at least one alphanumeric character')
        return sanitized.lower()
    
    @validator('category')
    def validate_category(cls, v):
        """Validate and sanitize category"""
        if v is None:
            return v
        sanitized = ''.join(char for char in v if char.isalnum() or char in ' -_')
        return sanitized.strip() if sanitized else None


# 1. Pydantic Schemas for LLM Output (Ensures the AI gives a usable JSON structure)
# This directly maps to the JSON structure requested in the prompts.py file.

class Conflict(BaseModel):
    """
    Defines the structure for a single conflict detected by the LLM. 
    This is used for parsing the LLM's raw JSON response.
    """
    conflict_id: str = Field(..., description="Unique ID for the conflict (e.g., 'C-001').")
    reason: str = Field(..., description="Clear explanation of the logical conflict.")
    conflicting_requirement_ids: List[str] = Field(..., description="List of unique Requirement IDs (e.g., ['R-101', 'R-205']) that are in conflict.")

class ContradictionReportLLM(BaseModel):
    """
    The top-level schema for the LLM's complete contradiction analysis.
    """
    contradictions: List[Conflict] = Field(..., description="A list of all contradiction findings in the analyzed requirements.")


# 2. API Response Schemas (Used for serializing the SQLAlchemy Models for the Frontend)

class ConflictingPairSchema(BaseModel):
    """
    Schema for returning ConflictingPair model data via the API.
    """
    id: int
    analysis_id: int
    conflict_id: str
    reason: str
    conflicting_requirement_ids: List[str]
    status: str
    created_at: datetime
    
    class Config:
        # Allows Pydantic to read data from ORM models (e.g., SQLAlchemy)
        from_attributes = True 

class ContradictionAnalysisSchema(BaseModel):
    """
    Schema for the ContradictionAnalysis model data via API.
    Includes the nested list of conflicts.
    """
    id: int
    source_document_id: Optional[int]
    analyzed_at: datetime
    total_conflicts_found: int
    status: str
    conflicts: List[ConflictingPairSchema]
    
    class Config:
        from_attributes = True
