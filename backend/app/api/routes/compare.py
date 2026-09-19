from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.contract_version import ContractVersion
from app.services.contract_compare import ContractCompareService
from app.services.pdf_service import PDFService


router = APIRouter(
    prefix="/compare",
    tags=["Contract Comparison"]
)


UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/{contract_id}/upload-version")
async def upload_contract_version(
    contract_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Filename is required."
        )

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported."
        )

    existing_count = (
        db.query(ContractVersion)
        .filter(
            ContractVersion.contract_id == contract_id
        )
        .count()
    )

    version_number = existing_count + 1

    safe_filename = (
        f"{contract_id}_v{version_number}_"
        f"{file.filename}"
    )

    file_path = UPLOAD_DIR / safe_filename

    content = await file.read()

    with open(file_path, "wb") as buffer:
        buffer.write(content)

    pdf_service = PDFService()

    try:
        extracted = pdf_service.extract_text(
            str(file_path)
        )
    except Exception as exc:
        file_path.unlink(missing_ok=True)

        raise HTTPException(
            status_code=400,
            detail=f"PDF extraction failed: {exc}"
        )

    version = ContractVersion(
        contract_id=contract_id,
        version_number=version_number,
        filename=file.filename,
        extracted_text=extracted["text"]
    )

    db.add(version)
    db.commit()
    db.refresh(version)

    return {
        "success": True,
        "contract_id": contract_id,
        "version": {
            "id": version.id,
            "version_number": version.version_number,
            "filename": version.filename,
            "page_count": extracted["page_count"],
            "character_count": extracted["character_count"]
        }
    }


@router.get("/{contract_id}/versions")
def get_versions(
    contract_id: str,
    db: Session = Depends(get_db)
):

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

    return {
        "contract_id": contract_id,
        "count": len(versions),
        "versions": [
            {
                "id": item.id,
                "version_number": item.version_number,
                "filename": item.filename,
                "created_at": item.created_at
            }
            for item in versions
        ]
    }


@router.get("/{contract_id}")
def compare_latest_versions(
    contract_id: str,
    db: Session = Depends(get_db)
):

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

    if len(versions) < 2:
        raise HTTPException(
            status_code=400,
            detail="At least two contract versions are required."
        )

    old_version = versions[-2]
    new_version = versions[-1]

    service = ContractCompareService()

    result = service.compare(
        old_version.extracted_text or "",
        new_version.extracted_text or ""
    )

    return {
        "contract_id": contract_id,
        "old_version": old_version.version_number,
        "new_version": new_version.version_number,
        "comparison": result
    }