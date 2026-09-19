from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from app.db.database import Base


class Contract(Base):
    __tablename__ = "contracts"

    id = Column(Integer, primary_key=True, index=True)

    contract_id = Column(
        String,
        unique=True,
        index=True,
        nullable=False
    )

    filename = Column(
        String,
        nullable=False
    )

    title = Column(
        String,
        nullable=True
    )

    parties = Column(
        Text,
        nullable=True
    )

    effective_date = Column(
        String,
        nullable=True
    )

    expiration_date = Column(
        String,
        nullable=True
    )

    renewal = Column(
        Text,
        nullable=True
    )

    payment_terms = Column(
        Text,
        nullable=True
    )

    termination = Column(
        Text,
        nullable=True
    )

    important_clauses = Column(
        Text,
        nullable=True
    )

    human_review_flags = Column(
        Text,
        nullable=True
    )

    extracted_text = Column(
        Text,
        nullable=True
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )