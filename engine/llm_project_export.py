"""Read-only, offline ZIP export of loaded PLC profile for external LLM review."""
from __future__ import annotations
import hashlib
import io
import json
import re
import zipfile
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from engine.plc_code_review import ReviewInputFile, analyze_files, MAX_FILE_BYTES
from engine.llm_review_companion import build_review_companion
from engine.tia_offline_audit import analyze_exported_plc, audit_artifacts
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


def _tia_export_filename(project_name: str, active_plc: str, today: date | None = None) -> str:
    export_date = today or datetime.now(ZoneInfo("Europe/Warsaw")).date()
    return "Export_LLM_{}_{}_{}.zip".format(
        _label(project_name), _label(active_plc or "NoActivePLC"),
        export_date.strftime("%Y_%m_%d"),
    )


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
import tempfile as _tempfile
import zipfile as _zipfile
from pathlib import Path as _Path
from fastapi import Query as _Query
from engine.tia.adapter import run_adapter as _run_adapter

_MAX_TIA_FILES = 30000
_MAX_TIA_ARCHIVE_BYTES = 180 * 1024 * 1024
_MAX_TIA_ONE_FILE = 25 * 1024 * 1024
_STATIC_REVIEW_QUOTAS = {
    # PLC logic is the primary purpose of this archive. Keep its selection
    # independent from the usually much larger HMI export tree.
    "plc": 250,
    "hmi": 50,
    "other": 25,
}
_HMI_CONNECTION_REFERENCE = re.compile(r"\bHMI_Connection_[A-Za-z0-9_.-]+\b")


def _static_review_scope(path: str) -> str:
    lowered = path.casefold()
    if lowered.startswith("tia-project/plc/"):
        return "plc"
    if lowered.startswith("tia-project/hmi/"):
        return "hmi"
    return "other"


def _select_static_review_sources(
    files: dict[str, bytes],
) -> tuple[list[ReviewInputFile], dict[str, Any]]:
    """Select bounded XML review input without letting HMI hide PLC logic.

    This remains a conservative static sampling layer. It reports every XML
    source's review state so an empty finding list cannot be mistaken for a
    complete project audit.
    """
    xml_sources = sorted(
        (path, content)
        for path, content in files.items()
        if path.casefold().endswith(".xml")
    )
    review_input: list[ReviewInputFile] = []
    records: list[dict[str, str]] = []
    by_scope: dict[str, dict[str, int]] = {
        scope: {
            "in_archive": 0,
            "analyzed": 0,
            "skipped_limit": 0,
            "skipped_oversized": 0,
            "skipped_unreadable": 0,
        }
        for scope in _STATIC_REVIEW_QUOTAS
    }
    sources_by_scope: dict[str, list[tuple[str, bytes]]] = {
        scope: [] for scope in _STATIC_REVIEW_QUOTAS
    }
    for path, content in xml_sources:
        scope = _static_review_scope(path)
        by_scope[scope]["in_archive"] += 1
        sources_by_scope[scope].append((path, content))

    for scope, sources in sources_by_scope.items():
        quota = _STATIC_REVIEW_QUOTAS[scope]
        selected = 0
        for path, content in sources:
            if len(content) > MAX_FILE_BYTES:
                by_scope[scope]["skipped_oversized"] += 1
                records.append({
                    "path": path,
                    "scope": scope,
                    "status": "skipped",
                    "reason": "exceeds static-review single-file limit",
                })
                continue
            if selected >= quota:
                by_scope[scope]["skipped_limit"] += 1
                records.append({
                    "path": path,
                    "scope": scope,
                    "status": "skipped",
                    "reason": "static-review scope quota reached",
                })
                continue
            try:
                text = content.decode("utf-8-sig")
            except UnicodeError:
                by_scope[scope]["skipped_unreadable"] += 1
                records.append({
                    "path": path,
                    "scope": scope,
                    "status": "skipped",
                    "reason": "not valid UTF-8 text",
                })
                continue
            review_input.append(ReviewInputFile(name=path, content=text))
            selected += 1
            by_scope[scope]["analyzed"] += 1
            records.append({
                "path": path,
                "scope": scope,
                "status": "analyzed",
                "reason": "selected within scope quota",
            })

    coverage = {
        "notice": (
            "Static findings apply only to sources marked analyzed. "
            "Skipped sources are unreviewed, not error-free."
        ),
        "quotas": _STATIC_REVIEW_QUOTAS,
        "by_scope": by_scope,
        "sources": records,
    }
    return review_input, coverage


def _missing_hmi_connection_lines(files: dict[str, bytes]) -> list[str]:
    """Report exported HMI tag references whose connection XML is absent.

    The raw XML remains authoritative. This intentionally recognizes only the
    documented Classic naming form rather than guessing arbitrary XML schemas.
    """
    references: dict[str, set[str]] = {}
    exported: dict[str, set[str]] = {}
    for path, content in files.items():
        lowered = path.casefold()
        if not (lowered.startswith("tia-project/hmi/") and lowered.endswith(".xml")):
            continue
        parts = path.split("/")
        if len(parts) < 4:
            continue
        owner = parts[2]
        try:
            text = content.decode("utf-8-sig")
        except UnicodeError:
            continue
        found = set(_HMI_CONNECTION_REFERENCE.findall(text))
        if not found:
            continue
        references.setdefault(owner, set()).update(found)
        if "/connections/" in lowered or "/connectionfolder/" in lowered:
            exported.setdefault(owner, set()).update(found)
    lines = []
    for owner, names in sorted(references.items()):
        for name in sorted(names - exported.get(owner, set())):
            lines.append(
                "HMI_CONNECTION_REFERENCED_NOT_EXPORTED\t"
                + owner + "/" + name + "\t"
                + "Referenced by exported HMI XML, but no exported connection XML "
                + "for that HMI contains the same HMI_Connection identifier"
            )
    return lines


