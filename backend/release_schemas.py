
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic import model_validator



class ReleaseRequestCreate(BaseModel):
    requested_by: str = Field(min_length=1, max_length=150)
    reason: str = Field(min_length=1, max_length=5000)


class ReleaseRequestResponse(BaseModel):
    id: int
    fdr_id: int
    requested_by: str
    reason: str
    status: str
    reviewed_by: str | None = None
    review_remarks: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ReleaseRequestReview(BaseModel):
    status: str
    reviewed_by: str = Field(min_length=1, max_length=150)
    review_remarks: str = Field(min_length=1, max_length=5000)

    @model_validator(mode="after")
    def validate_status(self):
        if self.status not in ("approved", "rejected"):
            raise ValueError(
                "Status must be approved or rejected."
            )
        return self
