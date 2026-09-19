import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.contract import Contract
from app.models.obligation import Obligation
from app.models.reminder import Reminder
from app.models.contract_version import ContractVersion

from app.services.auto_reminder_service import (
    create_automatic_reminders
)

from app.services.contract_analysis import (
    ContractAnalysisService
)

from app.services.pdf_service import PDFService


router = APIRouter(
    prefix="/contracts",
    tags=["Contracts"]
)


UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


pdf_service = PDFService()
analysis_service = ContractAnalysisService()


# ============================================================
# UPLOAD CONTRACT
# ============================================================

@router.post("/upload")
async def upload_contract(
    file: UploadFile = File(...)
):

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="No file provided."
        )

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported."
        )

    contract_id = Path(file.filename).stem

    pdf_path = UPLOAD_DIR / f"{contract_id}.pdf"

    content = await file.read()

    with open(pdf_path, "wb") as buffer:
        buffer.write(content)

    try:

        extraction = pdf_service.extract_text(
            str(pdf_path)
        )

        return {
            "contract_id": contract_id,
            "filename": file.filename,
            "status": "uploaded",
            "page_count": extraction["page_count"],
            "character_count": extraction["character_count"],
            "text": extraction["text"],
            "pages": extraction["pages"]
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"PDF extraction failed: {str(e)}"
        )


# ============================================================
# ANALYZE CONTRACT
# ============================================================

@router.post("/{contract_id}/analyze")
def analyze_contract(
    contract_id: str,
    db: Session = Depends(get_db)
):

    pdf_path = UPLOAD_DIR / f"{contract_id}.pdf"

    if not pdf_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Contract not found."
        )

    try:

        # ----------------------------------------------------
        # 1. Extract PDF text
        # ----------------------------------------------------

        extraction = pdf_service.extract_text(
            str(pdf_path)
        )

        text = extraction["text"]

        # ----------------------------------------------------
        # 2. Analyze contract with xKiro
        # ----------------------------------------------------

        analysis = analysis_service.analyze(text)

        # ----------------------------------------------------
        # 3. Check whether contract already exists
        # ----------------------------------------------------

        existing_contract = (
            db.query(Contract)
            .filter(
                Contract.contract_id == contract_id
            )
            .first()
        )

        if existing_contract:

            contract = existing_contract

            # Remove previously extracted obligations.
            # Re-analysis replaces them instead of duplicating them.
            db.query(Obligation).filter(
                Obligation.contract_id == contract_id
            ).delete(
                synchronize_session=False
            )

        else:

            contract = Contract(
                contract_id=contract_id,
                filename=f"{contract_id}.pdf"
            )

            db.add(contract)

        # ----------------------------------------------------
        # 4. Store contract information
        # ----------------------------------------------------

        contract.title = analysis.get(
            "contract_title"
        )

        contract.parties = json.dumps(
            analysis.get(
                "parties",
                []
            )
        )

        contract.effective_date = analysis.get(
            "effective_date"
        )

        contract.expiration_date = analysis.get(
            "expiration_date"
        )

        contract.renewal = json.dumps(
            analysis.get(
                "renewal",
                {}
            )
        )

        contract.payment_terms = json.dumps(
            analysis.get(
                "payment_terms",
                {}
            )
        )

        contract.termination = json.dumps(
            analysis.get(
                "termination",
                {}
            )
        )

        contract.important_clauses = json.dumps(
            analysis.get(
                "important_clauses",
                []
            )
        )

        contract.human_review_flags = json.dumps(
            analysis.get(
                "human_review_flags",
                []
            )
        )

        contract.extracted_text = text

        # ----------------------------------------------------
        # 5. Store obligations
        # ----------------------------------------------------

        obligations = analysis.get(
            "obligations",
            []
        )

        saved_obligations = []

        for item in obligations:

            obligation = Obligation(
                contract_id=contract_id,
                title=item.get("title"),
                description=item.get("description"),
                responsible_party=item.get(
                    "responsible_party"
                ),
                due_date=item.get(
                    "due_date"
                ),
                source_section=item.get(
                    "source_section"
                ),
                status="pending"
            )

            db.add(obligation)

            saved_obligations.append(
                obligation
            )

        # ----------------------------------------------------
        # 6. Flush obligations
        # ----------------------------------------------------

        # Makes the newly-created obligations available
        # before creating reminders.
        db.flush()

        # ----------------------------------------------------
        # 7. Automatically create reminders
        # ----------------------------------------------------

        automatic_reminders_created = (
            create_automatic_reminders(
                contract_id=contract_id,
                obligations=saved_obligations,
                db=db
            )
        )

        # ----------------------------------------------------
        # 8. Save everything
        # ----------------------------------------------------

        db.commit()

        # ----------------------------------------------------
        # 9. Return result
        # ----------------------------------------------------

        return {
            "contract_id": contract_id,
            "status": "analyzed_and_saved",
            "analysis": analysis,
            "obligations_saved": len(
                obligations
            ),
            "automatic_reminders_created": (
                automatic_reminders_created
            )
        }

    except Exception as e:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Contract analysis failed: {str(e)}"
        )


# ============================================================
# LIST ALL CONTRACTS
# ============================================================

