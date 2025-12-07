from .main import db
from datetime import datetime

requirement_tags = db.Table('requirement_tags',
    db.Column('requirement_id', db.Integer, db.ForeignKey('requirements.id'), primary_key=True),
    db.Column('tag_id', db.Integer, db.ForeignKey('tags.id'), primary_key=True)
)

class Document(db.Model):
    __tablename__ = 'documents'
    
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    owner_id = db.Column(db.String(255), nullable=True)  # SuperTokens user ID
    requirements = db.relationship('Requirement', back_populates='source_document', cascade="all, delete-orphan")
    # Relationship to ContradictionAnalysis
    contradiction_analyses = db.relationship('ContradictionAnalysis', back_populates='source_document', cascade="all, delete-orphan")

class Tag(db.Model):
    __tablename__ = 'tags'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    color = db.Column(db.String(7), default='#cccccc')

    def __repr__(self):
        return f"<Tag {self.name}>"

class Requirement(db.Model):
    __tablename__ = 'requirements'
    
    id = db.Column(db.Integer, primary_key=True)
    req_id = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), default='Draft')
    priority = db.Column(db.String(50), default='Medium')
    requirement_type = db.Column(db.String(50), nullable=True)  # <-- Add this

    owner_id = db.Column(db.String(255), nullable=True)
    
    source_document_id = db.Column(db.Integer, db.ForeignKey('documents.id'))
    source_document = db.relationship('Document', back_populates='requirements')

    tags = db.relationship('Tag', secondary=requirement_tags, lazy='subquery',
        backref=db.backref('requirements', lazy=True))

    stakeholders = db.Column(db.JSON, default=list)
    
    ambiguity_analyses = db.relationship('AmbiguityAnalysis', back_populates='requirement', cascade='all, delete-orphan')
    clarification_history = db.relationship('ClarificationHistory', back_populates='requirement', cascade='all, delete-orphan')

    __table_args__ = (
        db.UniqueConstraint('req_id', 'owner_id', name='uq_requirements_req_id_owner'),
    )

    def __repr__(self):
        return f"<Requirement {self.req_id}: {self.title}>"
class ProjectSummary(db.Model):
    __tablename__ = 'project_summaries'
    
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    owner_id = db.Column(db.String(255), nullable=True)  # SuperTokens user ID

    def __repr__(self):
        return f"<ProjectSummary {self.id} created at {self.created_at}>"

class UserProfile(db.Model):
    __tablename__ = 'user_profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(255), unique=True, nullable=False)  # SuperTokens user ID
    email = db.Column(db.String(255), nullable=False)
    first_name = db.Column(db.String(100), nullable=False)
    last_name = db.Column(db.String(100), nullable=False)
    company = db.Column(db.String(255), nullable=False)
    job_title = db.Column(db.String(255), nullable=False)
    remaining_tokens = db.Column(db.Integer, default=5)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<UserProfile {self.email}>"


class AmbiguityAnalysis(db.Model):
    __tablename__ = 'ambiguity_analyses'
    
    id = db.Column(db.Integer, primary_key=True)
    requirement_id = db.Column(db.Integer, db.ForeignKey('requirements.id', ondelete='CASCADE'))
    owner_id = db.Column(db.String(255), index=True)
    original_text = db.Column(db.Text, nullable=False)
    analyzed_at = db.Column(db.DateTime, default=datetime.utcnow)
    total_terms_flagged = db.Column(db.Integer, default=0)
    terms_resolved = db.Column(db.Integer, default=0)
    status = db.Column(db.String(50), default='pending')
    
    # Relationships
    requirement = db.relationship('Requirement', back_populates='ambiguity_analyses')
    terms = db.relationship('AmbiguousTerm', back_populates='analysis', cascade='all, delete-orphan')

    def __repr__(self):
        return f"<AmbiguityAnalysis {self.id} for Requirement {self.requirement_id}>"


