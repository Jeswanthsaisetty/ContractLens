from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models.reminder import Reminder


# Number of days before the obligation deadline
# when ContractLens should create the reminder.
REMINDER_DAYS_BEFORE = 7


def parse_due_date(value):
    """
    Convert different possible date formats into a Python date.

    Returns:
        date | None
    """

    if not value:
        return None

    # Already a Python date/datetime
    if isinstance(value, datetime):
        return value.date()

    if isinstance(value, date):
        return value

    value = str(value).strip()

    # Common date formats
    formats = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%B %d, %Y",
        "%b %d, %Y",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue

    # ISO datetime/date fallback
    try:
        return datetime.fromisoformat(
            value.replace("Z", "+00:00")
        ).date()
    except ValueError:
        return None


def create_automatic_reminders(
    contract_id: str,
    obligations: list,
    db: Session
) -> int:
    """
    Automatically create reminders for contract obligations
    that contain a concrete due date.

    Reminder is scheduled 7 days before the obligation deadline.

    If the 7-day reminder date has already passed,
    the reminder is scheduled for the due date.

    Returns:
        Number of reminders created.
    """

    created_count = 0
    today = date.today()

    for obligation in obligations:

        # ---------------------------------------------------------
        # 1. Parse obligation due date
        # ---------------------------------------------------------

        due_date = parse_due_date(
            obligation.due_date
        )

        # Do not invent dates when the contract
        # does not contain a usable deadline.
        if not due_date:
            continue

        # ---------------------------------------------------------
        # 2. Calculate reminder date
        # ---------------------------------------------------------

        reminder_date = (
            due_date -
            timedelta(days=REMINDER_DAYS_BEFORE)
        )

        # If the normal reminder date is already in the past,
        # schedule the reminder for the due date.
        if reminder_date < today:
            reminder_date = due_date

        # ---------------------------------------------------------
        # 3. Build reminder information
        # ---------------------------------------------------------

        obligation_title = (
            obligation.title
            or "Contract obligation"
        )

        title = (
            f"Upcoming obligation: {obligation_title}"
        )

        description = (
            f"{obligation.description or 'Contract obligation.'}"
            f"\n\n"
            f"Due date: {due_date.isoformat()}"
        )

        if obligation.responsible_party:
            description += (
                f"\nResponsible party: "
                f"{obligation.responsible_party}"
            )

        # ---------------------------------------------------------
        # 4. Prevent duplicate reminders
        # ---------------------------------------------------------

        existing = (
            db.query(Reminder)
            .filter(
                Reminder.contract_id == contract_id,
                Reminder.title == title,
                Reminder.reminder_date ==
                reminder_date.isoformat()
            )
            .first()
        )

        if existing:
            continue

        # ---------------------------------------------------------
        # 5. Create reminder
        # ---------------------------------------------------------

        reminder = Reminder(
            contract_id=contract_id,
            title=title,
            description=description,
            reminder_date=reminder_date.isoformat(),
            status="pending"
        )

        db.add(reminder)

        created_count += 1

    return created_count