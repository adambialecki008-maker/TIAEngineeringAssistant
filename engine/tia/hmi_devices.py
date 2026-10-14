"""Guarded whole-device HMI copy using a configured existing Classic HMI.

The clone keeps its original hardware/display dimensions. It never attempts
unsafe cross-device screen scaling or invents PLC tag connection mappings.
"""
from ipaddress import IPv4Address

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.tia.compat import run_adapter
from engine.tia.adapter import read_project_saved


router = APIRouter()


class CloneHmiRequest(BaseModel):
    process_id: int = Field(ge=1)
    source_device_name: str = Field(min_length=1, max_length=128)
    source_hmi_name: str = Field(min_length=1, max_length=128)
    target_device_name: str = Field(min_length=1, max_length=128)
    target_ip_address: IPv4Address
    plc_device_name: str = Field(min_length=1, max_length=128)
    plc_name: str = Field(min_length=1, max_length=128)
    existing_connection_name: str = Field(min_length=1, max_length=128)
    backup_confirmed: bool = False
    scale_to_different_device: bool = False


@router.post("/hmis/clone", status_code=201)
def clone_hmi(request: CloneHmiRequest):
    if not request.backup_confirmed:
        raise HTTPException(
            422, "Confirm that you are working on a backup/copy of the TIA project."
        )
    if request.scale_to_different_device:
        raise HTTPException(
            422, "Cross-resolution HMI screen item scaling is not validated "
            "in TIA Openness V21. Same-model clone is supported only."
        )
    if request.source_device_name.casefold() == request.target_device_name.casefold():
        raise HTTPException(422, "Source and target HMI device names must differ.")
    lines = run_adapter(
        "clone-hmi",
        str(request.process_id),
        request.source_device_name,
        request.source_hmi_name,
        request.target_device_name,
        str(request.target_ip_address),
        request.plc_device_name,
        request.plc_name,
        request.existing_connection_name,
    )
    for line in lines:
        if not line.startswith("HMI_CLONED|"):
            continue
        pieces = line.split("|", 5)
        if len(pieces) != 6:
            continue
        return {
            "status": "created",
            "source_device_name": pieces[1],
            "target_device_name": pieces[2],
            "ip_address": pieces[3],
            "plc_connection": pieces[4],
            "verified_connected_tags": int(pieces[5]),
            "project_saved": read_project_saved(lines),
            "screen_scaling": "unchanged_same_model",
            "note": "Check compile, tag address resolution and runtime screen layout in TIA.",
        }
    raise HTTPException(
        502, "Openness did not confirm the created HMI device. Inspect "
        "TIA and its project library before retrying."
    )
