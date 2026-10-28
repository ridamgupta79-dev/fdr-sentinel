
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.database import Base, engine, get_db
from backend import models
from backend.schemas import InstitutionCreate, InstitutionResponse, InstitutionUpdate
from backend.fdr_schemas import FDRCreate, FDRResponse
from backend.verification_schemas import (
    VerificationCreate,
    VerificationResponse,
)
from backend.release_schemas import (
    ReleaseRequestCreate,
    ReleaseRequestResponse,
    ReleaseRequestReview,
)
from backend.audit_schemas import AuditLogResponse
from backend.services.audit_service import record_audit_event
from backend.auth_routes import (
    router as auth_router,
    get_current_user,
    require_roles,
)
from fastapi.middleware.cors import CORSMiddleware

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="FDR Sentinel",
    description="AICTE Security Deposit and FDR Lifecycle Portal",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


# ---------- Shared access helpers ----------

def check_institution_access(current_user, institution_id: int):
    if current_user.role == "admin":
        return

    if current_user.role != "institution":
        raise HTTPException(status_code=403, detail="Insufficient permissions.")

    if current_user.institution_id != institution_id:
        raise HTTPException(
            status_code=403,
            detail="You cannot access another institution's records.",
        )


def get_accessible_fdr(db: Session, fdr_id: int, current_user):
    fdr = db.query(models.FDR).filter(models.FDR.id == fdr_id).first()

    if fdr is None:
        raise HTTPException(status_code=404, detail="FDR not found.")

    check_institution_access(current_user, fdr.institution_id)
    return fdr


def get_accessible_release_request(
    db: Session, request_id: int, current_user
):
    request = (
        db.query(models.ReleaseRequest)
        .filter(models.ReleaseRequest.id == request_id)
        .first()
    )

    if request is None:
        raise HTTPException(status_code=404, detail="Release request not found.")

    get_accessible_fdr(db, request.fdr_id, current_user)
    return request


# ---------- General ----------

@app.get("/")
def home():
    return {"message": "Welcome to FDR Sentinel", "status": "running"}


@app.get("/health")
def health_check():
    return {"status": "healthy", "application": "FDR Sentinel"}


# ---------- Institutions ----------


@app.post(
    "/api/institutions",
    response_model=InstitutionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_institution(
    institution_data: InstitutionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin")),
):
    institution = models.Institution(
        name=institution_data.name.strip(),
        institution_code=institution_data.institution_code.strip(),
        email=str(institution_data.email).lower().strip(),
        phone=institution_data.phone,
        address=institution_data.address,
    )

    try:
        db.add(institution)
        db.flush()

        record_audit_event(
            db=db,
            actor=current_user.email,
            action="INSTITUTION_CREATED",
            entity_type="Institution",
            entity_id=institution.id,
            details={
                "institution_code": institution.institution_code,
                "institution_name": institution.name,
            },
        )

        db.commit()
        db.refresh(institution)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Institution code or email already exists.",
        )

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save institution and audit event.",
        )

    return institution



@app.get("/api/institutions", response_model=list[InstitutionResponse])
def list_institutions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role == "admin":
        return db.query(models.Institution).order_by(models.Institution.id).all()

    if current_user.role != "institution":
        raise HTTPException(status_code=403, detail="Insufficient permissions.")

    if current_user.institution_id is None:
        return []

    institution = (
        db.query(models.Institution)
        .filter(models.Institution.id == current_user.institution_id)
        .all()
    )
    return institution


