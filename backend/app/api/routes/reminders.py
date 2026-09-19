from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.reminder import Reminder


router = APIRouter(
    prefix="/reminders",
    tags=["Reminders"]
)


class ReminderCreate(BaseModel):
    contract_id: str
    title: str
    description: str | None = None
    reminder_date: str | None = None


class ReminderStatusUpdate(BaseModel):
    status: str


@router.post("/")
def create_reminder(
    request: ReminderCreate,
    db: Session = Depends(get_db)
):

    reminder = Reminder(
        contract_id=request.contract_id,
        title=request.title,
        description=request.description,
        reminder_date=request.reminder_date,
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


@router.get("/{contract_id}")
def get_reminders(
    contract_id: str,
    db: Session = Depends(get_db)
):

    reminders = (
        db.query(Reminder)
        .filter(
            Reminder.contract_id == contract_id
        )
        .order_by(Reminder.id.desc())
        .all()
    )

    return {
        "contract_id": contract_id,
        "count": len(reminders),
        "reminders": [
            {
                "id": item.id,
                "title": item.title,
                "description": item.description,
                "reminder_date": item.reminder_date,
                "status": item.status
            }
            for item in reminders
        ]
    }


@router.patch("/{reminder_id}/status")
def update_reminder_status(
    reminder_id: int,
    request: ReminderStatusUpdate,
    db: Session = Depends(get_db)
):

    reminder = (
        db.query(Reminder)
        .filter(
            Reminder.id == reminder_id
        )
        .first()
    )

    if not reminder:
        raise HTTPException(
            status_code=404,
            detail="Reminder not found."
        )

    allowed_statuses = [
        "pending",
        "completed",
        "cancelled"
    ]

    if request.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid status. Allowed values: "
                + ", ".join(allowed_statuses)
            )
        )

    reminder.status = request.status

    db.commit()
    db.refresh(reminder)

    return {
        "success": True,
        "reminder": {
            "id": reminder.id,
            "title": reminder.title,
            "status": reminder.status
        }
    }