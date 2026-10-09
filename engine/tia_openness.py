from pathlib import Path
import subprocess
import tempfile

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
    tags=[
        "TIA Openness",
    ],
)


PROJECT_ROOT = (
    Path(__file__)
    .resolve()
    .parents[1]
)


ADAPTER_EXE = (
    PROJECT_ROOT
    / "openness_adapter"
    / "bin"
    / "Debug"
    / "net48"
    / "TiaOpennessAdapter.exe"
)


class TiaProcess(
    BaseModel
):
    process_id: int


class ProjectPlc(
    BaseModel
):
    device_name: str

    plc_name: str

    device_type_identifier: str = ""

    plc_type_identifier: str = ""


class HardwareItem(BaseModel):
    device_name: str
    item_path: str
    item_name: str
    type_identifier: str
    is_plugged: bool
    address_count: int
    channel_count: int


class IoAddress(BaseModel):
    device_name: str
    item_path: str
    item_name: str
    type_identifier: str
    io_type: str
    start_address: int
    length: int


class IoChannel(BaseModel):
    device_name: str
    item_path: str
    item_name: str
    type_identifier: str
    channel_number: int
    io_type: str
    channel_type: str
    channel_address_bits: int
    channel_width_bits: int


class IoInventory(BaseModel):
    project_name: str | None = None
    items: list[HardwareItem]
    addresses: list[IoAddress]
    channels: list[IoChannel]


