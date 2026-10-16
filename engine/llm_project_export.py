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
