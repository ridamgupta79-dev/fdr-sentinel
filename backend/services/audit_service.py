
from sqlalchemy.orm import Session

from backend.models import AuditLog


def record_audit_event(
    db: Session,
    actor: str,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
):
    """
    Add an audit event to the current database transaction.

    The caller is responsible for committing or rolling back.
    """
    event = AuditLog(
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
        ip_address=ip_address,
    )

    db.add(event)
    return event
