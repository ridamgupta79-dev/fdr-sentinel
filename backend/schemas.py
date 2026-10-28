
from pydantic import BaseModel, ConfigDict, EmailStr


class InstitutionCreate(BaseModel):
    name: str
    institution_code: str
    email: EmailStr
    phone: str | None = None
    address: str | None = None


class InstitutionUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool | None = None


class InstitutionResponse(BaseModel):
    id: int
    name: str
    institution_code: str
    email: EmailStr
    phone: str | None = None
    address: str | None = None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
