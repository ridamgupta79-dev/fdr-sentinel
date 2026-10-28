
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime


class VerificationCreate(BaseModel):
    method: str = Field(pattern="^(simulated|manual)$")
    result: str = Field(pattern="^(pending|verified|failed)$")
    reference_number: str | None = Field(default=None, max_length=100)
    remarks: str | None = Field(default=None, max_length=1000)
    checked_by: str | None = Field(default=None, max_length=150)


class VerificationResponse(BaseModel):
    id: int
    fdr_id: int
    method: str
    result: str
    reference_number: str | None = None
    remarks: str | None = None
    checked_by: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