class PlcTagSpec(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    data_type: str = Field(min_length=1, max_length=64)
    logical_address: str = Field(min_length=1, max_length=64)


class CreatePlcTagsRequest(BaseModel):
    process_id: int = Field(ge=1)
    device_name: str = Field(min_length=1, max_length=128)
    plc_name: str = Field(min_length=1, max_length=128)
    tag_table_name: str = Field(
        default="TIAEngineeringAssistant",
        min_length=1,
        max_length=128,
    )
    tags: list[PlcTagSpec] = Field(min_length=1)


class CreatePlcTagsResponse(BaseModel):
    status: str
    tag_table_name: str
    created_count: int
    project_saved: str | None = None


class PlcModel(
    BaseModel
):
    family: str

    name: str

    article_number: str

    version: str

    type_identifier: str


class CreatePlcRequest(
    BaseModel
):
    process_id: int = Field(
        ge=1
    )

    selection: str = Field(
        min_length=1,
        max_length=256,
    )

    plc_name: str = Field(
        min_length=1,
        max_length=128,
    )

    device_name: str = Field(
        min_length=1,
        max_length=128,
    )


class RenamePlcRequest(
    BaseModel
):
    process_id: int = Field(
        ge=1
    )

    current_device_name: str = Field(
        min_length=1,
        max_length=128,
    )

    current_plc_name: str = Field(
        min_length=1,
        max_length=128,
    )

    new_device_name: str = Field(
        min_length=1,
        max_length=128,
    )

    new_plc_name: str = Field(
        min_length=1,
        max_length=128,
    )


class DeletePlcRequest(
    BaseModel
):
    process_id: int = Field(
        ge=1
    )

    device_name: str = Field(
        min_length=1,
        max_length=128,
    )

    plc_name: str = Field(
        min_length=1,
        max_length=128,
    )


class PlcMutationResponse(
    BaseModel
):
    status: str

    device_name: str

    plc_name: str

    type_identifier: str | None = None

    project_saved: str | None = None


def _adapter_error_status(
    detail: str,
) -> int:
    normalized = detail.strip()


    if (
        normalized.startswith(
            "PLC_TYPE_NOT_FOUND|"
        )
        or
        normalized.startswith(
            "PLC_NOT_FOUND|"
        )
        or
        "process"
        in normalized.lower()
        and
        "not found"
        in normalized.lower()
    ):
        return 404


    if (
        normalized.startswith(
            "DEVICE_NAME_EXISTS|"
        )
        or
        normalized.startswith(
            "TAG_NAME_EXISTS|"
        )
        or
        normalized.startswith(
            "TAG_ADDRESS_EXISTS|"
        )
        or
        normalized.startswith(
            "PLC_NAME_EXISTS|"
        )
        or
        normalized.startswith(
            "NO_OPEN_PROJECT"
        )
        or
        normalized.startswith(
            "MORE_THAN_ONE_PROJECT"
        )
    ):
        return 409


    if (
        normalized.startswith(
            "Unsupported PLC family:"
        )
        or
        normalized.startswith(
            "NO_TAGS_TO_CREATE"
        )
        or
        normalized.startswith(
            "TAG_TABLE_NAME_REQUIRED"
        )
    ):
        return 422


    return 502


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
        creation_flags = (
            subprocess.CREATE_NO_WINDOW
        )


    try:
        result = subprocess.run(
            [
                str(
                    ADAPTER_EXE
                ),
                *arguments,
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            creationflags=creation_flags,
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail=(
                "TIA Openness adapter timed out."
            ),
        )


    stdout = (
        result.stdout
        or ""
    ).strip()


    stderr = (
        result.stderr
        or ""
    ).strip()


    if result.returncode != 0:
        detail = (
            stderr
            or
            stdout
            or
            (
                "TIA Openness adapter failed "
                f"with exit code "
                f"{result.returncode}."
            )
        )


        raise HTTPException(
            status_code=(
                _adapter_error_status(
                    detail
                )
            ),
            detail=detail,
        )


    return [
        line.strip()
        for line
        in stdout.splitlines()
        if line.strip()
    ]


def _read_project_saved(
    lines: list[str],
) -> str | None:
    for line in lines:
        if not line.startswith(
            "PROJECT_SAVED|"
        ):
            continue


        parts = line.split(
            "|",
            1,
        )


        if len(parts) == 2:
            return parts[1]


    return None


@router.get(
    "/processes",
    response_model=list[TiaProcess],
)
def get_tia_processes():
    lines = _run_adapter(
        "list"
    )


    processes = []


    for line in lines:
        if not line.startswith(
            "TIA_PROCESS|"
        ):
            continue


        parts = line.split(
            "|",
            1,
        )


        if len(parts) != 2:
            continue


        try:
            process_id = int(
                parts[1]
            )

        except ValueError:
            continue


        processes.append(
            TiaProcess(
                process_id=process_id
            )
        )


    return processes


@router.get(
    "/plcs",
    response_model=list[ProjectPlc],
)
def get_project_plcs(
    process_id: int = Query(
        ge=1
    ),
):
    lines = _run_adapter(
        "list-project-plcs",
        str(
            process_id
        ),
    )


    plcs = []


    for line in lines:
        if not line.startswith(
            "PLC|"
        ):
            continue


        parts = line.split(
            "|",
            4,
        )


        if len(parts) != 5:
            continue


        plcs.append(
            ProjectPlc(
                device_name=parts[1],
                plc_name=parts[2],
                device_type_identifier=parts[3],
                plc_type_identifier=parts[4],
            )
        )


    return plcs


@router.get(
    "/io",
    response_model=IoInventory,
)
def get_project_io(
    process_id: int = Query(
        ge=1
    ),
):
    lines = _run_adapter(
        "list-io",
        str(
            process_id
        ),
    )


    project_name = None
    items = []
    addresses = []
    channels = []


    for line in lines:
        if line.startswith(
            "PROJECT|"
        ):
            parts = line.split(
                "|",
                1,
            )

            if len(parts) == 2:
                project_name = parts[1]


        elif line.startswith(
            "HW_ITEM|"
        ):
            parts = line.split(
                "|",
                7,
            )

            if len(parts) != 8:
                continue

            try:
                items.append(
                    HardwareItem(
                        device_name=parts[1],
                        item_path=parts[2],
                        item_name=parts[3],
                        type_identifier=parts[4],
                        is_plugged=(
                            parts[5].strip().lower()
                            == "true"
                        ),
                        address_count=int(parts[6]),
                        channel_count=int(parts[7]),
                    )
                )
            except ValueError:
                continue


        elif line.startswith(
            "IO_ADDRESS|"
        ):
            parts = line.split(
                "|",
                7,
            )

            if len(parts) != 8:
                continue

            try:
                addresses.append(
                    IoAddress(
                        device_name=parts[1],
                        item_path=parts[2],
                        item_name=parts[3],
                        type_identifier=parts[4],
                        io_type=parts[5],
                        start_address=int(parts[6]),
                        length=int(parts[7]),
                    )
                )
            except ValueError:
                continue


        elif line.startswith(
            "IO_CHANNEL|"
        ):
            parts = line.split(
                "|",
                9,
            )

            if len(parts) != 10:
                continue

            try:
                channels.append(
                    IoChannel(
                        device_name=parts[1],
                        item_path=parts[2],
                        item_name=parts[3],
                        type_identifier=parts[4],
                        channel_number=int(parts[5]),
                        io_type=parts[6],
                        channel_type=parts[7],
                        channel_address_bits=int(parts[8]),
                        channel_width_bits=int(parts[9]),
                    )
                )
            except ValueError:
                continue


    channels.sort(
        key=lambda item: (
            item.io_type.casefold(),
            item.channel_address_bits,
            item.device_name.casefold(),
            item.item_path.casefold(),
            item.channel_number,
        )
    )


    items.sort(
        key=lambda item: (
            item.device_name.casefold(),
            item.item_path.casefold(),
        )
    )


    return IoInventory(
        project_name=project_name,
        items=items,
        addresses=addresses,
        channels=channels,
    )


@router.post(
    "/plc-tags",
    response_model=CreatePlcTagsResponse,
    status_code=201,
)
def create_plc_tags(
    request: CreatePlcTagsRequest,
):
    for tag in request.tags:
        for value in (
            tag.name,
            tag.data_type,
            tag.logical_address,
        ):
            if "\\t" in value or "\\n" in value or "\\r" in value:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Tag fields cannot contain tabs or line breaks."
                    ),
                )


    temporary_path = None


    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            suffix=".tsv",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(
                temporary_file.name
            )

            for tag in request.tags:
                temporary_file.write(
                    f"{tag.name}\\t"
                    f"{tag.data_type}\\t"
                    f"{tag.logical_address}\\n"
                )


        lines = _run_adapter(
            "create-tags",
            str(
                request.process_id
            ),
            request.device_name.strip(),
            request.plc_name.strip(),
            request.tag_table_name.strip(),
            str(
                temporary_path
            ),
        )

    finally:
        if (
            temporary_path is not None
            and
            temporary_path.exists()
        ):
            try:
                temporary_path.unlink()
            except OSError:
                pass


    created_count = 0
    tag_table_name = request.tag_table_name.strip()


    for line in lines:
        if line.startswith(
            "TAG_CREATED|"
        ):
            created_count += 1

        elif line.startswith(
            "TAG_TABLE|"
        ):
            parts = line.split(
                "|",
                1,
            )

            if len(parts) == 2:
                tag_table_name = parts[1]


    if created_count != len(
        request.tags
    ):
        raise HTTPException(
            status_code=502,
            detail=(
                "Adapter did not confirm creation of all PLC tags."
            ),
        )


    return CreatePlcTagsResponse(
        status="created",
        tag_table_name=tag_table_name,
        created_count=created_count,
        project_saved=(
            _read_project_saved(
                lines
            )
        ),
    )


