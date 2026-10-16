"""Read-only, offline ZIP export of loaded PLC profile for external LLM review."""
from __future__ import annotations
import hashlib
import io
import json
import re
import zipfile
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from engine.plc_code_review import ReviewInputFile, analyze_files, MAX_FILE_BYTES
from engine.udt import UdtSpecification
from engine.plc_db import DataBlockSpecification
from functions.tia_source_generator import generate_udt_source, generate_db_source

router = APIRouter(prefix="/api/v1/code-review")
MAX_TOTAL = 24 * 1024 * 1024
MAX_ZIP = 25 * 1024 * 1024


class LlmExportRequest(BaseModel):
    profile_name: str = Field(default="Current profile", max_length=128)
    project: dict[str, Any] = Field(default_factory=dict)
    files: list[ReviewInputFile] = Field(default_factory=list, max_length=400)


def _json(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode("utf-8")


def _label(value):
    return (re.sub(r"[^A-Za-z0-9_.-]", "_", str(value)).strip("._") or "unnamed")[:70]


@router.post("/export-for-llm-review")
def export_for_llm_review(request: LlmExportRequest) -> Response:
    sections = ("udts", "dbs", "fbs", "fcs", "instance_dbs")
    profile = request.project
    blocks = {}
    for key in sections:
        items = profile.get(key, [])
        if not isinstance(items, list) or len(items) > 400 or any(
            not isinstance(x, dict) or not isinstance(x.get("name"), str)
            or not x["name"] for x in items
        ):
            raise HTTPException(422, "Invalid profile section: " + key)
        blocks[key] = items
    if sum(map(len, blocks.values())) > 400:
        raise HTTPException(413, "Too many project objects.")
    if not request.files and not any(blocks.values()):
        raise HTTPException(422, "No loaded project data or selected source files.")
    entries = {}
    manifest_files = []
    size = 0

    def add(path, content, kind, name=""):
        nonlocal size
        if path in entries:
            raise HTTPException(422, "Duplicate output path.")
        size += len(content)
        if size > MAX_TOTAL:
            raise HTTPException(413, "Uncompressed export exceeds 24 MB.")
        entries[path] = content
        manifest_files.append({
            "path": path, "kind": kind, "name": name, "bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
        })

    sources = []
    missing = []
    warnings = []
    # Export only known PLC data, not unrelated local credentials/preferences.
    fields = {
        "name", "category", "language", "number", "source_mode",
        "interface_verified", "group_path", "retain", "fields", "members",
        "input", "output", "inout", "static", "temp", "constant",
        "function_block", "relationship_status", "instance_of_name",
        "instance_of_number", "block_type", "declaration_draft",
    }
    for section, items in blocks.items():
        records = [{k:v for k,v in obj.items() if k in fields} for obj in items]
        add(f"project/{section}.json", _json(records), "declarations")
    for section in ("fbs", "fcs"):
        for index, obj in enumerate(blocks[section], 1):
            text = obj.get("source_xml")
            if not isinstance(text, str) or not text.strip():
                missing.append({"kind": section[:-1].upper(), "name": obj["name"],
                                "reason": "original XML not loaded"})
                continue
            content = text.encode("utf-8")
            if len(content) > MAX_FILE_BYTES:
                missing.append({"kind": section[:-1].upper(), "name": obj["name"],
                                "reason": "XML exceeds single-file size limit"})
                continue
            path = f"tia/{section}/{index:03d}_{_label(obj['name'])}.xml"
            add(path, content, "original_tia_xml", obj["name"])
            sources.append(ReviewInputFile(name=path, content=text))
    types = {obj["name"].casefold():obj["name"] for obj in blocks["udts"]}
    for section in ("udts", "dbs"):
        for index, record in enumerate(blocks[section], 1):
            try:
                if section == "udts":
                    obj = UdtSpecification.model_validate(record)
                    text = generate_udt_source(obj.name, obj.fields, types)
                else:
                    obj = DataBlockSpecification.model_validate(record)
                    text = generate_db_source(obj.name, obj.members, types,
                                              retain=obj.retain)
            except (ValueError, TypeError) as exc:
                warnings.append(f"{section}/{record['name']}: no generated SCL. "
                                f"Definitions remain in project JSON: {str(exc)[:160]}")
                continue
            text = text.rstrip("\n") + "\n"
            path = f"generated/{section}/{index:03d}_{_label(obj.name)}.scl"
            add(path, text.encode("utf-8"), "generated_uncompiled_scl", obj.name)
            sources.append(ReviewInputFile(name=path, content=text))
    for index, file in enumerate(request.files, 1):
        suffix = "." + file.name.rsplit(".", 1)[-1].lower()
        if suffix not in {".scl", ".xml"}:
            raise HTTPException(422, "Only .scl and .xml source files are supported.")
        content = file.content.encode("utf-8")
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(413, "Selected source is too large.")
        # Paths are synthesized; user-provided names cannot create ZIP traversal.
        path = f"selected/{index:03d}_{_label(file.name.replace(chr(92),'/').rsplit('/',1)[-1])}"
        if not path.lower().endswith(suffix):
            path += suffix
        add(path, content, "user_selected_source", file.name)
        sources.append(ReviewInputFile(name=path, content=file.content))
    info = {
        "profile": request.profile_name,
        "plc_family": str(profile.get("plc_family") or "")[:128],
        "active_plc": {
            k: (profile.get("tia_target") or {}).get(k)
            for k in ("device_name", "plc_name", "type_identifier")
        } if isinstance(profile.get("tia_target"), dict) else {},
        "objects": {key:len(value) for key,value in blocks.items()},
        "scope": "loaded_profile_plus_selected_files",
    }
    add("project/PROFILE.json", _json(info), "profile")
    add("MISSING_SOURCES.json", _json(missing), "missing_sources")
    if sources:
        report = analyze_files(sources)
        summary = {
            "summary":report.summary.model_dump(),
            "blocks":[{
                "file":x.source_file, "name":x.name, "type":x.block_type,
                "language":x.language, "dependencies":x.dependencies,
                "declarations":[d.model_dump() for d in x.declarations],
                "calls":[c.model_dump() for c in x.calls],
                "networks":[n.model_dump() for n in x.network_details],
                "verification":x.verification_status,
                "warnings":x.parsing_warnings,
            } for x in report.files],
            "findings":[x.model_dump() for x in report.findings],
            "warnings":report.file_warnings,
        }
        add("review/OFFLINE_ANALYSIS.json", _json(summary), "deterministic_review")
    notice = [
        "# Export for LLM review — TIAEngineeringAssistant", "",
        "This ZIP contains the available *loaded* PLC profile, not a native TIA project.",
        "Upload it to ChatGPT and request analysis of SCL, FB/FC/DB/UDT dependencies,",
        "and LAD/FBD networks from their original Siemens XML.", "",
        "Start with MANIFEST.json, MISSING_SOURCES.json, project/PROFILE.json,",
        "then review/OFFLINE_ANALYSIS.json and the sources in tia/ and selected/.", "",
        "Generated UDT/DB SCL is reconstructed from local definitions and uncompiled.",
        "Do not infer missing behavior: source XML for unloaded FB/FC is unavailable.",
        "HMI views, complete hardware inventory and unseen PLC blocks are not included.",
        "No Ollama, TIA import/save, PLC write or external upload was performed.", "",
        "CONFIDENTIALITY: inspect the archive before sharing machine logic, comments,",
        "plant addresses, project names or intellectual property with an LLM.", "",
        f"Missing original FB/FC sources: {len(missing)}",
        *[f"- {x['kind']} {x['name']}: {x['reason']}" for x in missing],
        *[f"- {item}" for item in warnings],
    ]
    add("README_FOR_CHATGPT.md", ("\n".join(notice)+"\n").encode("utf-8"), "readme")
    manifest = {
        "format":"TIAEngineeringAssistant_LLM_review",
        "schema_version":1,
        "scope":"loaded_profile_only",
        "full_native_tia_project":False,
        "has_unloaded_sources":bool(missing),
        "offline":True,
        "ollama_used":False,
        "profile":info,
        "warnings":warnings,
        "files":manifest_files,
    }
    entries["MANIFEST.json"] = _json(manifest)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(entries):
            archive.writestr(path, entries[path])
    data = buf.getvalue()
    if len(data) > MAX_ZIP:
        raise HTTPException(413, "ZIP exceeds 25 MB.")
    return Response(content=data, media_type="application/zip", headers={
        "Content-Disposition":'attachment; filename="TIAEngineeringAssistant_LLM_Review.zip"',
        "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff",
    })


# Unlike the historical loaded-profile export above, this endpoint connects
# through Openness to the ENTIRE currently opened TIA Portal project. Hardware,
# every enumerated PLC and HMI are traversed in a SINGLE read-only adapter
# attachment and exported to a temporary local folder before ZIP packaging.
import io as _io
import os as _os
import tempfile as _tempfile
import zipfile as _zipfile
from pathlib import Path as _Path
from fastapi import Query as _Query
from engine.tia.adapter import run_adapter as _run_adapter

_MAX_TIA_FILES = 30000
_MAX_TIA_ARCHIVE_BYTES = 180 * 1024 * 1024
_MAX_TIA_ONE_FILE = 25 * 1024 * 1024


# A real-world TIA V21 session closed during an Openness bulk export.
# Block further project attachments by default until the fault is reproduced
# and explicitly acknowledged in a disposable test environment.
# This switch controls ONLY the complete TIA LLM export, not other TIA APIs.
_EXPERIMENTAL_TIA_EXPORT_FLAG = "TIA_ENABLE_EXPERIMENTAL_LLM_EXPORT"


def _tia_export_enabled() -> bool:
    return _os.getenv(_EXPERIMENTAL_TIA_EXPORT_FLAG, "").strip() == "1"


@router.get("/tia-export-status")
def tia_export_status() -> dict[str, str | bool]:
    enabled = _tia_export_enabled()
    return {
        "enabled": enabled,
        "reason": (
            "Experimental Siemens Openness whole-project export is enabled. "
            "Use only a disposable saved TIA V21 project; closing TIA is still possible."
            if enabled else
            "Whole-project TIA export is temporarily disabled because an "
            "experimental Openness export unexpectedly closed TIA Portal V21. "
            "Other TIA read/import tools are unaffected."
        ),
    }


@router.post("/export-tia-project-for-llm")
def export_open_tia_project_for_llm(process_id: int = _Query(ge=1)) -> Response:
    """Export read-only Open TIA project objects, NOT just app profile.

    TIA XML/TSV exports are written to a server-owned temporary folder.
    No TIA project save, imports, writes, or calls to a language model.
    Never claim Siemens project completeness if unsupported objects remain.
    """
    if not _tia_export_enabled():
        raise HTTPException(
            status_code=503,
            detail=(
                "Experimental whole-project TIA export is disabled after a TIA "
                "Portal V21 shutdown. Use a disposable saved project and set "
                + _EXPERIMENTAL_TIA_EXPORT_FLAG + "=1 only for deliberate diagnostics."
            ),
        )
    with _tempfile.TemporaryDirectory(prefix="tia_llm_export_") as directory:
        try:
            lines = _run_adapter("export-entire-project-llm", str(process_id), directory)
        except HTTPException as exc:
            last_operation = ""
            log = _Path(directory) / "TIA_EXPORT_PROGRESS.log"
            if log.is_file():
                try:
                    operations = log.read_text(encoding="utf-8", errors="replace").splitlines()
                    last_operation = operations[-1][:400] if operations else ""
                except OSError:
                    pass
            detail = str(exc.detail)
            if last_operation:
                detail += "; last export operation: " + last_operation
            raise HTTPException(status_code=exc.status_code, detail=detail) from exc
        result = [line for line in lines if line.startswith("LLM_PROJECT_EXPORTED|")]
        if len(result) != 1:
            raise HTTPException(502, "TIA did not confirm the whole-project export.")
        parts = result[0].split("|", 3)
        if len(parts) != 4:
            raise HTTPException(502, "Malformed TIA export confirmation.")
        project_name = parts[1].strip()
        if not project_name:
            raise HTTPException(502, "TIA export did not identify an open project.")
        root = _Path(directory).resolve()
        files: dict[str, bytes] = {}
        cumulative = 0
        listed = sorted(root.rglob("*"))
        if len(listed) > _MAX_TIA_FILES:
            raise HTTPException(413, "TIA project export exceeds 30,000 file entries.")
        skipped: list[str] = []
        for item in listed:
            if not item.is_file():
                continue
            resolved = item.resolve()
            if root not in resolved.parents or item.is_symlink():
                raise HTTPException(422, "TIA export contains an unsafe file path.")
            relative = item.relative_to(root).as_posix()
            if item.stat().st_size > _MAX_TIA_ONE_FILE:
                skipped.append(relative + ": exceeds 25 MB object limit")
                continue
            content = item.read_bytes()
            cumulative += len(content)
            if cumulative > _MAX_TIA_ARCHIVE_BYTES:
                raise HTTPException(413,
                    "TIA project export exceeds 180 MB of uncompressed source data.")
            files["tia-project/" + relative] = content
        if "tia-project/TIA_OBJECTS.tsv" not in files:
            raise HTTPException(502, "TIA export has no project inventory.")
        if "tia-project/TIA_MISSING.tsv" not in files:
            raise HTTPException(502, "TIA export has no missing-object report.")
        object_rows = files["tia-project/TIA_OBJECTS.tsv"].decode("utf-8-sig", "replace").splitlines()
        missing_rows = files["tia-project/TIA_MISSING.tsv"].decode("utf-8-sig", "replace").splitlines()
        missing_count = max(0, len(missing_rows) - 1) + len(skipped)
        source_files = [
            (path, content) for path, content in files.items()
            if path.casefold().endswith(".xml") and len(content) <= MAX_FILE_BYTES
        ]
        review_input = []
        for path, content in source_files[:250]:
            try:
                review_input.append(ReviewInputFile(
                    name=path, content=content.decode("utf-8-sig"),
                ))
            except (UnicodeError, ValueError):
                skipped.append(path + ": source not parsed as UTF-8 text")
        missing_count += len(skipped) - (missing_count - max(0, len(missing_rows) - 1))
        if review_input:
            analysis = analyze_files(review_input)
            compact = {
                "notice": "Static review only; no TIA compile or network verification",
                "sources_reviewed": len(review_input),
                "sources_in_zip": len(source_files),
                "summary": analysis.summary.model_dump(),
                "findings": [x.model_dump() for x in analysis.findings],
                "dependencies": [
                    {"source":x.source_file, "block":x.name,
                     "dependencies":x.dependencies,
                     "calls":[c.model_dump() for c in x.calls]}
                    for x in analysis.files
                ],
            }
            files["review/DETERMINISTIC_ANALYSIS.json"] = _json(compact)
        missing_lines = [
            "# Missing or unsupported objects",
            "",
            "Siemens Openness object exports vary by technology and permissions.",
            "See tia-project/TIA_MISSING.tsv for every failed/unsupported export.",
            "Export successes do not prove complete project fidelity.",
            "",
            *["- " + item for item in skipped],
        ]
        files["MISSING_SOURCES.md"] = ("\n".join(missing_lines) + "\n").encode("utf-8")
        docs = [
            "# Complete open TIA Portal project — export for LLM review",
            "",
            "This export was generated by attaching read-only to the OPEN TIA Portal",
            "project, not by reading the app's cached profile.",
            "TIA Project: " + project_name,
            "Process ID: " + str(process_id),
            "Devices, hardware sub-items, PLC blocks/UDTs, PLC tag tables and",
            "available HMI objects are inventoried across the project.",
            "All successfully exported native XML and TSV files are included.",
            "",
            "## Read before reviewing",
            "1. Start with MANIFEST.json and tia-project/TIA_OBJECTS.tsv.",
            "2. Inspect tia-project/TIA_MISSING.tsv before judging completeness.",
            "3. Read source XML in tia-project/plc/ and tia-project/hmi/.",
            "4. Review PLC logic, dependencies and interfaces; distinguish",
            "   verified source evidence from any speculative analysis.",
            "5. No project edit/save/compile/import or external LLM call occurred.",
            "",
            "## Known intrinsic API limitations",
            "Openness exports independent objects, not one native readable project.",
            "Some hardware details, library items, HMI Unified exports,",
            "password-protected blocks and unsupported object formats may be",
            "inaccessible. Their absence is reported; a .ap21/.zap21 backup is",
            "NOT generated and must not be inferred from this ZIP.",
            "Large XML files may be present but omitted from static analysis.",
            "",
            "## Confidentiality",
            "This project may contain proprietary PLC logic, network addresses,",
            "customer names and process data. Inspect the ZIP before uploading.",
        ]
        files["README_FOR_CHATGPT.md"] = ("\n".join(docs) + "\n").encode("utf-8")
        inventory = {
            "format":"TIAEngineeringAssistant_open_TIA_project_review",
            "schema_version":2,
            "project_name":project_name,
            "tia_process_id":process_id,
            "source_scope":"entire_open_tia_project",
            "native_tia_archive":False,
            "full_fidelity_guaranteed":False,
            "object_rows":max(0, len(object_rows) - 1),
            "missing_object_rows":max(0, len(missing_rows) - 1),
            "skipped_oversized_or_unreadable":skipped,
            "sources_in_archive":len(source_files),
            "source_files_statically_reviewed":len(review_input),
            "read_only":True,
            "ollama_used":False,
            "files":[{
                "name":name,
                "bytes":len(blob),
                "sha256":hashlib.sha256(blob).hexdigest(),
            } for name, blob in sorted(files.items())],
        }
        files["MANIFEST.json"] = _json(inventory)
        out = _io.BytesIO()
        with _zipfile.ZipFile(out, "w", _zipfile.ZIP_DEFLATED,
                              compresslevel=6, allowZip64=True) as zip_file:
            for name in sorted(files):
                zip_file.writestr(name, files[name])
        archive = out.getvalue()
        if len(archive) > _MAX_TIA_ARCHIVE_BYTES:
            raise HTTPException(413, "TIA project archive exceeds 180 MB compressed.")
        return Response(content=archive, media_type="application/zip", headers={
            "Content-Disposition":
                'attachment; filename="TIA_Portal_Entire_Project_LLM_Review.zip"',
            "Cache-Control":"no-store",
            "X-Content-Type-Options":"nosniff",
        })
