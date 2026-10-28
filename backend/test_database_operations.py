
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models import Institution, FDR


def test_institution_and_fdr_database_operations():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )

    try:
        Base.metadata.create_all(bind=engine)

        with TestingSessionLocal() as db:
            institution = Institution(
                name="FDR Sentinel Test Institute",
                institution_code="TEST-INST-001",
                email="fdr-test@example.com",
                phone="9999999999",
                address="Test Address",
            )
            db.add(institution)
            db.commit()
            db.refresh(institution)

            today = date.today()
            fdr = FDR(
                institution_id=institution.id,
                fdr_number="TEST-FDR-001",
                bank_name="Demo Bank",
                branch_name="Demo Branch",
                deposit_amount=Decimal("500000.00"),
                issue_date=today,
                maturity_date=today + timedelta(days=365),
                interest_rate=Decimal("6.50"),
                status="submitted",
            )
            db.add(fdr)
            db.commit()
            db.refresh(fdr)

            saved_fdr = (
                db.query(FDR)
                .filter_by(fdr_number="TEST-FDR-001")
                .first()
            )

            assert saved_fdr is not None
            assert saved_fdr.deposit_amount == Decimal("500000.00")
            assert saved_fdr.status == "submitted"
            assert saved_fdr.institution.id == institution.id
            assert saved_fdr.institution.name == "FDR Sentinel Test Institute"

    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