@router.get("/tia-export-status")
def tia_export_status() -> dict[str, str | bool]:
    return {
        "enabled": True,
        "reason": "Read-only whole-project export is available. A lost Openness session aborts the export and is reported without reusing stale TIA objects.",
    }


@router.post("/export-tia-project-for-llm")
def export_open_tia_project_for_llm(
    process_id: int = _Query(ge=1),
    active_plc: str = _Query(default="", max_length=128),
) -> Response:
    """Export read-only Open TIA project objects, NOT just app profile.

    TIA XML/TSV exports are written to a server-owned temporary folder.
    No TIA project save, imports, writes, or calls to a language model.
    Never claim Siemens project completeness if unsupported objects remain.
    """
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
        connection_missing = _missing_hmi_connection_lines(files)
        if connection_missing:
            missing_path = "tia-project/TIA_MISSING.tsv"
            current_missing = files[missing_path].decode("utf-8-sig", "replace").rstrip("\r\n")
            files[missing_path] = (
                current_missing + "\n" + "\n".join(connection_missing) + "\n"
            ).encode("utf-8")
        object_rows = files["tia-project/TIA_OBJECTS.tsv"].decode("utf-8-sig", "replace").splitlines()
        missing_rows = files["tia-project/TIA_MISSING.tsv"].decode("utf-8-sig", "replace").splitlines()
        missing_count = max(0, len(missing_rows) - 1) + len(skipped)
        review_input, static_coverage = _select_static_review_sources(files)
        source_files = [
            path for path in files
            if path.casefold().endswith(".xml")
        ]
        if review_input:
            analysis = analyze_files(review_input)
            summary = analysis.summary.model_dump()
            findings = [x.model_dump() for x in analysis.findings]
            dependencies = [
                {"source": x.source_file, "block": x.name,
                 "dependencies": x.dependencies,
                 "calls": [c.model_dump() for c in x.calls]}
                for x in analysis.files
            ]
            warnings = analysis.file_warnings
        else:
            summary = None
            findings = []
            dependencies = []
            warnings = ["No XML source could be selected for static review."]
        compact = {
            "notice": (
                "Static review only; no TIA compile or network verification. "
                "Zero findings describe only the analyzed subset and never "
                "mean every project source is error-free."
            ),
            "sources_reviewed": len(review_input),
            "sources_in_zip": len(source_files),
            "coverage": static_coverage,
            "summary": summary,
            "findings": findings,
            "dependencies": dependencies,
            "warnings": warnings,
        }
        files["review/DETERMINISTIC_ANALYSIS.json"] = _json(compact)
        # Full offline PLC XML pass. Pure analysis of already exported bytes:
        # no second TIA attach, no LLM API, no PLC import/write.
        engineering_audit = analyze_exported_plc(files)
        files.update(audit_artifacts(engineering_audit, static_coverage))
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
            "0. OPEN START_HERE.md. Its REVIEW_PROMPT_PL.md contains a thorough",
            "   Polish engineering review instruction for external LLMs.",
            "1. Start with review/SOURCE_INDEX.json, MANIFEST.json and",
            "   tia-project/TIA_OBJECTS.tsv.",
            "2. Inspect tia-project/TIA_MISSING.tsv before judging completeness.",
            "   For token-efficient analysis, START with review/LLM_BRIEF_PL.md",
            "   and review/ENGINEERING_SUMMARY.md.",
            "   review/ENGINEERING_AUDIT.json indexes every available PLC XML",
            "   and machine-level source relationships; check claims in XML.",
            "   review/LOGIC_FINDINGS.json includes source-cited simple Boolean",
            "   condition checks and reproducible counterexamples; these are",
            "   engineering review priorities, NOT runtime or Safety diagnoses.",
            "3. Read source XML in tia-project/plc/ and tia-project/hmi/.",
            "   The index lists ALL PLC source files, not just the static sample.",
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
            "The static report lists analyzed and skipped sources by scope;",
            "zero findings only describes the analyzed subset.",
            "",
            "## Confidentiality",
            "This project may contain proprietary PLC logic, network addresses,",
            "customer names and process data. Inspect the ZIP before uploading.",
        ]
        files["README_FOR_CHATGPT.md"] = ("\n".join(docs) + "\n").encode("utf-8")
        # Pure ZIP postprocessing: no new TIA attachments, project writes or
        # extra full-source static analysis. Preserve every original XML.
        files.update(build_review_companion(
            files, project_name, process_id, static_coverage,
        ))
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
            "static_review_coverage": static_coverage["by_scope"],
            "offline_plc_analysis_coverage": engineering_audit["coverage"],
            "offline_plc_analysis_files": [
                "review/ENGINEERING_AUDIT.json",
                "review/ENGINEERING_SUMMARY.md",
                "review/LLM_BRIEF_PL.md",
                "review/LOGIC_FINDINGS.json",
            ],
            "review_companion": [
                "START_HERE.md", "REVIEW_PROMPT_PL.md", "review/SOURCE_INDEX.json",
            ],
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
                'attachment; filename="' + _tia_export_filename(
                    project_name, active_plc,
                ) + '"',
            "Cache-Control":"no-store",
            "X-Content-Type-Options":"nosniff",
        })
