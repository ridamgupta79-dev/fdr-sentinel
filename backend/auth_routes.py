
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.database import get_db
from backend.models import User, Institution
from backend.auth_schemas import (
    RegisterRequest,
    LoginRequest,
    UserResponse,
    TokenResponse,
    UserCreate,
    UserStatusUpdate,
    InstitutionAssignmentRequest,
)
from backend.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User is inactive or missing.")

    return user


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    email = str(data.email).lower().strip()

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered.")

    # Public registration must not allow users to select an institution.
    user = User(
        full_name=data.full_name.strip(),
        email=email,
        password_hash=hash_password(data.password),
        role="institution",
        institution_id=None,
    )

    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered.")

    return user


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    email = str(data.email).lower().strip()
    user = db.query(User).filter(User.email == email).first()

    if (
        user is None
        or not user.is_active
        or not verify_password(data.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "access_token": create_access_token(user.id, user.role),
        "token_type": "bearer",
        "user": user,
    }


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


def require_roles(*allowed_roles):
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to perform this action.",
            )
        return current_user

    return role_checker


from backend.services.audit_service import record_audit_event


# ---------- Admin user management ----------

@router.get("/users", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    return db.query(User).order_by(User.id).all()


@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    email = str(data.email).lower().strip()

    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered.")

    if data.institution_id is not None:
        institution = (
            db.query(Institution)
            .filter(Institution.id == data.institution_id)
            .first()
        )
        if institution is None:
            raise HTTPException(status_code=404, detail="Institution not found.")

    user = User(
        full_name=data.full_name.strip(),
        email=email,
        password_hash=hash_password(data.password),
        role=data.role,
        institution_id=data.institution_id,
    )

    try:
        db.add(user)
        db.flush()

        record_audit_event(
            db=db,
            actor=admin.email,
            action="USER_CREATED",
            entity_type="User",
            entity_id=user.id,
            details={
                "user_email": user.email,
                "role": user.role,
                "institution_id": user.institution_id,
            },
        )

        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered.")
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not create the user and record the audit event.",
        )

    return user


@router.patch("/users/{user_id}/status", response_model=UserResponse)
def set_user_status(
    user_id: int,
    data: UserStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.id == admin.id and not data.is_active:
        raise HTTPException(
            status_code=409,
            detail="You cannot deactivate your own account.",
        )

    previous_status = user.is_active
    user.is_active = data.is_active

    try:
        record_audit_event(
            db=db,
            actor=admin.email,
            action="USER_STATUS_CHANGED",
            entity_type="User",
            entity_id=user.id,
            details={
                "user_email": user.email,
                "previous_is_active": previous_status,
                "new_is_active": user.is_active,
            },
        )

        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not change user status and record the audit event.",
        )

    return user


@router.patch("/users/{user_id}/institution", response_model=UserResponse)
def assign_user_institution(
    user_id: int,
    data: InstitutionAssignmentRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("admin")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    institution = (
        db.query(Institution)
        .filter(Institution.id == data.institution_id)
        .first()
    )
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found.")

    previous_institution_id = user.institution_id
    user.institution_id = institution.id

    try:
        record_audit_event(
            db=db,
            actor=admin.email,
            action="USER_INSTITUTION_ASSIGNED",
            entity_type="User",
            entity_id=user.id,
            details={
                "user_email": user.email,
                "previous_institution_id": previous_institution_id,
                "new_institution_id": institution.id,
            },
        )

        db.commit()
        db.refresh(user)

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not assign institution and record audit event.",
        )

    return user
