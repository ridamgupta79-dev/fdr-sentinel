

from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    ForeignKey,
    Date,
    DateTime,
    Numeric,
    Text,
    JSON,
    func,
)
from sqlalchemy.orm import relationship

from backend.database import Base



class Institution(Base):
    __tablename__ = "institutions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    institution_code = Column(String(50), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    phone = Column(String(20), nullable=True)
    address = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    fdrs = relationship("FDR", back_populates="institution")


class FDR(Base):
    __tablename__ = "fdrs"

    id = Column(Integer, primary_key=True, index=True)

    institution_id = Column(
        Integer,
        ForeignKey("institutions.id"),
        nullable=False,
        index=True,
    )

    fdr_number = Column(String(100), unique=True, nullable=False)
    bank_name = Column(String(200), nullable=False)
    branch_name = Column(String(200), nullable=True)
    deposit_amount = Column(Numeric(14, 2), nullable=False)
    issue_date = Column(Date, nullable=False)
    maturity_date = Column(Date, nullable=False)
    interest_rate = Column(Numeric(5, 2), nullable=True)
    certificate_path = Column(String(500), nullable=True)

    status = Column(String(30), default="submitted", nullable=False)

    institution = relationship("Institution", back_populates="fdrs")
    verifications = relationship(
        "Verification",
        back_populates="fdr",
    )
    
    release_requests = relationship(
        "ReleaseRequest",
        back_populates="fdr",
    )



class Verification(Base):
    __tablename__ = "verifications"

    id = Column(Integer, primary_key=True, index=True)

    fdr_id = Column(
        Integer,
        ForeignKey("fdrs.id"),
        nullable=False,
        index=True,
    )

    method = Column(String(50), nullable=False)
    result = Column(String(30), default="pending", nullable=False)
    reference_number = Column(String(100), nullable=True)
    remarks = Column(String(1000), nullable=True)
    checked_by = Column(String(150), nullable=True)

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    fdr = relationship("FDR", back_populates="verifications")


class ReleaseRequest(Base):
    __tablename__ = "release_requests"

    id = Column(Integer, primary_key=True, index=True)

    fdr_id = Column(
        Integer,
        ForeignKey("fdrs.id"),
        nullable=False,
        index=True,
    )

    requested_by = Column(String(150), nullable=False)
    reason = Column(Text, nullable=False)

    status = Column(
        String(30),
        default="pending",
        nullable=False,
    )

    reviewed_by = Column(String(150), nullable=True)
    review_remarks = Column(Text, nullable=True)

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )
    reviewed_at = Column(DateTime, nullable=True)

    fdr = relationship(
        "FDR",
        back_populates="release_requests",
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)

    actor = Column(String(150), nullable=False)
    action = Column(String(100), nullable=False)

    entity_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=True)

    details = Column(JSON, nullable=True)

    ip_address = Column(String(45), nullable=True)

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    full_name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)

    role = Column(String(30), default="institution", nullable=False)

    institution_id = Column(
        Integer,
        ForeignKey("institutions.id"),
        nullable=True
    )

    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=False
    )