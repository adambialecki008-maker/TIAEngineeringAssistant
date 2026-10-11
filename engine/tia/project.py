from fastapi import APIRouter, HTTPException, Query

from engine.tia.compat import run_adapter
from engine.tia.models import (
    PlcResourceRow,
    ProjectHmi,
    ProjectPlc,
    TiaProcess,
    TiaProjectContext,
    TiaProjectInfo,
)


router = APIRouter()


@router.get(
    "/processes",
    response_model=list[TiaProcess],
)
def get_tia_processes():
    lines = run_adapter(
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
    "/project-context",
    response_model=TiaProjectContext,
)
def get_project_context(
    process_id: int = Query(
        ge=1
    ),
):
    lines = run_adapter(
        "list-project-plcs",
        str(
            process_id
        ),
    )


    project_name = ""
    plcs = []
    hmis = []
    metrics_by_target = {}
    resources_by_target = {}


    for line in lines:
        if line.startswith(
            "PROJECT|"
        ):
            parts = line.split(
                "|",
                1,
            )


            if (
                len(parts) == 2
                and parts[1].strip()
            ):
                project_name = parts[1].strip()


        elif line.startswith(
            "HMI|"
        ):
            parts = line.split(
                "|",
                6,
            )


            if len(parts) != 7:
                continue


            hmis.append(
                ProjectHmi(
                    device_name=parts[1],
                    hmi_name=parts[2],
                    device_type_identifier=parts[3],
                    hmi_type_identifier=parts[4],
                    software_type=parts[5],
                    software_name=parts[6],
                )
            )


        elif line.startswith(
            "PLC_RESOURCE|"
        ):
            parts = line.split(
                "|",
                7,
            )


            if len(parts) != 8:
                continue


            try:
                row = PlcResourceRow(
                    object_type=parts[3],
                    load_memory_bytes=int(
                        parts[4]
                    ),
                    code_work_memory_bytes=int(
                        parts[5]
                    ),
                    data_work_memory_bytes=int(
                        parts[6]
                    ),
                    retain_memory_bytes=(
                        int(
                            parts[7]
                        )
                        if parts[7].strip()
                        else None
                    ),
                )

            except ValueError:
                continue


            resources_by_target.setdefault(
                (
                    parts[1].casefold(),
                    parts[2].casefold(),
                ),
                [],
            ).append(
                row
            )


        elif line.startswith(
            "PLC_METRICS|"
        ):
            parts = line.split(
                "|",
                7,
            )


            if len(parts) != 8:
                continue


            try:
                metrics_by_target[
                    (
                        parts[1].casefold(),
                        parts[2].casefold(),
                    )
                ] = {
                    "online_state":
                        parts[3],

                    "block_count":
                        int(
                            parts[4]
                        ),

                    "data_block_count":
                        int(
                            parts[5]
                        ),

                    "udt_count":
                        int(
                            parts[6]
                        ),

                    "tag_count":
                        int(
                            parts[7]
                        ),
                }

            except ValueError:
                continue


        elif line.startswith(
            "PLC|"
        ):
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


    for plc in plcs:
        key = (
            plc.device_name.casefold(),
            plc.plc_name.casefold(),
        )

        metrics = metrics_by_target.get(
            key
        )


        if metrics:
            plc.online_state = metrics[
                "online_state"
            ]

            plc.block_count = metrics[
                "block_count"
            ]

            plc.data_block_count = metrics[
                "data_block_count"
            ]

            plc.udt_count = metrics[
                "udt_count"
            ]

            plc.tag_count = metrics[
                "tag_count"
            ]


        plc.resource_rows = (
            resources_by_target.get(
                key,
                [],
            )
        )


    if not project_name:
        raise HTTPException(
            status_code=404,
            detail=(
                "No open TIA project found "
                "for the selected process."
            ),
        )


    return TiaProjectContext(
        project_name=project_name,
        plcs=plcs,
        hmis=hmis,
    )


@router.get(
    "/project-info",
    response_model=TiaProjectInfo,
)
def get_project_info(
    process_id: int = Query(
        ge=1
    ),
):
    lines = run_adapter(
        "list-project-plcs",
        str(
            process_id
        ),
    )


    for line in lines:
        if not line.startswith(
            "PROJECT|"
        ):
            continue


        parts = line.split(
            "|",
            1,
        )


        if (
            len(parts) == 2
            and parts[1].strip()
        ):
            return TiaProjectInfo(
                project_name=parts[1].strip()
            )


    raise HTTPException(
        status_code=404,
        detail=(
            "No open TIA project found "
            "for the selected process."
        ),
    )


@router.get(
    "/plcs",
    response_model=list[ProjectPlc],
)
def get_project_plcs(
    process_id: int = Query(
        ge=1
    ),
):
    lines = run_adapter(
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