@router.get(
    "/plc-models",
    response_model=list[PlcModel],
)
def get_plc_models(
    process_id: int = Query(
        ge=1
    ),
    family: str = Query(
        min_length=1
    ),
):
    lines = _run_adapter(
        "list-plcs",
        str(
            process_id
        ),
        family,
    )


    models = []


    for line in lines:
        if not line.startswith(
            "PLC_MODEL|"
        ):
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


    models.sort(
        key=lambda model:
            model.name.casefold()
    )


    return models


@router.post(
    "/plcs",
    response_model=PlcMutationResponse,
    status_code=201,
)
def create_plc(
    request: CreatePlcRequest,
):
    lines = _run_adapter(
        "create-plc",
        str(
            request.process_id
        ),
        request.selection.strip(),
        request.plc_name.strip(),
        request.device_name.strip(),
    )


    type_identifier = None

    device_name = None

    plc_name = None


    for line in lines:
        if line.startswith(
            "PLC_TYPE|"
        ):
            parts = line.split(
                "|",
                1,
            )

            if len(parts) == 2:
                type_identifier = (
                    parts[1]
                )


        elif line.startswith(
            "PLC_CREATED|"
        ):
            parts = line.split(
                "|",
                2,
            )

            if len(parts) == 3:
                device_name = (
                    parts[1]
                )

                plc_name = (
                    parts[2]
                )


    if (
        device_name is None
        or
        plc_name is None
    ):
        raise HTTPException(
            status_code=502,
            detail=(
                "Adapter finished without "
                "PLC_CREATED response."
            ),
        )


    return PlcMutationResponse(
        status="created",
        device_name=device_name,
        plc_name=plc_name,
        type_identifier=type_identifier,
        project_saved=(
            _read_project_saved(
                lines
            )
        ),
    )


@router.patch(
    "/plcs",
    response_model=PlcMutationResponse,
)
def rename_plc(
    request: RenamePlcRequest,
):
    lines = _run_adapter(
        "rename-plc",
        str(
            request.process_id
        ),
        request.current_device_name.strip(),
        request.current_plc_name.strip(),
        request.new_device_name.strip(),
        request.new_plc_name.strip(),
    )


    device_name = None

    plc_name = None


    for line in lines:
        if not line.startswith(
            "PLC_RENAMED|"
        ):
            continue


        parts = line.split(
            "|",
            2,
        )


        if len(parts) == 3:
            device_name = (
                parts[1]
            )

            plc_name = (
                parts[2]
            )


    if (
        device_name is None
        or
        plc_name is None
    ):
        raise HTTPException(
            status_code=502,
            detail=(
                "Adapter finished without "
                "PLC_RENAMED response."
            ),
        )


    return PlcMutationResponse(
        status="renamed",
        device_name=device_name,
        plc_name=plc_name,
        project_saved=(
            _read_project_saved(
                lines
            )
        ),
    )


@router.delete(
    "/plcs",
    response_model=PlcMutationResponse,
)
def delete_plc(
    request: DeletePlcRequest,
):
    lines = _run_adapter(
        "delete-plc",
        str(
            request.process_id
        ),
        request.device_name.strip(),
        request.plc_name.strip(),
    )


    device_name = None

    plc_name = None


    for line in lines:
        if not line.startswith(
            "PLC_DELETED|"
        ):
            continue


        parts = line.split(
            "|",
            2,
        )


        if len(parts) == 3:
            device_name = (
                parts[1]
            )

            plc_name = (
                parts[2]
            )


    if (
        device_name is None
        or
        plc_name is None
    ):
        raise HTTPException(
            status_code=502,
            detail=(
                "Adapter finished without "
                "PLC_DELETED response."
            ),
        )


    return PlcMutationResponse(
        status="deleted",
        device_name=device_name,
        plc_name=plc_name,
        project_saved=(
            _read_project_saved(
                lines
            )
        ),
    )
