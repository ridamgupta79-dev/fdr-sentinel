
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FDRCreate(BaseModel):
    institution_id: int = Field(gt=0)
    fdr_number: str = Field(min_length=1, max_length=100)
    bank_name: str = Field(min_length=1, max_length=200)
    branch_name: str | None = Field(default=None, max_length=200)

    deposit_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    issue_date: date
    maturity_date: date
    interest_rate: Decimal | None = Field(
        default=None,
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
    )

    @model_validator(mode="after")
    def validate_dates(self):
        if self.maturity_date <= self.issue_date:
            raise ValueError("Maturity date must be after issue date.")
        return self


class FDRResponse(BaseModel):
    id: int
    institution_id: int
    fdr_number: str
    bank_name: str
    branch_name: str | None = None
    deposit_amount: Decimal
    issue_date: date
    maturity_date: date
    interest_rate: Decimal | None = None
    certificate_path: str | None = None
    status: str

    model_config = ConfigDict(from_attributes=True)
