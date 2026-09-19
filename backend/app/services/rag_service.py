import json

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.contract import Contract


class RAGService:

    def __init__(self):
        self.client = OpenAI(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
        )
        self.model = settings.llm_model

    def get_contract_context(
        self,
        contract_id: str,
        db: Session
    ) -> str:

        contract = (
            db.query(Contract)
            .filter(
                Contract.contract_id == contract_id
            )
            .first()
        )

        if not contract:
            raise ValueError(
                "Contract not found."
            )

        return contract.extracted_text or ""

    def ask(
        self,
        contract_id: str,
        question: str,
        db: Session
    ) -> dict:

        contract_text = self.get_contract_context(
            contract_id,
            db
        )

        prompt = f"""
You are ContractLens, an AI contract intelligence assistant.

Answer the user's question using ONLY the contract
provided below.

RULES:
- Do not invent information.
- If the contract does not contain the answer, say so.
- Do not provide legal advice.
- Be concise but useful.
- Identify the relevant contract section when possible.
- Quote only short portions of the contract when necessary.
- Clearly distinguish contract facts from interpretation.

Return ONLY valid JSON in this format:

{{
    "answer": "...",
    "evidence": [
        {{
            "section": "...",
            "text": "..."
        }}
    ],
    "confidence": "high"
}}

USER QUESTION:
{question}

CONTRACT:
{contract_text}
"""

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=3000
        )

        if not response.choices or not response.choices[0].message.content:
            raise ValueError(
                "OpenRouter returned an empty response."
            )

        try:
            return json.loads(response.choices[0].message.content)

        except json.JSONDecodeError as exc:
            raise ValueError(
                "OpenRouter returned invalid JSON."
            ) from exc