from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class IssueSeverity(StrEnum):
    WARNING = "warning"
    ERROR = "error"


class PlcTag(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    data_type: str = Field(min_length=1, max_length=128)
    address: str | None = None
    comment: str | None = None


class TagReviewRequest(BaseModel):
    tags: list[PlcTag] = Field(min_length=1)


class TagReviewIssue(BaseModel):
    severity: IssueSeverity
    code: str
    message: str
    tag_name: str | None = None


class TagReviewSummary(BaseModel):
    total_tags: int
    errors: int
    warnings: int


class TagReviewResponse(BaseModel):
    summary: TagReviewSummary
    issues: list[TagReviewIssue]


class ScaleInput(BaseModel):
    raw_value: float
    raw_min: float
    raw_max: float
    engineering_min: float
    engineering_max: float

    @model_validator(mode="after")
    def validate_raw_scaling_range(self):
        if self.raw_min == self.raw_max:
            raise ValueError
        return self


class ScaleOutput(BaseModel):
    scaled_value: float


@model_validator(mode="after")
def validate_raw_scaling_range(self):
    if self.raw_min == self.raw_max:
        raise ValueError
    return self
