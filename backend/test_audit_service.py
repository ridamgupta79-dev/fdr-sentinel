
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models import AuditLog
from backend.services.audit_service import record_audit_event


def test_audit_event_is_saved_and_retrievable():
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
            event = record_audit_event(
                db=db,
                actor="demo-user",
                action="AUDIT_TEST",
                entity_type="FDR",
                entity_id=1,
                details={
                    "message": "Testing the audit logging service",
                    "source": "automated-test",
                },
            )

            db.commit()
            db.refresh(event)

            assert event.id is not None
            assert event.actor == "demo-user"
            assert event.action == "AUDIT_TEST"
            assert event.entity_type == "FDR"
            assert event.entity_id == 1

            saved_event = (
                db.query(AuditLog)
                .filter(AuditLog.id == event.id)
                .first()
            )

            assert saved_event is not None
            assert saved_event.details["message"] == (
                "Testing the audit logging service"
            )

    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
