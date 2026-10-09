from pathlib import Path
import subprocess

from fastapi import (
    APIRouter,
    HTTPException,
    Query,
)

from pydantic import (
    BaseModel,
    Field,
)

router = APIRouter(
    prefix="/api/v1/tia",
    tags=["TIA Openness"],
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]


ADAPTER_EXE = (
    PROJECT_ROOT
    / "openness_adapter"
    / "bin"
    / "Debug"
    / "net48"
    / "TiaOpennessAdapter.exe"
)


class TiaProcess(BaseModel):
    process_id: int


class PlcModel(BaseModel):
    family: str
    name: str
    article_number: str
    version: str
    type_identifier: str


class CreatePlcRequest(BaseModel):
    process_id: int

    selection: str = Field(min_length=1)

    plc_name: str = Field(
        default="PLC_1",
        min_length=1,
    )


class CreatePlcResponse(BaseModel):
    device_name: str
    software_name: str
    project_saved: str | None = None


def _run_adapter(
    *arguments: str,
) -> list[str]:
    if not ADAPTER_EXE.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "TIA Openness adapter is not built. "
                "Run setup.ps1 or dotnet build first."
            ),
        )

    creation_flags = 0

    if hasattr(
        subprocess,
        "CREATE_NO_WINDOW",
    ):
        creation_flags = subprocess.CREATE_NO_WINDOW

    try:
        result = subprocess.run(
            [
                str(ADAPTER_EXE),
                *arguments,
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=120,
            creationflags=creation_flags,
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail=("TIA Openness adapter timed out."),
        )

    stdout = (result.stdout or "").strip()

    stderr = (result.stderr or "").strip()

    if result.returncode != 0:
        detail = (
            stderr
            or stdout
            or ("TIA Openness adapter failed " f"with exit code {result.returncode}.")
        )

        raise HTTPException(
            status_code=502,
            detail=detail,
        )

    return [line.strip() for line in stdout.splitlines() if line.strip()]


@router.get(
    "/processes",
    response_model=list[TiaProcess],
)
def get_tia_processes():
    lines = _run_adapter("list")

    processes = []

    for line in lines:
        if not line.startswith("TIA_PROCESS|"):
            continue

        parts = line.split(
            "|",
            1,
        )

        processes.append(TiaProcess(process_id=int(parts[1])))

    return processes


@router.get(
    "/plc-models",
    response_model=list[PlcModel],
)
def get_plc_models(
    process_id: int = Query(ge=1),
    family: str = Query(min_length=1),
):
    lines = _run_adapter(
        "list-plcs",
        str(process_id),
        family,
    )

    models = []

    for line in lines:
        if not line.startswith("PLC_MODEL|"):
            continue

        parts = line.split(
            "|",
            5,
        )

        if len(parts) != 6:
            continue

        models.append(
            PlcModel(
                family=parts[1],
                name=parts[2],
                article_number=parts[3],
                version=parts[4],
                type_identifier=parts[5],
            )
        )

    return models


@router.post(
    "/plcs",
    response_model=CreatePlcResponse,
)
def create_plc(
    request: CreatePlcRequest,
):
    lines = _run_adapter(
        "create-plc",
        str(request.process_id),
        request.selection,
        request.plc_name,
        request.plc_name,
    )

    device_name = None
    software_name = None
    project_saved = None

    for line in lines:
        if line.startswith("PLC_CREATED|"):
            parts = line.split(
                "|",
                2,
            )

            if len(parts) == 3:
                device_name = parts[1]
                software_name = parts[2]

        elif line.startswith("PROJECT_SAVED|"):
            parts = line.split(
                "|",
                1,
            )

            if len(parts) == 2:
                project_saved = parts[1]

    if device_name is None or software_name is None:
        raise HTTPException(
            status_code=502,
            detail=("Adapter finished without " "PLC_CREATED response."),
        )

    return CreatePlcResponse(
        device_name=device_name,
        software_name=software_name,
        project_saved=project_saved,
    )
