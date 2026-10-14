"""Read-only multi-UDT/DB preflight and guarded create-only TIA import.

All selected objects and their required types are compared with the live PLC.
Compatible existing UDTs are reused; unknown or incompatible types block only
their dependents. Existing objects are never overwritten.
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


def _declared_members(detail):
    """UDT/array XML may expand referenced types or include element start values.

    Compare declarations, not TIA's informative expansion of another UDT.
    Inline Struct children remain part of the declared structure.
    """
    result, opaque = [], []
    for member in detail.members:
        key = member.path.casefold()
        if any(key.startswith(parent + ".") for parent in opaque):
            continue
        result.append(member)
        if _canonical_type(member.data_type) != "struct":
            opaque.append(key)
    return result


def _structure_mismatch(actual, expected):
    actual_by_path = dict(actual)
    expected_by_path = dict(expected)
    for path, expected_type in expected:
        if path not in actual_by_path:
            return f"Member {path}: required declaration missing in TIA."
        if actual_by_path[path] != expected_type:
            return (f"Member {path}: required type {expected_type}; "
                    f"TIA type {actual_by_path[path]}.")
    for path, actual_type in actual:
        if path not in expected_by_path:
            return f"Member {path}: unexpected TIA declaration ({actual_type})."
    if actual != expected:
        return "Member declaration order differs from the required structure."
    return None


def _udt_metadata_notes(spec, members):
    actual = {m.path.casefold(): m for m in members}
    notes = []

    def inspect(fields, parent=""):
        for field in fields:
            path = parent + "." + field.name if parent else field.name
            member = actual.get(path.casefold())
            if member is None:
                continue
            if field.comment != member.comment:
                notes.append(path + ": comments differ; existing comment retained.")
            for key in ("start_value", "hmi_visible", "hmi_accessible", "hmi_writable"):
                required = getattr(field, key)
                observed = member.metadata.get(key)
                if required is not None:
                    if observed is None:
                        notes.append(path + ": " + key + " not available/explicit "
                                     "in export; existing metadata retained.")
                    elif str(required).casefold() != observed.casefold():
                        notes.append(path + ": " + key + " differs; existing value "
                                     + observed + " retained.")
                elif key == "start_value" and observed is not None:
                    notes.append(path + ": existing start value " + observed + " retained.")
            if member.metadata.get("remanence"):
                notes.append(path + ": existing remanence "
                             + member.metadata["remanence"] + " retained.")
            inspect(field.struct_members or [], path)

    if spec is not None:
        inspect(spec.fields)
    return notes


def _compare_existing(request, definition: dict, existing) -> dict:
    kind = definition["kind"]
    if kind == "db" and (
        getattr(existing, "block_kind", "").casefold() not in
        {"globaldb", "global data block", "global"}
    ):
        return {"status": "conflict", "reason":
                "Existing DB is not confirmed as a global data block. "
                "Never overwrite an instance DB."}
    try:
        detail = get_plc_structure(
            request.process_id, request.device_name, request.plc_name,
            kind, existing.group_path, existing.name
        )
        members = _declared_members(detail)
        snapshot = [m.model_dump(exclude={"offset"}) for m in members]
        observed = hashlib.sha256(json.dumps(
            snapshot, sort_keys=True, ensure_ascii=True).encode()).hexdigest()
        result = {"structure_fingerprint": observed, "metadata_warnings": [],
                  "required_types": [m.data_type for m in members
                                     if _canonical_type(m.data_type) != "struct"]}
        unknown = []
        if not members:
            unknown.append("No member declarations were exported")
        if not existing.is_consistent:
            unknown.append("TIA reports this existing type/block as inconsistent")
        for member in members:
            if not member.data_type:
                unknown.append(member.path + ": data type unavailable")
            if member.metadata.get("at"):
                unknown.append(member.path + ": overlaid AT declaration cannot be compared")
        if unknown:
            return {**result, "status": "unknown", "reason":
                    "; ".join(unknown) + ". Manual TIA structure review required; "
                    "dependent imports remain blocked. Export/repair the type "
                    "in TIA and run preflight again."}
        actual = [(m.path.casefold(), _canonical_type(m.data_type)) for m in members]
        spec = definition.get("spec")
        if spec is not None:
            expected = _expected_members(spec.fields if kind == "udt" else spec.members)
            mismatch = _structure_mismatch(actual, expected)
            if mismatch:
                return {**result, "status": "conflict", "reason":
                        mismatch + " No existing object will be overwritten."}
        if kind == "udt":
            result["metadata_warnings"] = _udt_metadata_notes(spec, members)
            return {**result, "status": "compatible", "reason":
                    "Existing compatible UDT — reuse, no import required. "
                    + ("Ordered member paths, types, array bounds and nested type "
                       "references match. " if spec is not None else
                       "No local member definition requested; DB uses the verified "
                       "live type by name. ")
                    + "Existing defaults, comments and HMI/retain settings are retained."}
        if _has_unverifiable_attributes(definition):
            return {**result, "status": "unknown", "reason":
                    "DB structure matches, but requested RETAIN/start values/HMI "
                    "metadata are not fully compared. Review the existing DB in "
                    "TIA; no import or overwrite."}
        if any(m.comment or m.metadata.get("start_value") for m in members):
            return {**result, "status": "unknown", "reason":
                    "DB structure matches; existing comments/start values require "
                    "manual review. No import or overwrite."}
        return {**result, "status": "identical", "reason":
                "Declared DB structure matches. No import or overwrite. "
                "Review DB retention/optimization in TIA if relevant."}
    except Exception as exc:
        return {"status": "unknown", "metadata_warnings": [], "reason":
                "Existing structure export unavailable: " + str(exc)
                + ". Manual TIA review required; dependent imports remain blocked. "
                "Export/repair the type in TIA and run preflight again."}


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


def _reference_type(value: str) -> str:
    # Live types can contain multidimensional arrays and bounded String/WString
    # elements even though the local editor only declares one array dimension.
    # Bounds remain part of structural comparison; only the element is a type
    # dependency, never the complete Array[...] declaration.
    array = re.fullmatch(
        r"array\s*\[\s*-?\d+\s*\.\.\s*-?\d+"
        r"(?:\s*,\s*-?\d+\s*\.\.\s*-?\d+)*\s*\]\s*of\s*(.+)",
        (value or "").strip(), re.I,
    )
    if array:
        value = array.group(1)
    name = (value or "").strip().strip('"').casefold()
    if re.fullmatch(r"(w?string)\[\d+\]", name):
        return name.split("[", 1)[0]
    return name


def _include_required_udts(
    configured: ProjectSpecification,
    selected: ProjectSpecification,
    existing_udts: set[str],
    existing_db_names: set[str] | None = None,
) -> tuple[ProjectSpecification, set[str]]:
    """Include required configured UDTs for creation or live compatibility checks.

    Transitive dependencies are resolved before generating sources. Objects not
    present in local definitions are left to the preflight blocker logic.
    """
    configured_udts = {u.name.casefold(): u for u in configured.udts}
    included = {u.name.casefold(): u for u in selected.udts}
    explicit = set(included)
    visiting: set[str] = set()
    visited: set[str] = set()

    def inspect(members):
        for reference in _references(members):
            key = _reference_type(reference)
            if key in _BUILTIN_TYPES:
                continue
            udt = configured_udts.get(key)
            if udt is None:
                continue  # preflight will block dependent on unavailable type
            visit(udt)

    def visit(udt):
        key = udt.name.casefold()
        if key in visiting:
            raise HTTPException(422, "Circular UDT dependency: " + udt.name)
        if key in visited:
            return
        visiting.add(key)
        inspect(udt.fields)
        visiting.remove(key)
        visited.add(key)
        included[key] = udt

    for udt in selected.udts:
        visit(udt)
    for db in selected.dbs:
        # A name collision means this DB cannot be created. Do not pull in
        # otherwise-unselected UDTs solely for a blocked/identical DB.
        # Explicitly selected UDTs remain eligible independently.
        if db.name.casefold() not in (existing_db_names or set()):
            inspect(db.members)
    resolved = ProjectSpecification(
        plc_family=selected.plc_family,
        udts=list(included.values()),
        dbs=list(selected.dbs),
    )
    return resolved, set(included) - explicit


def _make_plan(request: PlcStructureImportRequest) -> dict:
    selected = _selected_project(request)
    # Reject invalid explicitly selected definitions before any Openness call.
    _definitions(selected)
    context = get_project_context(request.process_id)
    targets = [plc for plc in context.plcs
               if plc.device_name.casefold() == request.device_name.casefold()
               and plc.plc_name.casefold() == request.plc_name.casefold()]
    if len(targets) != 1:
        raise HTTPException(404, "Selected PLC is not in the open TIA project.")
    structures = get_plc_structures(
        request.process_id, request.device_name, request.plc_name)
    selected, auto_udts = _include_required_udts(
        request.project, selected,
        {u.name.casefold() for u in structures.udts},
        {db.name.casefold() for db in structures.data_blocks},
    )
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
            comparison = {"status": "create", "reason":
                          "Not present in TIA; can create after approval."}
        elif len(collisions) != 1 or collisions[0][0] != definition["kind"]:
            comparison = {"status": "conflict", "reason":
                          "Name collision with another PLC object/type."}
        else:
            comparison = _compare_existing(request, definition, collisions[0][1])
        report.append({
            "kind": definition["kind"], "name": definition["name"],
            **comparison, "source": definition["source"],
            "auto_dependency": definition["kind"] == "udt"
                and definition["name"].casefold() in auto_udts,
        })

    # Resolve transitively, including already-existing nested UDTs. A compatible
    # parent cannot hide an incompatible configured child or an unavailable type.
    selected_state = {item["name"].casefold(): item for item in report
                      if item["kind"] == "udt"}
    definitions_by_name = {d["name"].casefold(): d for d in definitions}
    live_types = {u.name.casefold(): u for u in structures.udts}
    verified_external = {}
    resolving, resolved = set(), set()

    def resolve(row, references):
        key = row["name"].casefold()
        if key in resolved or row["status"] not in {"create", "compatible"}:
            return
        if key in resolving:
            row.update(status="unknown", reason="Circular live UDT dependency. "
                       "Manual TIA review required; no dependent import.")
            return
        resolving.add(key)
        blockers = []
        for reference in references:
            ref_key = _reference_type(reference)
            if ref_key in _BUILTIN_TYPES:
                continue
            dependency = selected_state.get(ref_key)
            if dependency is not None:
                definition = definitions_by_name[ref_key]
                resolve(dependency, _references(definition["spec"].fields))
            else:
                live_ref = live_types.get(ref_key)
                if live_ref is None:
                    blockers.append(reference + " (UDT missing in TIA and selection)")
                    continue
                if ref_key not in verified_external:
                    verified_external[ref_key] = {
                        "kind": "udt", "name": live_ref.name, "source": "",
                        "auto_dependency": True,
                        **_compare_existing(request, {"kind": "udt"}, live_ref),
                    }
                dependency = verified_external[ref_key]
                resolve(dependency, dependency.get("required_types", []))
            if dependency["status"] not in {"create", "compatible", "identical"}:
                blockers.append(reference + " (" + dependency["status"] + "): "
                                + dependency["reason"])
        resolving.remove(key)
        resolved.add(key)
        if blockers:
            row["status"] = "blocked"
            row["reason"] = ("Dependency unavailable or mismatched: "
                             + "; ".join(sorted(set(blockers)))
                             + ". No import for this object.")

    for definition, row in zip(definitions, report):
        members = (definition["spec"].fields if definition["kind"] == "udt"
                   else definition["spec"].members)
        resolve(row, _references(members))
    report.extend(verified_external.values())

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
                   for status in ("create", "identical", "compatible", "unknown", "conflict", "blocked")},
        "can_apply": bool(create),
        "will_create": create,
        "auto_dependencies": [
            row["name"] for row in report
            if row["auto_dependency"] and row["status"] == "create"
        ],
    }


@router.post("/plc-structure-import/preview")
def preview_selected_plc_sources(request: SelectedProjectPreviewRequest) -> dict:
    # No process/TIA connection is required to generate the selected SCL.
    selected = _selected_project(request)
    all_known = [u.name for u in request.project.udts]
    # Offline preview includes dependent UDTs from the configuration. At
    # preflight, UDTs already installed in TIA are excluded from creation.
    selected, auto_udts = _include_required_udts(request.project, selected, set())
    definitions = _definitions(selected, known_udts=all_known)
    return {
        "source": "\n\n".join(item["source"] for item in definitions),
        "items": [{"kind": item["kind"], "name": item["name"],
                   "auto_dependency": item["kind"] == "udt"
                       and item["name"].casefold() in auto_udts}
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
    confirmed_compiles = set(line for line in result if line.startswith("STRUCTURE_COMPILED|"))
    for row in current["items"]:
        if row["status"] == "create":
            entry = f"STRUCTURE_IMPORTED|{row['kind'].upper()}|{row['name']}"
            if entry not in confirmed:
                raise HTTPException(
                    502, "Missing TIA creation confirmation: " + entry
                    + ". Inspect the open project before retrying.")
    for row in current["items"]:
        if row["status"] == "create" and row["kind"] == "db":
            entry = f"STRUCTURE_COMPILED|DB|{row['name']}"
            if entry not in confirmed_compiles:
                raise HTTPException(502, "Missing TIA DB compilation confirmation: "
                                    + entry + ". Inspect the open project before retrying.")
    saved = next((line.split("|", 1)[1] for line in result
                  if line.startswith("PROJECT_SAVED|")), None)
    if saved != current["project_name"]:
        raise HTTPException(502, "TIA project SAVE was not confirmed. "
                            "Inspect the open project before retrying.")
    return {
        "status": "imported", "project_name": current["project_name"],
        "created": current["will_create"],
        "compiled_dbs": [x["name"] for x in current["items"]
                         if x["status"] == "create" and x["kind"] == "db"],
        "skipped_identical": [x["name"] for x in current["items"]
                              if x["status"] == "identical"],
        "reused_udts": [x["name"] for x in current["items"]
                        if x["status"] == "compatible"],
        "skipped_conflicts": [x["name"] for x in current["items"]
                              if x["status"] in {"conflict", "unknown", "blocked"}],
        "project_saved": saved,
    }
