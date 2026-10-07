from fastapi import FastAPI

from engine.models import (
    TagReviewRequest,
    TagReviewResponse,
    ScaleInput,
    ScaleOutput,
)
from functions.tag_review import review_tags
from functions.scaling import scale

app = FastAPI(
    title="TIA Engineering Assistant",
    version="1.0.0",
    description=("Engineering review API for Siemens TIA Portal project data."),
)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
    }


@app.post(
    "/api/v1/tag-review",
    response_model=TagReviewResponse,
)
def tag_review(
    request: TagReviewRequest,
) -> TagReviewResponse:
    return review_tags(request.tags)


@app.post(
    "/api/v1/scale",
    response_model=ScaleOutput,
)
def scaling_request(
    request: ScaleInput,
) -> ScaleOutput:
    return scale(request)
