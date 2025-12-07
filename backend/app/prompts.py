from typing import Optional, List, Dict

def get_requirements_generation_prompt(
    context: str, 
    user_query: str, 
    error_message: Optional[str] = None
) -> str:
    """
    Generates a structured, role-based prompt for the LLM to create requirements.
    Optionally includes a corrective section if a previous attempt failed validation.
    """
    
    correction_section = ""
    if error_message:
        escaped_error = error_message.replace("{", "{{").replace("}", "}}")
        correction_section = f"""
        --- CORRECTION ---
        Your previous response failed validation with the following error:
        {escaped_error}

        Please analyze this error and correct your response to strictly adhere to the requested JSON schema. Do not apologize or add extra commentary.
        --- END CORRECTION ---
        """

    return f"""
    You are an expert Senior Product Manager and Software Architect, renowned for your ability to distill complex discussions into clear, actionable requirements. Your task is to analyze the provided context and generate a structured set of requirements.

    Analyze the following context carefully:
    --- CONTEXT ---
    {context}
    --- END CONTEXT ---

    Based on the context and the user's request, perform the following task:
    --- USER REQUEST ---
    {user_query}
    --- END USER REQUEST ---

    {correction_section}

    INSTRUCTIONS:
    1. Identify the main features or epics discussed in the context.
    2. For each epic, generate 3-5 clear, concise user stories in the format: "As a [persona], I want [action], so that [benefit]."
    3. For each user story, generate 2-4 specific, testable acceptance criteria.
    4. For each user story generate 1-4 stakeholders
    5. For each user story, provide a 'priority' ('Low', 'Medium', or 'High'), 'requirement_type' ('Functional', 'Non-Functional'), and a list of 'suggested_tags' (e.g., 'UI/UX', 'Database').
    6. The final output MUST be a single, valid JSON object. Do not include any text, notes, or explanations outside of the JSON object.
    7. The JSON object must strictly adhere to the following schema:
        {{{{
          "epics": [
            {{{{
              "epic_name": "Name of the Epic/Feature",
              "user_stories": [
                {{{{
                  "story": "As a [persona], I want [action], so that [benefit].",
                  "acceptance_criteria": [
                    "Criteria 1",
                    "Criteria 2"
                  ],
                  "priority": "High",
                  "suggested_tags": ["Tag1", "Tag2"],
                  "requirement_type": "Functional",
                   "stakeholders": [
                    "stakeholder 1",
                    "stakeholder 2"
                  ],

                }}}}
              ]
            }}}}
          ]
        }}}}
    """

def get_summary_generation_prompt(
    context: str, 
    error_message: Optional[str] = None
) -> str:
    """
    Generates a structured prompt for the LLM to extract meeting summaries and action items.
    """
    
    correction_section = ""
    if error_message:
        escaped_error = error_message.replace("{", "{{").replace("}", "}}")
        correction_section = f"""
        --- CORRECTION ---
        Your previous response failed validation with the following error: {escaped_error}
        Please correct your response to strictly adhere to the requested JSON schema.
        --- END CORRECTION ---
        """

    return f"""
    You are an expert Meeting Analyst. Your task is to process the following meeting transcript/notes and extract key structural information.

    Analyze the following transcript carefully:
    --- CONTEXT ---
    {context}
    --- END CONTEXT ---
    
    {correction_section}

    INSTRUCTIONS:
    1.  Provide a concise summary of the entire discussion.
    2.  Identify all final, critical decisions made (e.g., "For V1, a simple link is agreed.").
    3.  Identify all outstanding questions, dependencies, or unresolved debates (e.g., "Guest checkout vs. hard login").
    4.  Extract all explicit action items, assigning the person's name (e.g., 'Dave', 'Sarah') where possible.
    5.  The final output MUST be a single, valid JSON object. Do not include any text, notes, or explanations outside of the JSON object.
    6.  The JSON object must strictly adhere to the following schema:
        {{{{
          "summary": "A concise summary of the meeting.",
          "key_decisions": [
            "Decision 1",
            "Decision 2"
          ],
          "open_questions": [
            "Question 1 or unresolved topic"
          ],
          "action_items": [
            {{{{
              "task": "Task assigned to a person.",
              "assignee": "Name (e.g., Sarah)"
            }}}}
          ]
        }}}}
    """

def get_context_evaluation_prompt(str) -> str:
        """
        Get the LLM prompt template for context evaluation.
        
        Returns:
            Prompt template string
        """
        return """You are an expert in software requirements analysis. Your task is to determine if a term is ambiguous or vague in the given context.

A term is considered AMBIGUOUS if:
- It is subjective or open to interpretation
- It lacks specific, measurable criteria
- Different people might interpret it differently
- It uses relative or qualitative language without quantification

A term is considered CLEAR if:
- It has a specific, well-defined meaning in the context
- It is a domain-specific technical term with precise meaning
- The context provides sufficient specificity
- It is quantifiable or measurable

Term to evaluate: "{term}"

Context:
{context}

Analyze whether the term "{term}" is ambiguous in this specific context.

Respond with a JSON object in the following format:
{{
    "is_ambiguous": true or false,
    "confidence": 0.0 to 1.0,
    "reasoning": "Brief explanation of your decision"
}}

Important:
- confidence should be between 0.0 (not confident) and 1.0 (very confident)
- reasoning should be 1-2 sentences explaining why the term is or isn't ambiguous
- Consider the specific context, not just the term in isolation
- Domain-specific technical terms should generally not be flagged as ambiguous

Respond ONLY with the JSON object, no additional text."""

