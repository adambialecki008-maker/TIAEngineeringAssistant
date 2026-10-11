from fastapi import APIRouter, HTTPException, Query

from engine.tia.adapter import read_project_saved
from engine.tia.compat import run_adapter
from engine.tia.models import (
    CreatePlcRequest,
    DeletePlcRequest,
    PlcModel,
    PlcMutationResponse,
    RenamePlcRequest,
)


router = APIRouter()


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
    lines = run_adapter(
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
    lines = run_adapter(
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
                type_identifier = parts[1]


        elif line.startswith(
            "PLC_CREATED|"
        ):
            parts = line.split(
                "|",
                2,
            )


            if len(parts) == 3:
                device_name = parts[1]
                plc_name = parts[2]


    if (
        device_name is None
        or plc_name is None
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
        project_saved=read_project_saved(
            lines
        ),
    )


@router.patch(
    "/plcs",
    response_model=PlcMutationResponse,
)
def rename_plc(
    request: RenamePlcRequest,
):
    lines = run_adapter(
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
            device_name = parts[1]
            plc_name = parts[2]


    if (
        device_name is None
        or plc_name is None
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
        project_saved=read_project_saved(
            lines
        ),
    )


@router.delete(
    "/plcs",
    response_model=PlcMutationResponse,
)
def delete_plc(
    request: DeletePlcRequest,
):
    lines = run_adapter(
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
            device_name = parts[1]
            plc_name = parts[2]


    if (
        device_name is None
        or plc_name is None
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
        project_saved=read_project_saved(
            lines
        ),
    )
