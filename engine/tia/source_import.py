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
    # None maintains the legacy API behavior: all configured items.
    # Explicit [] selects no objects of that kind.
    selected_udts: list[str] | None = None
    selected_dbs: list[str] | None = None


class SelectedProjectPreviewRequest(BaseModel):
    project: ProjectSpecification
    selected_udts: list[str] | None = None
    selected_dbs: list[str] | None = None


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


_BUILTIN_TYPES = {
    "bool", "byte", "word", "dword", "lword", "sint", "usint", "int",
    "uint", "dint", "udint", "lint", "ulint", "real", "lreal",
    "char", "wchar", "string", "wstring", "date", "time", "ltime",
    "tod", "time_of_day", "ltod", "date_and_time", "dt", "dtl",
    "s5time", "s5_time", "timer", "counter",
}


def _selected_project(request: PlcStructureImportRequest) -> ProjectSpecification:
    def pick(items, selected, label):
        if selected is None:
            return list(items)
        available = {x.name.casefold(): x for x in items}
        keys = [name.casefold() for name in selected]
        if len(keys) != len(set(keys)):
            raise HTTPException(422, "Duplicate selected " + label + " name.")
        unknown = [name for name in selected if name.casefold() not in available]
        if unknown:
            raise HTTPException(422, "Unknown selected " + label + ": "
                                + ", ".join(unknown))
        return [x for x in items if x.name.casefold() in set(keys)]

    udts = pick(request.project.udts, request.selected_udts, "UDT")
    dbs = pick(request.project.dbs, request.selected_dbs, "DB")
    if not udts and not dbs:
        raise HTTPException(422, "Select at least one UDT or DB.")
    return ProjectSpecification(
        plc_family=request.project.plc_family, udts=udts, dbs=dbs,
    )


def _make_plan(request: PlcStructureImportRequest) -> dict:
    selected = _selected_project(request)
    # Validate *all* selected definitions before any Openness call. Invalid
    # identifiers, source encoding, duplicate names or dependency cycles
    # must fail as HTTP 422 without even reading a live TIA project.
    # Re-generate below with the names of live UDTs for correct SCL quoting.
    _definitions(selected)
    context = get_project_context(request.process_id)
    targets = [plc for plc in context.plcs
               if plc.device_name.casefold() == request.device_name.casefold()
               and plc.plc_name.casefold() == request.plc_name.casefold()]
    if len(targets) != 1:
        raise HTTPException(404, "Selected PLC is not in the open TIA project.")
    structures = get_plc_structures(
        request.process_id, request.device_name, request.plc_name)
    definitions = _definitions(
        selected, known_udts=[u.name for u in structures.udts])
    existing = {}
    for item in structures.udts:
        existing.setdefault(item.name.casefold(), []).append(("udt", item))
    for item in structures.data_blocks:
        existing.setdefault(item.name.casefold(), []).append(("db", item))

    report = []
    for definition in definitions:
        collisions = existing.get(definition["name"].casefold(), [])
        if not collisions:
            state, reason = "create", "Not present in TIA; can create after approval."
        elif len(collisions) != 1 or collisions[0][0] != definition["kind"]:
            state, reason = "conflict", "Name collision with another PLC object/type."
        else:
            state, reason = _compare_existing(request, definition, collisions[0][1])
        report.append({
            "kind": definition["kind"], "name": definition["name"],
            "status": state, "reason": reason, "source": definition["source"],
        })

    # Independent objects may be imported even when other selected objects
    # conflict. Dependents of a blocked/conflicting UDT cannot be imported.
    selected_state = {item["name"].casefold(): item for item in report
                      if item["kind"] == "udt"}
    all_configured = {u.name.casefold(): u for u in request.project.udts}
    live_types = {u.name.casefold(): u for u in structures.udts}
    verified_external = {}

    for definition, row in zip(definitions, report):
        if row["status"] != "create":
            continue
        members = (definition["spec"].fields if definition["kind"] == "udt"
                   else definition["spec"].members)
        blockers = []
        for reference in _references(members):
            key = reference.casefold().strip().strip('"')
            if key in _BUILTIN_TYPES:
                continue
            selected_ref = selected_state.get(key)
            if selected_ref is not None:
                if selected_ref["status"] in {"conflict", "blocked"}:
                    blockers.append(reference + " (conflict/blocked)")
                continue
            live_ref = live_types.get(key)
            if live_ref is None:
                blockers.append(reference + " (UDT missing in TIA and selection)")
                continue
            # Configured, but unchecked UDT: verify its live definition before
            # allowing a dependent DB to use it. No automatic dependency import.
            configured = all_configured.get(key)
            if configured is not None:
                if key not in verified_external:
                    state, detail = _compare_existing(
                        request, {"kind": "udt", "spec": configured}, live_ref
                    )
                    verified_external[key] = (state, detail)
                if verified_external[key][0] != "identical":
                    blockers.append(reference + " (unchecked UDT not verified)")
        if blockers:
            row["status"] = "blocked"
            row["reason"] = ("Dependency unavailable or mismatched: "
                             + ", ".join(sorted(set(blockers)))
                             + ". No import for this object.")

    snapshot = {
        "process_id": request.process_id, "device": request.device_name,
        "plc": request.plc_name, "project": context.project_name,
        "selection": {
            "udts": request.selected_udts, "dbs": request.selected_dbs,
        },
        "existing": sorted((k, kind, getattr(item, "group_path", ""))
                           for k, values in existing.items()
                           for kind, item in values),
        "rows": report,
    }
    token = hashlib.sha256(json.dumps(
        snapshot, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
    create = [row["name"] for row in report if row["status"] == "create"]
    return {
        "token": token, "project_name": context.project_name,
        "device_name": request.device_name, "plc_name": request.plc_name,
        "items": report,
        "counts": {status: sum(x["status"] == status for x in report)
                   for status in ("create", "identical", "conflict", "blocked")},
        "can_apply": bool(create),
        "will_create": create,
    }


@router.post("/plc-structure-import/preview")
def preview_selected_plc_sources(request: SelectedProjectPreviewRequest) -> dict:
    # No process/TIA connection is required to generate the selected SCL.
    selected = _selected_project(request)
    all_known = [u.name for u in request.project.udts]
    definitions = _definitions(selected, known_udts=all_known)
    return {
        "source": "\n\n".join(item["source"] for item in definitions),
        "items": [{"kind": item["kind"], "name": item["name"]}
                  for item in definitions],
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
        raise HTTPException(409, "No eligible objects to create. See preflight report.")
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
        "skipped_conflicts": [x["name"] for x in current["items"]
                              if x["status"] in {"conflict", "blocked"}],
        "project_saved": saved,
    }
