from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.obligation import Obligation


router = APIRouter(
    prefix="/obligations",
    tags=["Obligations"]
)


from enum import Enum

class ObligationStatus(str, Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    overdue = "overdue"

class ObligationStatusUpdate(BaseModel):
    status: ObligationStatus


@router.get("/{contract_id}")
def get_obligations(
    contract_id: str,
    db: Session = Depends(get_db)
):

    obligations = (
        db.query(Obligation)
        .filter(
            Obligation.contract_id == contract_id
        )
        .all()
    )

    return {
        "contract_id": contract_id,
        "count": len(obligations),
        "obligations": [
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
    }


@router.patch("/{obligation_id}/status")
def update_obligation_status(
    obligation_id: int,
    request: ObligationStatusUpdate,
    db: Session = Depends(get_db)
):

    obligation = (
        db.query(Obligation)
        .filter(
            Obligation.id == obligation_id
        )
        .first()
    )

    if not obligation:
        raise HTTPException(
            status_code=404,
            detail="Obligation not found."
        )



    obligation.status = request.status

    db.commit()
    db.refresh(obligation)

    return {
        "message": "Obligation status updated.",
        "obligation": {
            "id": obligation.id,
            "title": obligation.title,
            "status": obligation.status
        }
    }