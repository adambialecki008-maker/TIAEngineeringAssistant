import base64
import binascii

from fastapi import APIRouter, HTTPException, Query

from engine.tia.compat import run_adapter
from engine.tia.models import (
    HmiConnection,
    PlcResourceAttribute,
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
    hmi_networks = {}
    hmi_connections = {}
    hmi_connection_statuses = {}
    metrics_by_target = {}
    resources_by_target = {}
    resource_attributes_by_target = {}


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


        elif line.startswith("HMI_CONNECTION|"):
            parts = line.split("|")
            if len(parts) != 9:
                continue
            try:
                fields = [
                    base64.b64decode(part, validate=True).decode("utf-8")
                    for part in parts[1:]
                ]
            except (ValueError, binascii.Error, UnicodeDecodeError):
                continue
            device, hmi, name, driver, station, partner, node, online = fields
            if not name:
                continue
            key = (device.casefold(), hmi.casefold())
            hmi_connections.setdefault(key, []).append(
                HmiConnection(
                    name=name,
                    communication_driver=driver,
                    station=station,
                    partner=partner,
                    node=node,
                    online={"true": True, "false": False,
                            "1": True, "0": False}.get(online.casefold()),
                )
            )

        elif line.startswith("HMI_CONNECTION_STATUS|"):
            parts = line.split("|")
            if len(parts) != 5 or parts[3] not in (
                "complete", "partial", "unavailable"
            ):
                continue
            try:
                device, hmi, diagnostic = [
                    base64.b64decode(part, validate=True).decode("utf-8")
                    for part in (parts[1], parts[2], parts[4])
                ]
            except (ValueError, binascii.Error, UnicodeDecodeError):
                continue
            hmi_connection_statuses[(device.casefold(), hmi.casefold())] = (
                parts[3], diagnostic
            )

        elif line.startswith("HMI_NETWORK|"):
            parts = line.split("|", 4)
            if len(parts) == 5:
                hmi_networks[(parts[1].casefold(), parts[2].casefold())] = {
                    "ip_address": parts[3],
                    "plc_connections": [
                        part.strip() for part in parts[4].split(",")
                        if part.strip()
                    ],
                }

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
            "PLC_RESOURCE_ATTR|"
        ):
            parts = line.split(
                "|",
                5,
            )


            if len(parts) != 6:
                continue


            resource_attributes_by_target.setdefault(
                (
                    parts[1].casefold(),
                    parts[2].casefold(),
                ),
                [],
            ).append(
                PlcResourceAttribute(
                    source=parts[3],
                    name=parts[4],
                    value=parts[5],
                )
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


    for hmi in hmis:
        network = hmi_networks.get(
            (hmi.device_name.casefold(), hmi.hmi_name.casefold()), {}
        )
        hmi.ip_address = network.get("ip_address", "")
        key = (hmi.device_name.casefold(), hmi.hmi_name.casefold())
        status, diagnostic = hmi_connection_statuses.get(
            key, ("unavailable", "Connection status was not returned by the adapter.")
        )
        structured = hmi_connections.get(key, [])
        legacy_names = network.get("plc_connections", [])
        if key not in hmi_connection_statuses:
            if legacy_names:
                status = "partial"
                diagnostic = "Legacy adapter returned names without a completeness status."
                structured = [HmiConnection(name=name) for name in legacy_names]
            elif structured:
                status = "partial"
                diagnostic = "Connection entries were returned without a status."
        hmi.connections = structured
        hmi.plc_connections = [connection.name for connection in structured]
        hmi.connection_read_status = status
        hmi.connection_diagnostic = diagnostic

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


        plc.resource_attributes = (
            resource_attributes_by_target.get(
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