@router.get("/")
def list_contracts(
    db: Session = Depends(get_db)
):

    contracts = (
        db.query(Contract)
        .order_by(
            Contract.created_at.desc()
        )
        .all()
    )

    result = []

    for contract in contracts:

        obligation_count = (
            db.query(Obligation)
            .filter(
                Obligation.contract_id
                == contract.contract_id
            )
            .count()
        )

        pending_count = (
            db.query(Obligation)
            .filter(
                Obligation.contract_id
                == contract.contract_id,
                Obligation.status == "pending"
            )
            .count()
        )

        completed_count = (
            db.query(Obligation)
            .filter(
                Obligation.contract_id
                == contract.contract_id,
                Obligation.status == "completed"
            )
            .count()
        )

        overdue_count = (
            db.query(Obligation)
            .filter(
                Obligation.contract_id
                == contract.contract_id,
                Obligation.status == "overdue"
            )
            .count()
        )

        result.append({
            "contract_id": contract.contract_id,
            "filename": contract.filename,
            "title": contract.title,

            "parties": json.loads(
                contract.parties or "[]"
            ),

            "effective_date": (
                contract.effective_date
            ),

            "expiration_date": (
                contract.expiration_date
            ),

            "obligation_count": (
                obligation_count
            ),

            "pending_obligations": (
                pending_count
            ),

            "completed_obligations": (
                completed_count
            ),

            "overdue_obligations": (
                overdue_count
            ),

            "created_at": contract.created_at
        })

    return {
        "count": len(result),
        "contracts": result
    }


# ============================================================
# GET SINGLE CONTRACT
# ============================================================

@router.get("/{contract_id}")
def get_contract(
    contract_id: str,
    db: Session = Depends(get_db)
):

    contract = (
        db.query(Contract)
        .filter(
            Contract.contract_id == contract_id
        )
        .first()
    )

    if not contract:
        raise HTTPException(
            status_code=404,
            detail="Contract not found."
        )

    obligations = (
        db.query(Obligation)
        .filter(
            Obligation.contract_id == contract_id
        )
        .all()
    )

    return {
        "contract_id": contract.contract_id,
        "filename": contract.filename,
        "title": contract.title,

        "parties": json.loads(
            contract.parties or "[]"
        ),

        "effective_date": (
            contract.effective_date
        ),

        "expiration_date": (
            contract.expiration_date
        ),

        "renewal": json.loads(
            contract.renewal or "{}"
        ),

        "payment_terms": json.loads(
            contract.payment_terms or "{}"
        ),

        "termination": json.loads(
            contract.termination or "{}"
        ),

        "important_clauses": json.loads(
            contract.important_clauses or "[]"
        ),

        "human_review_flags": json.loads(
            contract.human_review_flags or "[]"
        ),

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
        ],

        "created_at": contract.created_at
    }


# ============================================================
# CONTRACT DASHBOARD
# ============================================================

@router.get("/{contract_id}/dashboard")
def get_contract_dashboard(
    contract_id: str,
    db: Session = Depends(get_db)
):

    contract = (
        db.query(Contract)
        .filter(
            Contract.contract_id == contract_id
        )
        .first()
    )

    if not contract:
        raise HTTPException(
            status_code=404,
            detail="Contract not found."
        )

    obligations = (
        db.query(Obligation)
        .filter(
            Obligation.contract_id == contract_id
        )
        .all()
    )

    reminders = (
        db.query(Reminder)
        .filter(
            Reminder.contract_id == contract_id
        )
        .order_by(
            Reminder.id.desc()
        )
        .all()
    )

    versions = (
        db.query(ContractVersion)
        .filter(
            ContractVersion.contract_id == contract_id
        )
        .order_by(
            ContractVersion.version_number.asc()
        )
        .all()
    )

    pending_obligations = [
        item
        for item in obligations
        if item.status == "pending"
    ]

    completed_obligations = [
        item
        for item in obligations
        if item.status == "completed"
    ]

    overdue_obligations = [
        item
        for item in obligations
        if item.status == "overdue"
    ]

    pending_reminders = [
        item
        for item in reminders
        if item.status == "pending"
    ]

    return {

        "contract": {

            "contract_id": (
                contract.contract_id
            ),

            "title": contract.title,

            "filename": (
                contract.filename
            ),

            "parties": json.loads(
                contract.parties or "[]"
            ),

            "effective_date": (
                contract.effective_date
            ),

            "expiration_date": (
                contract.expiration_date
            ),

            "renewal": json.loads(
                contract.renewal or "{}"
            ),

            "payment_terms": json.loads(
                contract.payment_terms or "{}"
            ),

            "termination": json.loads(
                contract.termination or "{}"
            ),

            "human_review_flags": json.loads(
                contract.human_review_flags
                or "[]"
            )
        },

        "statistics": {

            "total_obligations": (
                len(obligations)
            ),

            "pending_obligations": (
                len(pending_obligations)
            ),

            "completed_obligations": (
                len(completed_obligations)
            ),

            "overdue_obligations": (
                len(overdue_obligations)
            ),

            "total_reminders": (
                len(reminders)
            ),

            "pending_reminders": (
                len(pending_reminders)
            ),

            "contract_versions": (
                len(versions)
            )
        },

        "obligations": [

            {
                "id": item.id,
                "title": item.title,
                "description": item.description,
                "responsible_party": (
                    item.responsible_party
                ),
                "due_date": item.due_date,
                "source_section": (
                    item.source_section
                ),
                "status": item.status
            }

            for item in obligations
        ],

        "reminders": [

            {
                "id": item.id,
                "title": item.title,
                "description": item.description,
                "reminder_date": (
                    item.reminder_date
                ),
                "status": item.status
            }

            for item in reminders
        ],

        "versions": [

            {
                "id": item.id,
                "version_number": (
                    item.version_number
                ),
                "filename": item.filename,
                "created_at": (
                    item.created_at
                )
            }

            for item in versions
        ]
    }