"""Guarded pilot import: one PLC data type and one global data block.

The plan endpoint is read-only. The apply endpoint is intentionally restricted
to a single UDT/DB pair and rechecks the live project before any write.
"""
from __future__ import annotations

import hashlib
import json
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.project import ProjectSpecification
from engine.tia.compat import run_adapter
from engine.tia.project import get_project_context
from engine.tia.structures import get_plc_structures
from functions.tia_source_generator import generate_db_source, generate_udt_source


router = APIRouter()
_VALID_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_VALID_TYPE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\[[0-9]+\])?$")


class PlcStructureImportRequest(BaseModel):
    process_id: int = Field(ge=1)
    device_name: str = Field(min_length=1, max_length=128)
    plc_name: str = Field(min_length=1, max_length=128)
    project: ProjectSpecification


class PlcStructureApplyRequest(PlcStructureImportRequest):
    expected_token: str = Field(pattern=r"^[a-f0-9]{64}$")
    backup_confirmed: bool = False


def _source_files(spec: ProjectSpecification) -> tuple[str, str, str, str]:
    if len(spec.udts) != 1 or len(spec.dbs) != 1:
        raise HTTPException(
            422, "Pilot import requires exactly one UDT and one DB."
        )
    udt, db = spec.udts[0], spec.dbs[0]
    if any(not _VALID_NAME.fullmatch(value) for value in (udt.name, db.name)):
        raise HTTPException(
            422, "UDT and DB names must use ASCII letters, digits and underscores."
        )
    if udt.name.casefold() == db.name.casefold():
        raise HTTPException(422, "UDT and DB names must be different.")
    # The source generator interpolates member identifiers into SCL. Validate
    # all nested names and type declarations before the text reaches Openness.
    def validate_members(members):
        for member in members:
            if not _VALID_NAME.fullmatch(member.name):
                raise HTTPException(422, "Invalid SCL member name: " + member.name)
            kind = member.data_type.casefold()
            if kind == "struct":
                validate_members(member.struct_members or [])
            else:
                element = (member.array_element_type if kind == "array"
                           else member.data_type)
                if not element or not _VALID_TYPE.fullmatch(element):
                    raise HTTPException(422, "Invalid SCL member data type: "
                                        + str(element))

    validate_members(udt.fields)
    validate_members(db.members)
    # The pilot does not resolve dependencies between multiple newly generated
    # UDTs; reject self references before attempting to modify a live project.
    def uses_type(members, sought):
        for field in members:
            if field.data_type.casefold() == "struct":
                if uses_type(field.struct_members or [], sought):
                    return True
            elif (field.array_element_type if field.data_type.casefold()
                  == "array" else field.data_type).casefold() == sought:
                return True
        return False

    if uses_type(udt.fields, udt.name.casefold()):
        raise HTTPException(422, "Recursive UDT definitions are not supported.")
    types = {udt.name.casefold(): udt.name}
    udt_text = generate_udt_source(udt.name, udt.fields, types)
    db_text = generate_db_source(db.name, db.members, types)
    for label, value in (("UDT", udt_text), ("DB", db_text)):
        try:
            value.encode("ascii")
        except UnicodeEncodeError as exc:
            raise HTTPException(
                422, f"{label} source contains non-ASCII characters. "
                     "TIA external source import pilot requires ASCII; "
                     "use ASCII comments for this first test."
            ) from exc
    return udt.name, db.name, udt_text, db_text


def _make_plan(request: PlcStructureImportRequest) -> dict:
    udt_name, db_name, udt_text, db_text = _source_files(request.project)
    context = get_project_context(request.process_id)
    targets = [
        plc for plc in context.plcs
        if plc.device_name.casefold() == request.device_name.casefold()
        and plc.plc_name.casefold() == request.plc_name.casefold()
    ]
    if len(targets) != 1:
        raise HTTPException(404, "The selected PLC is not in the open TIA project.")
    structures = get_plc_structures(
        request.process_id, request.device_name, request.plc_name
    )
    existing = sorted(
        [("udt", item.name.casefold()) for item in structures.udts]
        + [("db", item.name.casefold()) for item in structures.data_blocks]
    )
    collisions = [
        name for name in (udt_name, db_name)
        if any(existing_name == name.casefold() for _, existing_name in existing)
    ]
    if collisions:
        raise HTTPException(
            409, "Existing PLC objects will not be overwritten: "
            + ", ".join(collisions)
        )
    fingerprint = {
        "process_id": request.process_id,
        "device_name": request.device_name,
        "plc_name": request.plc_name,
        "project_name": context.project_name,
        "existing": existing,
        "udt_name": udt_name,
        "db_name": db_name,
        "udt_source": udt_text,
        "db_source": db_text,
    }
    token = hashlib.sha256(
        json.dumps(fingerprint, sort_keys=True, ensure_ascii=True).encode()
    ).hexdigest()
    return {
        "token": token,
        "project_name": context.project_name,
        "device_name": request.device_name,
        "plc_name": request.plc_name,
        "udt_name": udt_name,
        "db_name": db_name,
        "udt_source": udt_text,
        "db_source": db_text,
    }


@router.post("/plc-structure-import/plan")
def plan_plc_structure_import(request: PlcStructureImportRequest) -> dict:
    return _make_plan(request)


@router.post("/plc-structure-import/apply")
def apply_plc_structure_import(request: PlcStructureApplyRequest) -> dict:
    if not request.backup_confirmed:
        raise HTTPException(
            422, "Confirm that the TIA project is a backup/test copy."
        )
    current = _make_plan(request)
    if current["token"] != request.expected_token:
        raise HTTPException(
            409, "The TIA project or generated source changed since preview. "
                 "Re-run the import plan before confirming."
        )

    with tempfile.TemporaryDirectory(prefix="tia_structures_") as folder:
        udt_path = Path(folder) / "generated.udt"
        db_path = Path(folder) / "generated.db"
        udt_path.write_text(current["udt_source"] + "\n", encoding="ascii")
        db_path.write_text(current["db_source"] + "\n", encoding="ascii")
        try:
            lines = run_adapter(
                "import-plc-structures",
                str(request.process_id),
                request.device_name,
                request.plc_name,
                current["project_name"],
                current["udt_name"],
                current["db_name"],
                str(udt_path),
                str(db_path),
            )
        except HTTPException as exc:
            # A failed second source may leave an unsaved UDT in the open
            # TIA project. Never misreport the operation as atomic.
            raise HTTPException(
                exc.status_code,
                "Import failed. Inspect the OPEN TIA project for partial "
                "changes before retrying. " + str(exc.detail),
            ) from exc

    confirmed = {line for line in lines if line.startswith("STRUCTURE_IMPORTED|")}
    for kind, name in (("UDT", current["udt_name"]), ("DB", current["db_name"])):
        if f"STRUCTURE_IMPORTED|{kind}|{name}" not in confirmed:
            raise HTTPException(
                502, f"Adapter did not confirm {kind} {name}. Inspect TIA project."
            )
    saved = next(
        (line.split("|", 1)[1] for line in lines
         if line.startswith("PROJECT_SAVED|")), None
    )
    if saved != current["project_name"]:
        raise HTTPException(
            502, "Objects were reported as generated but TIA project SAVE was "
                 "not confirmed. Inspect the open project before retrying."
        )
    return {
        "status": "imported",
        "project_name": current["project_name"],
        "device_name": request.device_name,
        "plc_name": request.plc_name,
        "udt_name": current["udt_name"],
        "db_name": current["db_name"],
        "project_saved": saved,
    }
