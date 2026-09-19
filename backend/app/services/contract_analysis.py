import json
import requests

from app.core.config import settings


class ContractAnalysisService:

    def __init__(self):
        self.api_key = settings.xkiro_api_key
        self.model = settings.xkiro_model
        self.url = f"{settings.xkiro_base_url.rstrip('/')}/chat/completions"

    def analyze(self, text: str) -> dict:

        prompt = f"""
You are ContractLens, an AI contract intelligence system.

Analyze the contract below.

Rules:
- Use ONLY information in the contract.
- Never invent missing information.
- Use null when information is unavailable.
- Extract important obligations, deadlines, payment, renewal and termination details.
- Flag clauses requiring human/legal review.
- Do not provide legal advice.
- Return ONLY valid JSON.
- Do not use markdown code fences.
- Every obligation must be grounded in the contract.
- Every important clause and human review flag must identify its source section when available.

Return exactly:

{{
  "contract_title": null,
  "parties": [],

  "effective_date": null,
  "expiration_date": null,

  "renewal": {{
    "type": null,
    "notice_period": null,
    "description": null
  }},

  "payment_terms": {{
    "amount": null,
    "currency": null,
    "frequency": null,
    "description": null
  }},

  "termination": {{
    "notice_period": null,
    "conditions": [],
    "description": null
  }},

  "obligations": [
    {{
      "title": null,
      "description": null,
      "responsible_party": null,
      "due_date": null,
      "source_section": null
    }}
  ],

  "important_clauses": [
    {{
      "title": null,
      "summary": null,
      "source_section": null
    }}
  ],

  "human_review_flags": [
    {{
      "issue": null,
      "reason": null,
      "source_section": null
    }}
  ]
}}

CONTRACT:
{text}
"""

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are ContractLens, an AI contract intelligence "
                        "system. Return only valid JSON."
                    ),
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            "temperature": 0,
            "max_tokens": 4500,
        }

        try:
            response = requests.post(
                self.url,
                headers=headers,
                json=payload,
                timeout=120,
            )

        except requests.RequestException as exc:
            raise RuntimeError(
                f"xKiro request failed: {exc}"
            ) from exc

        if response.status_code != 200:

            try:
                error_data = response.json()
            except ValueError:
                error_data = response.text

            raise RuntimeError(
                f"xKiro returned HTTP "
                f"{response.status_code}: {error_data}"
            )

        try:
            data = response.json()

        except ValueError as exc:
            raise ValueError(
                "xKiro returned an invalid API response."
            ) from exc

        choices = data.get("choices", [])

        if not choices:
            raise ValueError(
                "xKiro returned no choices."
            )

        message = choices[0].get("message", {})
        content = message.get("content")

        if not content:
            raise ValueError(
                "xKiro returned an empty response."
            )

        # Some OpenAI-compatible providers can return
        # content as a structured list rather than a string.
        if isinstance(content, list):
            text_parts = []

            for item in content:
                if isinstance(item, dict):
                    value = item.get("text")
                    if value:
                        text_parts.append(str(value))
                elif isinstance(item, str):
                    text_parts.append(item)

            content = "".join(text_parts)

        if not isinstance(content, str):
            raise ValueError(
                "xKiro returned an unsupported response format."
            )

        content = content.strip()

        # Remove markdown JSON fences if the model adds them.
        if content.startswith("```"):
            if content.startswith("```json"):
                content = content[7:]
            else:
                content = content[3:]

            if content.endswith("```"):
                content = content[:-3]

            content = content.strip()

        try:
            result = json.loads(content)

        except json.JSONDecodeError as exc:
            raise ValueError(
                "xKiro returned invalid JSON for contract analysis."
            ) from exc

        if not isinstance(result, dict):
            raise ValueError(
                "xKiro contract analysis response must be a JSON object."
            )

        return result