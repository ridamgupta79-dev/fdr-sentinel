
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator 


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    institution_id: int | None = Field(default=None, gt=0)


ALLOWED_MANAGED_ROLES = ("institution", "admin")


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="institution")

    @model_validator(mode="after")
    def validate_role(self):
        if self.role not in ALLOWED_MANAGED_ROLES:
            raise ValueError("Role must be institution or admin.")
        return self


class UserStatusUpdate(BaseModel):
    is_active: bool


class InstitutionAssignmentRequest(BaseModel):
    institution_id: int = Field(gt=0)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: str
    institution_id: int | None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