@app.get(
    "/api/institutions/{institution_id}",
    response_model=InstitutionResponse,
)
def get_institution(
    institution_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    check_institution_access(current_user, institution_id)

    institution = (
        db.query(models.Institution)
        .filter(models.Institution.id == institution_id)
        .first()
    )

    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found.")

    return institution


@app.patch(
    "/api/institutions/{institution_id}",
    response_model=InstitutionResponse,
)
def update_institution(
    institution_id: int,
    institution_data: InstitutionUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin")),
):
    institution = (
        db.query(models.Institution)
        .filter(models.Institution.id == institution_id)
        .first()
    )

    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found.")

    changed_fields: dict = {}

    if institution_data.name is not None:
        name = institution_data.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Institution name cannot be blank.")
        changed_fields["name"] = name
        institution.name = name

    if institution_data.email is not None:
        email = str(institution_data.email).lower().strip()
        changed_fields["email"] = email
        institution.email = email

    if institution_data.phone is not None:
        changed_fields["phone"] = institution_data.phone
        institution.phone = institution_data.phone

    if institution_data.address is not None:
        changed_fields["address"] = institution_data.address
        institution.address = institution_data.address

    if institution_data.is_active is not None:
        changed_fields["is_active"] = institution_data.is_active
        institution.is_active = institution_data.is_active

    if not changed_fields:
        raise HTTPException(
            status_code=422,
            detail="Provide at least one field to update.",
        )

    try:
        record_audit_event(
            db=db,
            actor=current_user.email,
            action="INSTITUTION_UPDATED",
            entity_type="Institution",
            entity_id=institution.id,
            details={
                "institution_code": institution.institution_code,
                "changed_fields": sorted(changed_fields.keys()),
            },
        )

        db.commit()
        db.refresh(institution)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Institution email already exists.",
        )
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update institution and record audit event.",
        )

    return institution


# ---------- FDRs ----------

@app.post(
    "/api/fdrs",
    response_model=FDRResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_fdr(
    fdr_data: FDRCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    institution = (
        db.query(models.Institution)
        .filter(models.Institution.id == fdr_data.institution_id)
        .first()
    )

    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found.")

    check_institution_access(current_user, fdr_data.institution_id)

    existing_fdr = (
        db.query(models.FDR)
        .filter(models.FDR.fdr_number == fdr_data.fdr_number)
        .first()
    )

    if existing_fdr is not None:
        raise HTTPException(status_code=409, detail="FDR number already exists.")

    fdr = models.FDR(
        institution_id=fdr_data.institution_id,
        fdr_number=fdr_data.fdr_number,
        bank_name=fdr_data.bank_name,
        branch_name=fdr_data.branch_name,
        deposit_amount=fdr_data.deposit_amount,
        issue_date=fdr_data.issue_date,
        maturity_date=fdr_data.maturity_date,
        interest_rate=fdr_data.interest_rate,
        status="submitted",
    )

    try:
        db.add(fdr)
        db.flush()

        record_audit_event(
            db=db,
            actor=current_user.email,
            action="FDR_SUBMITTED",
            entity_type="FDR",
            entity_id=fdr.id,
            details={
                "fdr_number": fdr.fdr_number,
                "institution_id": fdr.institution_id,
                "status": fdr.status,
            },
        )

        db.commit()
        db.refresh(fdr)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the FDR and audit event.",
        )

    return fdr


@app.get("/api/fdrs", response_model=list[FDRResponse])
def list_fdrs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.FDR)

    if current_user.role != "admin":
        if current_user.role != "institution":
            raise HTTPException(status_code=403, detail="Insufficient permissions.")

        if current_user.institution_id is None:
            return []

        query = query.filter(
            models.FDR.institution_id == current_user.institution_id
        )

    return query.order_by(models.FDR.id).all()


