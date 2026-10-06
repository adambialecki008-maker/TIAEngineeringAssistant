from enum import StrEnum

from pydantic import BaseModel, Field


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