def get_edge_case_generation_prompt(
    requirement_text: str,
    max_cases: int = 10,
    error_message: Optional[str] = None,
) -> str:
    """
    Generates a structured, role-based prompt for the LLM to create edge test cases
    for a single requirement. Optionally includes a corrective section if a previous
    attempt failed validation.
    """
    
    correction_section = ""
    if error_message:
        # Escape braces so the error message doesn't break the f-string / JSON examples
        escaped_error = error_message.replace("{", "{{").replace("}", "}}")
        correction_section = f"""
        --- CORRECTION ---
        Your previous response failed validation with the following error:
        {escaped_error}

        Please analyze this error and correct your response to strictly adhere to the requested JSON schema.
        Do not apologize or add extra commentary.
        --- END CORRECTION ---
        """

    return f"""
    You are an expert Requirements Engineer and QA Test Designer. Your task is to read a single software requirement
    and generate a set of focused EDGE TEST CASES.

    Analyze the following requirement carefully:
    --- REQUIREMENT ---
    {requirement_text}
    --- END REQUIREMENT ---

    {correction_section}

    INSTRUCTIONS:
    1. Generate concrete edge test cases that focus on:
       - boundary values and limits,
       - invalid, unexpected, or missing inputs,
       - extreme or unusual usage patterns,
       - conflicting or simultaneous user actions,
       - environmental or system failure conditions (e.g., network, storage, latency).
    2. Each edge case must be a short, clear description that a tester could turn into test steps.
    3. Do NOT restate the requirement; focus only on tricky or easily overlooked scenarios.
    4. Generate at most {max_cases} edge cases.
    5. The final output MUST be a single, valid JSON object. Do not include any text, notes, or explanations outside of the JSON object.
    6. The JSON object must strictly adhere to the following schema:
        {{{{
          "edge_cases": [
            "First edge case description...",
            "Second edge case description...",
            "Third edge case description..."
          ]
        }}}}
    """

def get_contradiction_analysis_prompt(
  requirements_json: List[Dict], 
  project_context: Optional[str] = None,
  error_message: Optional[str] = None
) -> str:
    """
    Generates a structured, role-based prompt for the LLM to analyze a list of 
    requirements for logical contradictions.
    """
    
    # Formatting requirements for LLM input
    requirements_text = "\n---\n".join([
        f"ID: {req.get('id', 'N/A')}\nType: {req.get('type', 'UserStory')}\nText: {req.get('text', '')}"
        for req in requirements_json
    ])
    
    correction_section = ""
    if error_message:
        escaped_error = error_message.replace("{", "{{").replace("}", "}}")
        correction_section = f"""
        --- CORRECTION ---
        Your previous response failed validation with the following error:
        {escaped_error}

        Please analyze this error and correct your response to strictly adhere to the requested JSON schema. Do not apologize or add extra commentary.
        --- END CORRECTION ---
        """

    context_section = ""
    if project_context:
        context_section = f"""
        --- ADDITIONAL PROJECT CONTEXT (e.g., NFRs, Scope) ---
        {project_context}
        --- END CONTEXT ---
        """

    return f"""
    You are a **Senior Software Quality Assurance Engineer and Logic Auditor**. Your sole task is to analyze a complete set of project requirements for **logical contradictions, mutual exclusivity, or unfulfillable constraints**. You must be rigorous and detail-oriented.

    Analyze the following requirements and context carefully:
    --- REQUIREMENTS TO ANALYZE ---
    {requirements_text}
    --- END REQUIREMENTS ---
    
    {context_section}
    
    {correction_section}

    INSTRUCTIONS:
    1.  Scan the full set of requirements. Look for pairs or groups of requirements that cannot simultaneously be true or implemented (e.g., "User must be logged in" vs. "Guest checkout is available").
    2.  If no contradictions are found, the output JSON must contain an empty list for 'contradictions'.
    3.  For every contradiction found, provide a concise, clear explanation of the logical conflict.
    4.  The final output MUST be a single, valid JSON object. Do not include any text, notes, or explanations outside of the JSON object.
    5.  The JSON object must strictly adhere to the following schema:
        {{{{
          "contradictions": [
            {{{{
              "conflict_id": "C-001",
              "reason": "Clear explanation of the conflict (e.g., Security policy contradicts an Accessibility requirement).",
              "conflicting_requirement_ids": [
                "The ID of the first requirement involved (e.g., R-101)",
                "The ID of the second requirement involved (e.g., R-205)"
              ]
            }}}}
          ]
        }}}}
    """

def get_json_correction_prompt(bad_json: str, validation_error: str) -> str:
    """
    Generates a prompt for the LLM to correct its own invalid JSON output.
    """
    escaped_error = validation_error.replace("{", "{{").replace("}", "}}")
    escaped_json = f"```json\n{bad_json}\n```"
    
    return f"""
    You are a JSON correction utility. Your task is to fix a broken JSON object.
    The user will provide a JSON object that failed validation and the corresponding
    Pydantic validation error.

    --- INVALID JSON ---
    {escaped_json}
    --- END INVALID JSON ---

    --- VALIDATION ERROR ---
    {escaped_error}
    --- END VALIDATION ERROR ---

    INSTRUCTIONS:
    1.  Analyze the validation error.
    2.  Fix the invalid JSON so that it strictly adheres to the schema described by the error.
    3.  Respond with **ONLY** the corrected, valid JSON object, without any surrounding text or markdown fences (e.g., do not wrap it in ```json ... ```).
    """
