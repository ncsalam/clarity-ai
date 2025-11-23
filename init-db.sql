-- Initialize databases for the application
-- This script runs when PostgreSQL container starts for the first time

-- Create the clarity_ai database for the Flask application
CREATE DATABASE clarity_ai;

-- Create a user for the Flask application
CREATE USER clarity_user WITH ENCRYPTED PASSWORD 'clarity_password';
ALTER ROLE clarity_user SUPERUSER CREATEDB;

-- Grant privileges to the clarity_user on the clarity_ai database
GRANT ALL PRIVILEGES ON DATABASE clarity_ai TO clarity_user;

-- Connect to clarity_ai database and grant schema privileges
\c clarity_ai;
GRANT ALL ON SCHEMA public TO clarity_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO clarity_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO clarity_user;

-- Grant default privileges for future tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO clarity_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO clarity_user;

BEGIN;

CREATE TABLE public.alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

CREATE TABLE ambiguity_lexicon (
    id SERIAL NOT NULL,
    term VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    owner_id VARCHAR(255),
    category VARCHAR(100),
    added_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (id),
    CONSTRAINT uq_term_type_owner UNIQUE (term, type, owner_id)
);

CREATE INDEX ix_ambiguity_lexicon_owner_id ON ambiguity_lexicon (owner_id);

CREATE INDEX ix_ambiguity_lexicon_type ON ambiguity_lexicon (type);

CREATE TABLE documents (
    id SERIAL NOT NULL,
    filename VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    owner_id VARCHAR(255),
    PRIMARY KEY (id)
);

CREATE TABLE project_summaries (
    id SERIAL NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    owner_id VARCHAR(255),
    PRIMARY KEY (id)
);

CREATE TABLE tags (
    id SERIAL NOT NULL,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7),
    PRIMARY KEY (id),
    UNIQUE (name)
);

CREATE TABLE user_profiles (
    id SERIAL NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company VARCHAR(255) NOT NULL,
    job_title VARCHAR(255) NOT NULL,
    remaining_tokens INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    updated_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (id),
    UNIQUE (user_id)
);

CREATE TABLE contradiction_analyses (
    id SERIAL NOT NULL,
    source_document_id INTEGER,
    owner_id VARCHAR(255),
    analyzed_at TIMESTAMP WITHOUT TIME ZONE,
    total_conflicts_found INTEGER,
    status VARCHAR(50),
    PRIMARY KEY (id),
    FOREIGN KEY(source_document_id) REFERENCES documents (id) ON DELETE CASCADE
);

CREATE INDEX ix_contradiction_analyses_owner_id ON contradiction_analyses (owner_id);

CREATE INDEX ix_contradiction_analyses_source_document_id ON contradiction_analyses (source_document_id);

CREATE TABLE requirements (
    id SERIAL NOT NULL,
    req_id VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50),
    priority VARCHAR(50),
    owner_id VARCHAR(255),
    source_document_id INTEGER,
    PRIMARY KEY (id),
    FOREIGN KEY(source_document_id) REFERENCES documents (id),
    CONSTRAINT uq_requirements_req_id_owner UNIQUE (req_id, owner_id)
);

CREATE TABLE ambiguity_analyses (
    id SERIAL NOT NULL,
    requirement_id INTEGER,
    owner_id VARCHAR(255),
    original_text TEXT NOT NULL,
    analyzed_at TIMESTAMP WITHOUT TIME ZONE,
    total_terms_flagged INTEGER,
    terms_resolved INTEGER,
    status VARCHAR(50),
    PRIMARY KEY (id),
    FOREIGN KEY(requirement_id) REFERENCES requirements (id) ON DELETE CASCADE
);

CREATE INDEX ix_ambiguity_analyses_owner_id ON ambiguity_analyses (owner_id);

CREATE TABLE conflicting_pair (
    id SERIAL NOT NULL,
    analysis_id INTEGER,
    conflict_id VARCHAR(50) NOT NULL,
    reason TEXT NOT NULL,
    conflicting_requirement_ids JSON NOT NULL,
    status VARCHAR(50),
    created_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (id),
    FOREIGN KEY(analysis_id) REFERENCES contradiction_analyses (id) ON DELETE CASCADE
);

CREATE INDEX ix_conflicting_pair_analysis_id ON conflicting_pair (analysis_id);

CREATE INDEX ix_conflicting_pair_status ON conflicting_pair (status);

CREATE TABLE requirement_tags (
    requirement_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (requirement_id, tag_id),
    FOREIGN KEY(requirement_id) REFERENCES requirements (id),
    FOREIGN KEY(tag_id) REFERENCES tags (id)
);

CREATE TABLE ambiguous_terms (
    id SERIAL NOT NULL,
    analysis_id INTEGER,
    term VARCHAR(255) NOT NULL,
    position_start INTEGER NOT NULL,
    position_end INTEGER NOT NULL,
    sentence_context TEXT,
    is_ambiguous BOOLEAN,
    confidence FLOAT,
    reasoning TEXT,
    clarification_prompt TEXT,
    suggested_replacements JSON,
    status VARCHAR(50),
    created_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (id),
    FOREIGN KEY(analysis_id) REFERENCES ambiguity_analyses (id) ON DELETE CASCADE
);

CREATE INDEX ix_ambiguous_terms_analysis_id ON ambiguous_terms (analysis_id);

CREATE INDEX ix_ambiguous_terms_status ON ambiguous_terms (status);

CREATE TABLE clarification_history (
    id SERIAL NOT NULL,
    term_id INTEGER,
    requirement_id INTEGER,
    owner_id VARCHAR(255),
    original_text TEXT NOT NULL,
    clarified_text TEXT NOT NULL,
    action VARCHAR(50) NOT NULL,
    clarified_at TIMESTAMP WITHOUT TIME ZONE,
    PRIMARY KEY (id),
    FOREIGN KEY(requirement_id) REFERENCES requirements (id) ON DELETE CASCADE,
    FOREIGN KEY(term_id) REFERENCES ambiguous_terms (id) ON DELETE CASCADE
);

CREATE INDEX ix_clarification_history_owner_id ON clarification_history (owner_id);

CREATE INDEX ix_clarification_history_requirement_id ON clarification_history (requirement_id);

INSERT INTO public.alembic_version (version_num) VALUES ('93cfdc66b259') RETURNING public.alembic_version.version_num;

COMMIT;


-- Display created databases
\l
