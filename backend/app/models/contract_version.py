from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.db.database import Base


class ContractVersion(Base):
    __tablename__ = "contract_versions"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    contract_id = Column(
        String,
        nullable=False,
        index=True
    )

    version_number = Column(
        Integer,
        nullable=False
    )

    filename = Column(
        String,
        nullable=False
    )

    extracted_text = Column(
        Text,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )