from .main import db
from .models import Requirement, Tag  # Import the Tag model
from .schemas import GeneratedRequirements

def save_requirements_to_db(validated_data: GeneratedRequirements, document_id: int, owner_id: str = None):
    """
    Saves the validated requirements to the database, including finding or creating tags
    and linking them to the new requirements.
    
    Args:
        validated_data: The validated requirements data
        document_id: ID of the source document
        owner_id: User ID to associate with the requirements (optional)
    """
    print(f"Saving {len(validated_data.epics)} epics to the database...")
    
    # Ensure we have a clean session state
    db.session.expire_all()
    
    # Get the next requirement counter, scoped by owner_id if provided
    if owner_id:
        req_counter = db.session.query(Requirement).filter_by(owner_id=owner_id).count() + 1
    else:
        req_counter = db.session.query(Requirement).filter(Requirement.owner_id.is_(None)).count() + 1
    
    print(f"Starting requirement counter at: REQ-{req_counter:03d}")
    
    for epic in validated_data.epics:
        for user_story in epic.user_stories:
            new_req = Requirement(
                req_id=f"REQ-{req_counter:03d}",
                title=user_story.story,
                description="\n".join([f"- {ac}" for ac in user_story.acceptance_criteria]),
                status="Draft",
                priority=user_story.priority,
                requirement_type=getattr(user_story, "requirement_type", None),
                source_document_id=document_id,
                owner_id=owner_id
            )
            
            for tag_name in user_story.suggested_tags:
                tag = Tag.query.filter_by(name=tag_name).first()
                
                if not tag:
                    tag = Tag(name=tag_name)
                    db.session.add(tag)
                    db.session.flush()
                
                new_req.tags.append(tag)
            
            db.session.add(new_req)
            req_counter += 1
            
    db.session.commit()
    print("Successfully saved requirements and their tags to the database.")
