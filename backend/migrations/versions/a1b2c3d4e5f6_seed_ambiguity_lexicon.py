"""seed ambiguity lexicon with default terms

Revision ID: a1b2c3d4e5f6
Revises: 93cfdc66b259
Create Date: 2025-11-30
"""

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '93cfdc66b259'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Check if table exists and is empty
    try:
        count = conn.execute(text("SELECT COUNT(*) FROM ambiguity_lexicon")).scalar()
    except Exception as e:
        # Table might not exist yet in some environments; skip silently
        count = None

    if count == 0:
        # Default terms as (term, category)
        default_terms = [
            # Performance
            ('fast', 'performance'), ('slow', 'performance'), ('quick', 'performance'),
            ('efficient', 'performance'), ('responsive', 'performance'), ('performant', 'performance'),
            ('optimized', 'performance'),
            # Security
            ('secure', 'security'), ('safe', 'security'), ('protected', 'security'),
            # Usability
            ('user-friendly', 'usability'), ('easy', 'usability'), ('simple', 'usability'),
            ('intuitive', 'usability'), ('convenient', 'usability'), ('straightforward', 'usability'),
            # Quality
            ('robust', 'quality'), ('reliable', 'quality'), ('stable', 'quality'),
            ('scalable', 'quality'), ('maintainable', 'quality'), ('flexible', 'quality'), ('modular', 'quality'),
            # Appearance
            ('modern', 'appearance'), ('clean', 'appearance'), ('professional', 'appearance'), ('attractive', 'appearance'),
            # General
            ('good', 'general'), ('better', 'general'), ('best', 'general'), ('appropriate', 'general'),
            ('adequate', 'general'), ('reasonable', 'general'), ('sufficient', 'general'), ('acceptable', 'general'),
            ('normal', 'general'), ('typical', 'general'), ('standard', 'general'), ('regular', 'general'),
            ('common', 'general'), ('usual', 'general'),
        ]

        # Insert terms idempotently; rely on unique constraint to avoid duplicates
        for term, category in default_terms:
            conn.execute(text(
                """
                INSERT INTO ambiguity_lexicon (term, type, owner_id, category, added_at)
                VALUES (:term, 'global', NULL, :category, NOW())
                ON CONFLICT (term, type, owner_id) DO NOTHING
                """
            ), {"term": term.lower(), "category": category})


def downgrade():
    # This migration is data-only; do not delete seeded data on downgrade.
    pass
