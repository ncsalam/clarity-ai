# edge_case_service.py

from typing import List, Optional
from langchain_openai import ChatOpenAI
from .models import Requirement
from .prompts import get_edge_case_generation_prompt
import json


class EdgeCaseService:
    def __init__(self):
        try:
            self.llm_client = ChatOpenAI(
                model="gpt-4o",
                max_retries=5,
                temperature=0.2,
            )
            self.llm_available = True
        except Exception as e:
            print(f"Warning: EdgeCaseService LLM initialization failed: {e}")
            self.llm_client = None
            self.llm_available = False

    def generate_for_requirement(
        self,
        requirement_id: int,
        owner_id: Optional[str] = None,
        max_cases: int = 10,
    ) -> List[str]:
        requirement = Requirement.query.filter_by(id=requirement_id).first()

        if not requirement:
            raise ValueError(f"Requirement with ID {requirement_id} not found")

        if owner_id and requirement.owner_id != owner_id:
            raise ValueError(f"Access denied to requirement {requirement_id}")

        title = requirement.title or ""
        description = requirement.description or ""
        full_text = f"{title}\n\n{description}".strip()

        if not full_text:
            raise ValueError("Requirement has no text to analyze")

        if not self.llm_available or self.llm_client is None:
            print("EdgeCaseService: LLM not available, returning placeholder")
            return ["Edge case generation is currently unavailable (no LLM client)."]

        # ✅ Build the prompt via prompts.py, not inline
        prompt = get_edge_case_generation_prompt(full_text, max_cases=max_cases)

        messages = [
            {
                "role": "system",
                "content": "You are an expert QA engineer and requirements analyst.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ]

        try:
            response = self.llm_client.invoke(messages)
            raw_text = response.content if hasattr(response, "content") else str(response)
        except Exception as e:
            print(f"EdgeCaseService: LLM call failed: {e}")
            return ["Edge case generation failed due to an LLM error."]

        edge_cases: List[str] = []

        try:
            cleaned = raw_text.strip()

            # Strip Markdown code fences if present (```json ... ```)
            if cleaned.startswith("```"):
                # Remove leading ```... line
                first_newline = cleaned.find("\n")
                if first_newline != -1:
                    cleaned = cleaned[first_newline + 1 :]
                # Remove trailing ``` if present
                if cleaned.endswith("```"):
                    cleaned = cleaned[: -3]
                cleaned = cleaned.strip()

            # Narrow to the first {...} block if possible
            start = cleaned.find("{")
            end = cleaned.rfind("}")
            if start != -1 and end != -1:
                cleaned_json = cleaned[start : end + 1]
            else:
                cleaned_json = cleaned

            data = json.loads(cleaned_json)

            raw_cases = data.get("edge_cases", [])
            for item in raw_cases:
                if isinstance(item, str):
                    stripped = item.strip()
                    if stripped:
                        edge_cases.append(stripped)

        except Exception as e:
            print(f"EdgeCaseService: JSON parse failed: {e}")
            # Fallback: treat the entire response as a single edge case
            stripped = raw_text.strip()
            if stripped:
                edge_cases.append(stripped)


        if not edge_cases:
            edge_cases.append("No edge cases were generated for this requirement.")

        return edge_cases
