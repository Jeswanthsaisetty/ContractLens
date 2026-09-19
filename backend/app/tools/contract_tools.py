import time
import json

from sqlalchemy.orm import Session

from app.models.contract import Contract
from app.models.obligation import Obligation


def get_contract_details(
    contract_id: str,
    db: Session
) -> dict:

    contract = (
        db.query(Contract)
        .filter(
            Contract.contract_id == contract_id
        )
        .first()
    )

    if not contract:
        return {
            "error": "Contract not found."
        }

    return {
        "contract_id": contract.contract_id,
        "title": contract.title,
        "parties": json.loads(
            contract.parties or "[]"
        ),
        "effective_date": contract.effective_date,
        "expiration_date": contract.expiration_date,
        "renewal": json.loads(
            contract.renewal or "{}"
        ),
        "payment_terms": json.loads(
            contract.payment_terms or "{}"
        ),
        "termination": json.loads(
            contract.termination or "{}"
        )
    }


def find_obligations(
    contract_id: str,
    db: Session
) -> list:

    obligations = (
        db.query(Obligation)
        .filter(
            Obligation.contract_id == contract_id
        )
        .all()
    )

    return [
        {
            "id": item.id,
            "title": item.title,
            "description": item.description,
            "responsible_party": item.responsible_party,
            "due_date": item.due_date,
            "source_section": item.source_section,
            "status": item.status
        }
        for item in obligations
    ]


def search_contract(
    contract_id: str,
    query: str,
    db: Session
) -> dict:

    contract = (
        db.query(Contract)
        .filter(
            Contract.contract_id == contract_id
        )
        .first()
    )

    if not contract:
        return {
            "error": "Contract not found."
        }

    text = contract.extracted_text or ""

    query_words = [
        word.lower()
        for word in query.split()
        if len(word) > 2
    ]

    lines = text.splitlines()

    matches = []

    for index, line in enumerate(lines):

        line_lower = line.lower()

        if any(
            word in line_lower
            for word in query_words
        ):

            start = max(0, index - 1)
            end = min(
                len(lines),
                index + 2
            )

            matches.append(
                "\n".join(lines[start:end])
            )

    return {
        "query": query,
        "matches": matches[:10]
    }


def track_obligation(
    obligation_id: int,
    status: str,
    db: Session
) -> dict:

    obligation = (
        db.query(Obligation)
        .filter(
            Obligation.id == obligation_id
        )
        .first()
    )

    if not obligation:
        return {
            "error": "Obligation not found."
        }

    allowed_statuses = [
        "pending",
        "in_progress",
        "completed",
        "overdue"
    ]

    if status not in allowed_statuses:
        return {
            "error": (
                "Invalid status. Use: "
                + ", ".join(allowed_statuses)
            )
        }

    obligation.status = status

    db.commit()
    db.refresh(obligation)

    return {
        "success": True,
        "obligation_id": obligation.id,
        "title": obligation.title,
        "status": obligation.status
    }

def create_reminder(
    contract_id: str,
    title: str,
    description: str,
    reminder_date: str | None,
    db: Session
) -> dict:

    from app.models.reminder import Reminder

    reminder = Reminder(
        contract_id=contract_id,
        title=title,
        description=description,
        reminder_date=reminder_date,
        status="pending"
    )

    db.add(reminder)
    db.commit()
    db.refresh(reminder)

    return {
        "success": True,
        "reminder": {
            "id": reminder.id,
            "contract_id": reminder.contract_id,
            "title": reminder.title,
            "description": reminder.description,
            "reminder_date": reminder.reminder_date,
            "status": reminder.status
        }
    }