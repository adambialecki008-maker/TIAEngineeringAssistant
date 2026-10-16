from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from engine.models import (
    TagReviewRequest,
    TagReviewResponse,
    ScaleInput,
    ScaleOutput,
    ProcessSampleInput,
    ProcessSampleOutput,
)

from engine.udt import UdtSpecification
from engine.plc_db import DataBlockSpecification
from engine.function_block import FunctionBlockSpecification
from engine.function import FunctionSpecification
from engine.project import (
    GeneratedProjectSource,
    ProjectSpecification,
)

from engine.tia_openness import (
    router as tia_openness_router,
)

from functions.tag_review import review_tags
from functions.scaling import scale
from functions.tia_source_generator import (
    generate_project_source,
)

from database.repository import (
    insert_process_sample,
    get_latest_sample,
    get_samples_by_tag,
)

app = FastAPI(
    title="TIA Engineering Assistant",
    version="1.0.0",
    description=("Engineering assistant for Siemens " "TIA Portal projects."),
)


app.include_router(tia_openness_router)


app.mount(
    "/gui",
    StaticFiles(directory="gui"),
    name="gui",
)


@app.get("/")
def gui():
    return FileResponse("gui/index.html")


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


@app.post(
    "/api/v1/process-samples",
    status_code=201,
)
def insert_sample_request(
    request: ProcessSampleInput,
):
    insert_process_sample(request)

    return {
        "status": "ok",
    }


@app.get(
    "/api/v1/process-samples/{tag_name}/latest",
    status_code=200,
)
def get_last_sample_request(
    tag_name: str,
) -> ProcessSampleOutput:
    result = get_latest_sample(tag_name)

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Tag not found",
        )

    return ProcessSampleOutput(
        tag_name=result[1],
        value=result[2],
        unit=result[3],
        timestamp=result[4],
    )


@app.get(
    "/api/v1/process-samples/{tag_name}",
    status_code=200,
)
def get_samples_by_tag_request(
    tag_name: str,
    limit: int = Query(
        ge=1,
        le=100,
    ),
) -> list[ProcessSampleOutput]:
    results = get_samples_by_tag(
        tag_name,
        limit,
    )

    if not results:
        raise HTTPException(
            status_code=404,
            detail="Tag not found",
        )

    samples = []

    for result in results:
        sample = ProcessSampleOutput(
            tag_name=result[1],
            value=result[2],
            unit=result[3],
            timestamp=result[4],
        )

        samples.append(sample)

    return samples


@app.post("/api/v1/udt-specifications")
def create_udt_specification(
    specification: UdtSpecification,
) -> UdtSpecification:
    return specification


@app.post("/api/v1/db-specifications")
def create_db_specification(
    specification: DataBlockSpecification,
) -> DataBlockSpecification:
    return specification


@app.post("/api/v1/function-block-specifications")
def create_function_block_specification(
    specification: FunctionBlockSpecification,
) -> FunctionBlockSpecification:
    """Validate a read-only TIA FB snapshot; this endpoint never writes to TIA."""
    if specification.source_mode != "tia_read_only":
        raise HTTPException(
            status_code=422,
            detail="Function Blocks can only be loaded as read-only TIA snapshots.",
        )
    return specification


@app.post("/api/v1/function-specifications")
def create_function_specification(
    specification: FunctionSpecification,
) -> FunctionSpecification:
    """Validate a read-only TIA FC snapshot; this endpoint never writes to TIA."""
    if specification.source_mode != "tia_read_only":
        raise HTTPException(
            status_code=422,
            detail="Functions can only be loaded as read-only TIA snapshots.",
        )
    return specification


@app.post(
    "/api/v1/project-source",
    response_model=GeneratedProjectSource,
)
def generate_project_source_request(
    project: ProjectSpecification,
) -> GeneratedProjectSource:
    source = generate_project_source(project)

    return GeneratedProjectSource(source=source)