class AmbiguousTerm(db.Model):
    __tablename__ = 'ambiguous_terms'
    
    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('ambiguity_analyses.id', ondelete='CASCADE'), index=True)
    term = db.Column(db.String(255), nullable=False)
    position_start = db.Column(db.Integer, nullable=False)
    position_end = db.Column(db.Integer, nullable=False)
    sentence_context = db.Column(db.Text)
    is_ambiguous = db.Column(db.Boolean, default=True)
    confidence = db.Column(db.Float, default=0.0)
    reasoning = db.Column(db.Text)
    clarification_prompt = db.Column(db.Text)
    suggested_replacements = db.Column(db.JSON)
    status = db.Column(db.String(50), default='pending', index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    analysis = db.relationship('AmbiguityAnalysis', back_populates='terms')
    clarifications = db.relationship('ClarificationHistory', back_populates='term', cascade='all, delete-orphan')

    def __repr__(self):
        return f"<AmbiguousTerm '{self.term}' in Analysis {self.analysis_id}>"


class ClarificationHistory(db.Model):
    __tablename__ = 'clarification_history'
    
    id = db.Column(db.Integer, primary_key=True)
    term_id = db.Column(db.Integer, db.ForeignKey('ambiguous_terms.id', ondelete='CASCADE'))
    requirement_id = db.Column(db.Integer, db.ForeignKey('requirements.id', ondelete='CASCADE'), index=True)
    owner_id = db.Column(db.String(255), index=True)
    original_text = db.Column(db.Text, nullable=False)
    clarified_text = db.Column(db.Text, nullable=False)
    action = db.Column(db.String(50), nullable=False)
    clarified_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    term = db.relationship('AmbiguousTerm', back_populates='clarifications')
    requirement = db.relationship('Requirement', back_populates='clarification_history')

    def __repr__(self):
        return f"<ClarificationHistory {self.id} for Term {self.term_id}>"


class AmbiguityLexicon(db.Model):
    __tablename__ = 'ambiguity_lexicon'
    
    id = db.Column(db.Integer, primary_key=True)
    term = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(50), nullable=False, index=True)
    owner_id = db.Column(db.String(255), index=True)
    category = db.Column(db.String(100))
    added_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        db.UniqueConstraint('term', 'type', 'owner_id', name='uq_term_type_owner'),
    )

    def __repr__(self):
        return f"<AmbiguityLexicon '{self.term}' ({self.type})>"

class ContradictionAnalysis(db.Model):
    __tablename__ = 'contradiction_analyses'
    
    id = db.Column(db.Integer, primary_key=True)
    # Link to the source document that was analyzed for its generated requirements
    source_document_id = db.Column(db.Integer, db.ForeignKey('documents.id', ondelete='CASCADE'), index=True)
    owner_id = db.Column(db.String(255), index=True)
    analyzed_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Summary of the analysis
    total_conflicts_found = db.Column(db.Integer, default=0)
    status = db.Column(db.String(50), default='pending') # E.g., 'pending', 'complete'

    # Relationships
    source_document = db.relationship('Document', back_populates='contradiction_analyses')
    conflicts = db.relationship('ConflictingPair', back_populates='analysis', cascade='all, delete-orphan')

    def __repr__(self):
        return f"<ContradictionAnalysis {self.id} for Document {self.source_document_id}>"


class ConflictingPair(db.Model):
    __tablename__ = 'conflicting_pair'
    
    id = db.Column(db.Integer, primary_key=True)
    analysis_id = db.Column(db.Integer, db.ForeignKey('contradiction_analyses.id', ondelete='CASCADE'), index=True)
    
    # Data derived directly from the LLM's structured output
    conflict_id = db.Column(db.String(50), nullable=False) # E.g., 'C-001'
    reason = db.Column(db.Text, nullable=False)
    
    # Store the IDs of the requirements that conflict, as a JSON list (e.g., ["R-101", "R-205"])
    conflicting_requirement_ids = db.Column(db.JSON, nullable=False) 
    
    # User status for conflict resolution
    status = db.Column(db.String(50), default='pending', index=True) # E.g., 'pending', 'resolved', 'ignored'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    analysis = db.relationship('ContradictionAnalysis', back_populates='conflicts')

    def __repr__(self):
        return f"<ConflictingPair {self.id} in Analysis {self.analysis_id}>"