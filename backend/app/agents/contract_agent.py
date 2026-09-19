import json

from openai import OpenAI
from sqlalchemy.orm import Session

from app.core.config import settings
from app.tools.contract_tools import (
    create_reminder,
    find_obligations,
    get_contract_details,
    search_contract,
    track_obligation,
)


class ContractAgent:

    def __init__(self):
        self.client = OpenAI(
            base_url=settings.xkiro_base_url,
            api_key=settings.xkiro_api_key,
        )
        self.model = settings.xkiro_model

    def _build_tools(self, contract_id: str, db: Session):

        def get_contract():
            print("[TOOL] get_contract()")
            return get_contract_details(contract_id, db)

        def get_obligations():
            print("[TOOL] get_obligations()")
            return find_obligations(contract_id, db)

        def search(query: str):
            print(f"[TOOL] search(query={query})")
            return search_contract(contract_id, query, db)

        def update_obligation(
            obligation_id: int,
            status: str
        ):
            print(
                f"[TOOL] update_obligation("
                f"id={obligation_id}, status={status})"
            )

            return track_obligation(
                obligation_id,
                status,
                db
            )

        def create_contract_reminder(
            title: str,
            description: str,
            reminder_date: str | None = None
        ):
            print(
                f"[TOOL] create_reminder("
                f"title={title}, date={reminder_date})"
            )

            return create_reminder(
                contract_id,
                title,
                description,
                reminder_date,
                db
            )

        return {
            "get_contract": get_contract,
            "get_obligations": get_obligations,
            "search": search,
            "update_obligation": update_obligation,
            "create_contract_reminder": create_contract_reminder,
        }

    def _get_tool_schemas(self):

        return [
            {
                "type": "function",
                "function": {
                    "name": "get_contract",
                    "description": (
                        "Get structured metadata about the current "
                        "contract, including parties, dates, payment "
                        "terms, renewal and termination."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "get_obligations",
                    "description": (
                        "Get all obligations for the current contract, "
                        "including responsible party, due date, source "
                        "section and status."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {},
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "search",
                    "description": (
                        "Search the original contract text for a "
                        "specific topic, clause, phrase or requirement."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": (
                                    "Topic or phrase to search "
                                    "for in the contract."
                                ),
                            }
                        },
                        "required": ["query"],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "update_obligation",
                    "description": (
                        "Update the status of a contract obligation. "
                        "Use only when the user explicitly requests "
                        "a status change."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "obligation_id": {
                                "type": "integer",
                                "description": "Obligation database ID.",
                            },
                            "status": {
                                "type": "string",
                                "enum": [
                                    "pending",
                                    "in_progress",
                                    "completed",
                                    "overdue",
                                ],
                                "description": "New obligation status.",
                            },
                        },
                        "required": [
                            "obligation_id",
                            "status",
                        ],
                        "additionalProperties": False,
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "create_contract_reminder",
                    "description": (
                        "Create a reminder for the current contract. "
                        "Use only when the user explicitly requests "
                        "a reminder."
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {
                                "type": "string",
                            },
                            "description": {
                                "type": "string",
                            },
                            "reminder_date": {
                                "type": "string",
                                "description": (
                                    "Reminder date if known. "
                                    "Use YYYY-MM-DD when possible."
                                ),
                            },
                        },
                        "required": [
                            "title",
                            "description",
                        ],
                        "additionalProperties": False,
                    },
                },
            },
        ]

    def run(
        self,
        contract_id: str,
        question: str,
        db: Session
    ) -> dict:

        tool_functions = self._build_tools(
            contract_id,
            db
        )

        tools = self._get_tool_schemas()

        system_prompt = """
You are ContractLens, an AI contract intelligence agent.

You answer questions using the tools available to you.

Rules:

1. Ground answers in the contract and tool results.
2. Never invent contract facts.
3. Do not provide legal advice.
4. Use the minimum number of tools necessary.
5. For contract metadata use get_contract.
6. For obligations use get_obligations.
7. For specific clauses or topics use search.
8. Only update an obligation when the user explicitly asks.
9. Only create a reminder when the user explicitly asks.
10. After executing tools, provide a concise final answer.
11. Mention relevant evidence or source sections when available.
12. If the contract does not contain enough information, say so.
13. Clearly distinguish contract facts from interpretation.
"""

        messages = [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": (
                    f"Contract ID: {contract_id}\n\n"
                    f"User request: {question}"
                ),
            },
        ]

        used_tools = []
        tool_results = []

        print("ContractLens agent starting...")
        print(f"Using xKiro model: {self.model}")

        max_iterations = 5

        for iteration in range(max_iterations):

            print(
                f"[AGENT LOOP] iteration={iteration + 1}"
            )

            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=tools,
                tool_choice="auto",
                temperature=0,
                max_tokens=1000,
            )

            if not response.choices:
                raise ValueError(
                    "xKiro returned no choices."
                )

            message = response.choices[0].message

            tool_calls = message.tool_calls or []

            # -------------------------------------------------
            # No more tools -> final answer
            # -------------------------------------------------

            if not tool_calls:

                answer = message.content or ""

                return {
                    "status": "success",
                    "contract_id": contract_id,
                    "question": question,
                    "answer": answer,
                    "tools_used": used_tools,
                    "tool_count": len(used_tools),
                    "tool_results": tool_results,
                    "confidence": "high",
                }

            # -------------------------------------------------
            # Add assistant tool-call message
            # -------------------------------------------------

            messages.append(
                {
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in tool_calls
                    ],
                }
            )

            # -------------------------------------------------
            # Execute every requested tool
            # -------------------------------------------------

            for tool_call in tool_calls:

                function_name = tool_call.function.name

                try:
                    arguments = json.loads(
                        tool_call.function.arguments or "{}"
                    )
                except json.JSONDecodeError:

                    result = {
                        "error": (
                            "The model generated invalid "
                            "tool arguments."
                        )
                    }

                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": json.dumps(result),
                        }
                    )

                    continue

                print(
                    f"[FUNCTION CALL] "
                    f"{function_name} "
                    f"arguments={arguments}"
                )

                tool_function = tool_functions.get(
                    function_name
                )

                if not tool_function:

                    result = {
                        "error": (
                            f"Unknown tool: "
                            f"{function_name}"
                        )
                    }

                else:

                    try:

                        result = tool_function(
                            **arguments
                        )

                        used_tools.append(
                            function_name
                        )

                        tool_results.append(
                            {
                                "tool": function_name,
                                "arguments": arguments,
                                "result": result,
                            }
                        )

                        print(
                            f"[TOOL EXECUTED] "
                            f"{function_name}"
                        )

                    except Exception as exc:

                        result = {
                            "error": str(exc)
                        }

                        print(
                            f"[TOOL ERROR] "
                            f"{function_name}: "
                            f"{exc}"
                        )

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(
                            result,
                            default=str
                        ),
                    }
                )

        # -----------------------------------------------------
        # Safety limit reached
        # -----------------------------------------------------

        return {
            "status": "iteration_limit",
            "contract_id": contract_id,
            "question": question,
            "answer": (
                "I could not complete the requested "
                "contract analysis within the allowed "
                "number of tool steps."
            ),
            "tools_used": used_tools,
            "tool_count": len(used_tools),
            "tool_results": tool_results,
            "confidence": "medium",
        }