@app.get("/api/fdrs/{fdr_id}", response_model=FDRResponse)
def get_fdr(
    fdr_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return get_accessible_fdr(db, fdr_id, current_user)


# ---------- Verification ----------

@app.post(
    "/api/fdrs/{fdr_id}/verifications",
    response_model=VerificationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_verification(
    fdr_id: int,
    verification_data: VerificationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin")),
):
    fdr = get_accessible_fdr(db, fdr_id, current_user)

    verification = models.Verification(
        fdr_id=fdr.id,
        method=verification_data.method,
        result=verification_data.result,
        reference_number=verification_data.reference_number,
        remarks=verification_data.remarks,
        checked_by=current_user.email,
    )

    # Keep the FDR lifecycle status aligned with the recorded outcome so
    # dashboards and the registry reflect the latest verification attempt.
    if verification.result == "verified":
        new_status = "verified"
    elif verification.result == "failed":
        new_status = "verification_failed"
    elif fdr.status == "submitted":
        new_status = "under_verification"
    else:
        new_status = fdr.status

    try:
        db.add(verification)
        db.flush()

        record_audit_event(
            db=db,
            actor=current_user.email,
            action="FDR_VERIFICATION_RECORDED",
            entity_type="Verification",
            entity_id=verification.id,
            details={
                "fdr_id": fdr_id,
                "method": verification.method,
                "result": verification.result,
                "reference_number": verification.reference_number,
            },
        )

        if new_status != fdr.status:
            previous_status = fdr.status
            fdr.status = new_status
            record_audit_event(
                db=db,
                actor=current_user.email,
                action="FDR_STATUS_UPDATED",
                entity_type="FDR",
                entity_id=fdr.id,
                details={
                    "fdr_number": fdr.fdr_number,
                    "previous_status": previous_status,
                    "new_status": new_status,
                    "reason": "verification_recorded",
                },
            )

        db.commit()
        db.refresh(verification)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save verification and audit event.",
        )

    return verification


@app.get("/api/verifications", response_model=list[VerificationResponse])
def list_verifications(
    limit: int = 300,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if limit < 1 or limit > 1000:
        raise HTTPException(
            status_code=422,
            detail="Limit must be between 1 and 1000.",
        )

    query = db.query(models.Verification)

    if current_user.role != "admin":
        if current_user.role != "institution":
            raise HTTPException(status_code=403, detail="Insufficient permissions.")

        if current_user.institution_id is None:
            return []

        query = query.join(
            models.FDR,
            models.Verification.fdr_id == models.FDR.id,
        ).filter(models.FDR.institution_id == current_user.institution_id)

    return query.order_by(models.Verification.id.desc()).limit(limit).all()


@app.get(
    "/api/fdrs/{fdr_id}/verifications",
    response_model=list[VerificationResponse],
)
def get_verification_history(
    fdr_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_accessible_fdr(db, fdr_id, current_user)

    return (
        db.query(models.Verification)
        .filter(models.Verification.fdr_id == fdr_id)
        .order_by(
            models.Verification.created_at.asc(),
            models.Verification.id.asc(),
        )
        .all()
    )


# ---------- Release requests ----------

@app.post(
    "/api/fdrs/{fdr_id}/release-requests",
    response_model=ReleaseRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_release_request(
    fdr_id: int,
    request_data: ReleaseRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    fdr = get_accessible_fdr(db, fdr_id, current_user)

    requester = request_data.requested_by.strip()
    reason = request_data.reason.strip()

    if not requester or not reason:
        raise HTTPException(
            status_code=422,
            detail="Requester and reason cannot be blank.",
        )

    release_request = models.ReleaseRequest(
        fdr_id=fdr.id,
        requested_by=current_user.email,
        reason=reason,
        status="pending",
    )

    try:
        db.add(release_request)
        db.flush()

        record_audit_event(
            db=db,
            actor=current_user.email,
            action="RELEASE_REQUEST_CREATED",
            entity_type="ReleaseRequest",
            entity_id=release_request.id,
            details={"fdr_id": fdr.id},
        )

        if fdr.status == "verified":
            previous_status = fdr.status
            fdr.status = "release_pending"
            record_audit_event(
                db=db,
                actor=current_user.email,
                action="FDR_STATUS_UPDATED",
                entity_type="FDR",
                entity_id=fdr.id,
                details={
                    "fdr_number": fdr.fdr_number,
                    "previous_status": previous_status,
                    "new_status": "release_pending",
                    "reason": "release_requested",
                },
            )

        db.commit()
        db.refresh(release_request)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the release request.",
        )

    return release_request


@app.get("/api/release-requests", response_model=list[ReleaseRequestResponse])
def list_release_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.ReleaseRequest)

    if current_user.role != "admin":
        if current_user.role != "institution":
            raise HTTPException(status_code=403, detail="Insufficient permissions.")

        if current_user.institution_id is None:
            return []

        query = query.join(
            models.FDR,
            models.ReleaseRequest.fdr_id == models.FDR.id,
        ).filter(models.FDR.institution_id == current_user.institution_id)

    return query.order_by(models.ReleaseRequest.id.desc()).all()


@app.get(
    "/api/release-requests/{request_id}",
    response_model=ReleaseRequestResponse,
)
def get_release_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return get_accessible_release_request(db, request_id, current_user)


@app.patch(
    "/api/release-requests/{request_id}/review",
    response_model=ReleaseRequestResponse,
)
def review_release_request(
    request_id: int,
    review_data: ReleaseRequestReview,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin")),
):
    release_request = (
        db.query(models.ReleaseRequest)
        .filter(models.ReleaseRequest.id == request_id)
        .first()
    )

    if release_request is None:
        raise HTTPException(status_code=404, detail="Release request not found.")

    if release_request.status != "pending":
        raise HTTPException(
            status_code=409,
            detail="Only pending requests can be reviewed.",
        )

    remarks = review_data.review_remarks.strip()

    if not remarks:
        raise HTTPException(
            status_code=422,
            detail="Review remarks cannot be blank.",
        )

    old_status = release_request.status
    new_status = review_data.status

    release_request.status = new_status
    release_request.reviewed_by = current_user.email
    release_request.review_remarks = remarks
    release_request.reviewed_at = datetime.utcnow()

    linked_fdr = (
        db.query(models.FDR)
        .filter(models.FDR.id == release_request.fdr_id)
        .first()
    )

    try:
        record_audit_event(
            db=db,
            actor=current_user.email,
            action=f"RELEASE_REQUEST_{new_status.upper()}",
            entity_type="ReleaseRequest",
            entity_id=release_request.id,
            details={
                "fdr_id": release_request.fdr_id,
                "previous_status": old_status,
                "new_status": new_status,
                "review_remarks": remarks,
            },
        )

        if linked_fdr is not None:
            previous_fdr_status = linked_fdr.status

            if new_status == "approved":
                fdr_status = "released"
            elif linked_fdr.status == "release_pending":
                fdr_status = "verified"
            else:
                fdr_status = linked_fdr.status

            if fdr_status != previous_fdr_status:
                linked_fdr.status = fdr_status
                record_audit_event(
                    db=db,
                    actor=current_user.email,
                    action="FDR_STATUS_UPDATED",
                    entity_type="FDR",
                    entity_id=linked_fdr.id,
                    details={
                        "fdr_number": linked_fdr.fdr_number,
                        "previous_status": previous_fdr_status,
                        "new_status": fdr_status,
                        "reason": f"release_request_{new_status}",
                    },
                )

        db.commit()
        db.refresh(release_request)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not save the review and audit event.",
        )

    return release_request


# ---------- Audit logs ----------

@app.get("/api/audit-logs", response_model=list[AuditLogResponse])
def list_audit_logs(
    limit: int = 50,
    offset: int = 0,
    action: str | None = None,
    entity_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin")),
):
    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=422,
            detail="Limit must be between 1 and 100.",
        )

    if offset < 0:
        raise HTTPException(
            status_code=422,
            detail="Offset cannot be negative.",
        )

    query = db.query(models.AuditLog)

    if action:
        query = query.filter(models.AuditLog.action == action.strip())

    if entity_type:
        query = query.filter(models.AuditLog.entity_type == entity_type.strip())

    return (
        query.order_by(models.AuditLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
