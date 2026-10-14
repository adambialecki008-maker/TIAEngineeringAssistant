"""Read-only multi-UDT/DB preflight and guarded create-only TIA import.

All generated objects are compared with the live PLC. Different/uncertain
existing objects block the entire operation; identical definitions are skipped.
Import only missing objects after user confirmation and a fresh token recheck.
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
from engine.tia.structures import get_plc_structure, get_plc_structures
from functions.tia_source_generator import generate_db_source, generate_udt_source


router = APIRouter()
_VALID_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_VALID_TYPE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\[[0-9]+\])?$")
_ARRAY = re.compile(r"array\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*of\s*[\"']?([\w]+)[\"']?", re.I)


class PlcStructureImportRequest(BaseModel):
    process_id: int = Field(ge=1)
    device_name: str = Field(min_length=1, max_length=128)
    plc_name: str = Field(min_length=1, max_length=128)
    project: ProjectSpecification


class PlcStructureApplyRequest(PlcStructureImportRequest):
    expected_token: str = Field(pattern=r"^[a-f0-9]{64}$")
    backup_confirmed: bool = False
    # Explicit acknowledgement of the exact list found during preflight.
    approved_create: list[str] = Field(default_factory=list)


def _members_valid(members):
    for member in members:
        if not _VALID_NAME.fullmatch(member.name):
            raise HTTPException(422, "Invalid SCL member name: " + member.name)
        kind = member.data_type.casefold()
        if kind == "struct":
            _members_valid(member.struct_members or [])
        else:
            element = member.array_element_type if kind == "array" else member.data_type
            if not element or not _VALID_TYPE.fullmatch(element):
                raise HTTPException(422, "Invalid SCL member data type: " + str(element))


def _references(members):
    for m in members:
        if m.data_type.casefold() == "struct":
            yield from _references(m.struct_members or [])
        else:
            yield (m.array_element_type if m.data_type.casefold() == "array"
                   else m.data_type)


def _definitions(
    spec: ProjectSpecification, known_udts: list[str] | None = None
) -> list[dict]:
    if not spec.udts and not spec.dbs:
        raise HTTPException(422, "Select at least one UDT or DB.")
    names: set[str] = set()
    for item in [*spec.udts, *spec.dbs]:
        if not _VALID_NAME.fullmatch(item.name):
            raise HTTPException(422, "Invalid PLC object name: " + item.name)
        if item.name.casefold() in names:
            raise HTTPException(422, "Duplicate UDT/DB name: " + item.name)
        names.add(item.name.casefold())
        _members_valid(item.fields if hasattr(item, "fields") else item.members)

    # Topological order: a new UDT can depend on any other newly defined UDT,
    # but recursive/circular references cannot be generated safely.
    by_name = {u.name.casefold(): u for u in spec.udts}
    ordered, visiting, visited = [], set(), set()

    def visit(udt):
        key = udt.name.casefold()
        if key in visiting:
            raise HTTPException(422, "Circular UDT dependency: " + udt.name)
        if key in visited:
            return
        visiting.add(key)
        for ref in _references(udt.fields):
            child = by_name.get(ref.casefold())
            if child is not None:
                visit(child)
        visiting.remove(key)
        visited.add(key)
        ordered.append(udt)

    for udt in spec.udts:
        visit(udt)
    mapping = {name.casefold(): name for name in (known_udts or [])}
    mapping.update({udt.name.casefold(): udt.name for udt in spec.udts})
    definitions = []
    for kind, items in (("udt", ordered), ("db", spec.dbs)):
        for item in items:
            source = (generate_udt_source(item.name, item.fields, mapping)
                      if kind == "udt"
                      else generate_db_source(
                          item.name, item.members, mapping, retain=item.retain))
            try:
                source.encode("ascii")
            except UnicodeEncodeError as exc:
                raise HTTPException(
                    422, f"{kind.upper()} {item.name} contains non-ASCII source text."
                ) from exc
            definitions.append({"kind": kind, "name": item.name,
                                "source": source, "spec": item})
    return definitions


def _source_files(spec: ProjectSpecification) -> tuple[str, str, str, str]:
    """Compatibility helper for the original 1 UDT + 1 DB pilot tests."""
    definitions = _definitions(spec)
    if len(definitions) != 2 or [d["kind"] for d in definitions] != ["udt", "db"]:
        raise HTTPException(422, "This legacy helper requires one UDT and one DB.")
    return (definitions[0]["name"], definitions[1]["name"],
            definitions[0]["source"], definitions[1]["source"])


def _canonical_type(value: str) -> str:
    text = re.sub(r'["\s]', "", value or "").casefold()
    m = _ARRAY.fullmatch((value or "").strip())
    if m:
        return f"array[{int(m.group(1))}..{int(m.group(2))}]of{m.group(3).casefold()}"
    return text


def _expected_members(members, parent=""):
    result = []
    for member in members:
        path = parent + "." + member.name if parent else member.name
        if member.data_type.casefold() == "array":
            type_name = (f"Array[{member.array_lower_bound}..{member.array_upper_bound}]"
                         f" of {member.array_element_type}")
        else:
            type_name = member.data_type
        result.append((path.casefold(), _canonical_type(type_name)))
        if member.data_type.casefold() == "struct":
            result.extend(_expected_members(member.struct_members or [], path))
    return result


def _has_unverifiable_attributes(definition: dict) -> bool:
    """Existing XML detail parser does not expose all initial/HMI/RETAIN values.

    Never falsely label complex objects identical based on names/fields alone.
    """
    spec = definition["spec"]
    if definition["kind"] == "db" and spec.retain:
        return True

    def special(members):
        for m in members:
            if (m.comment or m.start_value is not None
                or m.hmi_visible is not None or m.hmi_accessible is not None
                or m.hmi_writable is not None):
                return True
            if special(m.struct_members or []):
                return True
        return False

    return special(spec.fields if definition["kind"] == "udt" else spec.members)


def _compare_existing(request, definition: dict, existing) -> tuple[str, str]:
    if definition["kind"] == "db" and (
        getattr(existing, "block_kind", "").casefold() not in
        {"globaldb", "global data block", "global"}
    ):
        return "conflict", ("Existing DB is not confirmed as a global data "
                            "block. Never overwrite an instance DB.")
    if _has_unverifiable_attributes(definition):
        return "conflict", ("Existing source has attributes/RETAIN/start values "
                            "that this read-only comparison cannot fully verify; "
                            "manual TIA review required. No overwrite.")
    try:
        detail = get_plc_structure(
            request.process_id, request.device_name, request.plc_name,
            definition["kind"], existing.group_path, existing.name
        )
        actual = [(m.path.casefold(), _canonical_type(m.data_type))
                  for m in detail.members]
        expected = _expected_members(
            definition["spec"].fields if definition["kind"] == "udt"
            else definition["spec"].members)
        if actual == expected and all(not m.comment for m in detail.members):
            return "identical", (
                "Declared field paths/types and comments match. No import. "
                "TIA metadata beyond these declarations is not independently "
                "verified; inspect retain/HMI/optimization settings if relevant."
            )
        return "conflict", ("Existing member paths, types or comments differ. "
                            "No existing object will be overwritten.")
    except Exception as exc:
        # No silent acceptance of a failed read-only export.
        return "conflict", "Existing structure could not be verified: " + str(exc)


def _make_plan(request: PlcStructureImportRequest) -> dict:
    definitions = _definitions(request.project)
    context = get_project_context(request.process_id)
    targets = [plc for plc in context.plcs
               if plc.device_name.casefold() == request.device_name.casefold()
               and plc.plc_name.casefold() == request.plc_name.casefold()]
    if len(targets) != 1:
        raise HTTPException(404, "Selected PLC is not in the open TIA project.")
    structures = get_plc_structures(
        request.process_id, request.device_name, request.plc_name)
    # A DB may refer to a type already present in TIA but not recreated here.
    # Source declarations must quote those UDT names exactly like newly
    # generated UDT references.
    definitions = _definitions(
        request.project, known_udts=[u.name for u in structures.udts])
    existing = {}
    for item in structures.udts:
        existing.setdefault(item.name.casefold(), []).append(("udt", item))
    for item in structures.data_blocks:
        existing.setdefault(item.name.casefold(), []).append(("db", item))
    report = []
    for definition in definitions:
        collisions = existing.get(definition["name"].casefold(), [])
        if not collisions:
            state, reason = "create", "Not present in TIA; safe to create after confirmation."
        elif len(collisions) != 1 or collisions[0][0] != definition["kind"]:
            state, reason = "conflict", "Name collision with another PLC object/type."
        else:
            state, reason = _compare_existing(request, definition, collisions[0][1])
        report.append({
            "kind": definition["kind"], "name": definition["name"],
            "status": state, "reason": reason,
            "source": definition["source"],
        })
    snapshot = {
        "process_id": request.process_id, "device": request.device_name,
        "plc": request.plc_name, "project": context.project_name,
        "existing": sorted((k, kind, getattr(item, "group_path", ""))
                           for k, values in existing.items()
                           for kind, item in values),
        "rows": report,
    }
    token = hashlib.sha256(json.dumps(
        snapshot, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
    create = [row["name"] for row in report if row["status"] == "create"]
    conflicts = [row["name"] for row in report if row["status"] == "conflict"]
    return {
        "token": token, "project_name": context.project_name,
        "device_name": request.device_name, "plc_name": request.plc_name,
        "items": report,
        "counts": {status: sum(x["status"] == status for x in report)
                   for status in ("create", "identical", "conflict")},
        "can_apply": bool(create) and not conflicts,
        "will_create": create,
    }


@router.post("/plc-structure-import/plan")
def plan_plc_structure_import(request: PlcStructureImportRequest) -> dict:
    return _make_plan(request)


@router.post("/plc-structure-import/apply")
def apply_plc_structure_import(request: PlcStructureApplyRequest) -> dict:
    if not request.backup_confirmed:
        raise HTTPException(422, "Confirm that the TIA project is a test/backup copy.")
    current = _make_plan(request)
    if current["token"] != request.expected_token:
        raise HTTPException(
            409, "TIA project or generated data changed since preflight. "
                 "Re-run the report before importing.")
    if not current["can_apply"]:
        raise HTTPException(409, "No safe import: existing differences or nothing to create.")
    if request.approved_create != current["will_create"]:
        raise HTTPException(
            422, "The explicitly approved list differs from the current preflight. "
                 "Review and confirm the exact missing objects.")
    with tempfile.TemporaryDirectory(prefix="tia_structures_") as folder:
        manifest = Path(folder) / "manifest.txt"
        lines = []
        for n, row in enumerate(current["items"]):
            if row["status"] != "create":
                continue
            extension = ".udt" if row["kind"] == "udt" else ".db"
            output = Path(folder) / f"structure_{n}{extension}"
            output.write_text(row["source"] + "\n", encoding="ascii")
            lines.append("|".join((row["kind"].upper(), row["name"], str(output))))
        manifest.write_text("\n".join(lines), encoding="utf-8")
        try:
            result = run_adapter(
                "import-plc-structure-batch", str(request.process_id),
                request.device_name, request.plc_name,
                current["project_name"], str(manifest))
        except HTTPException as exc:
            raise HTTPException(
                exc.status_code, "TIA import failed. Open project may contain "
                "partial UNSAVED changes. Inspect it before retrying. "
                + str(exc.detail)) from exc

    confirmed = set(line for line in result if line.startswith("STRUCTURE_IMPORTED|"))
    for row in current["items"]:
        if row["status"] == "create":
            entry = f"STRUCTURE_IMPORTED|{row['kind'].upper()}|{row['name']}"
            if entry not in confirmed:
                raise HTTPException(
                    502, "Missing TIA creation confirmation: " + entry
                    + ". Inspect the open project before retrying.")
    saved = next((line.split("|", 1)[1] for line in result
                  if line.startswith("PROJECT_SAVED|")), None)
    if saved != current["project_name"]:
        raise HTTPException(502, "TIA project SAVE was not confirmed. "
                            "Inspect the open project before retrying.")
    return {
        "status": "imported", "project_name": current["project_name"],
        "created": current["will_create"],
        "skipped_identical": [x["name"] for x in current["items"]
                              if x["status"] == "identical"],
        "project_saved": saved,
    }
