"""Read-only, deterministic first-pass PLC source analysis.

This module deliberately does not execute or modify uploaded content. XML is
treated as data and may produce a partial result when a Siemens export variant
does not expose declarations or networks understood here.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pydantic import BaseModel, Field

from engine.tia.type_registry import is_builtin_type
from engine.tia.xml_parser import xml_attribute, xml_local_name

MAX_FILE_BYTES = 2 * 1024 * 1024
SUPPORTED_SUFFIXES = {".scl", ".xml"}
_BLOCK = re.compile(r"^\s*(FUNCTION_BLOCK|FUNCTION|DATA_BLOCK|TYPE|ORGANIZATION_BLOCK)\s+([A-Za-z_][A-Za-z0-9_]*)", re.I)
_DECL = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\s*\[[^;]+\])?)\s*;", re.I)


class ReviewInputFile(BaseModel):
    name: str = Field(min_length=1, max_length=512)
    content: str = Field(max_length=MAX_FILE_BYTES)


class ReviewDeclaration(BaseModel):
    name: str
    data_type: str
    section: str = ""
    location: str = ""


class ReviewBlock(BaseModel):
    source_file: str
    name: str
    block_type: str
    language: str
    declarations: list[ReviewDeclaration] = Field(default_factory=list)
    networks: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    parsing_warnings: list[str] = Field(default_factory=list)
    verification_status: str = "partial"


class ReviewFinding(BaseModel):
    source_file: str
    block: str = ""
    language: str = ""
    location: str = ""
    severity: str
    category: str
    explanation: str
    suggested_fix: str = ""
    evidence: str = ""
    detection_method: str = "rule"
    verification_status: str = "verified"


class ReviewReport(BaseModel):
    files: list[ReviewBlock] = Field(default_factory=list)
    findings: list[ReviewFinding] = Field(default_factory=list)
    file_warnings: list[str] = Field(default_factory=list)
    read_only: bool = True


def _suffix(name: str) -> str:
    return "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""


def _scl(file: ReviewInputFile) -> ReviewBlock:
    block = ReviewBlock(source_file=file.name, name=file.name, block_type="Unknown", language="SCL")
    section = ""
    for line_no, line in enumerate(file.content.splitlines(), 1):
        hit = _BLOCK.match(line)
        if hit:
            block.block_type, block.name = hit.group(1).upper(), hit.group(2)
        if line.strip().upper().startswith("VAR_") or line.strip().upper() in {"VAR", "VAR_INPUT", "VAR_OUTPUT", "VAR_IN_OUT", "VAR_TEMP", "VAR_STATIC", "VAR_CONSTANT"}:
            section = line.strip().upper().replace("VAR_", "").replace("VAR", "STATIC")
        elif line.strip().upper() == "END_VAR":
            section = ""
        elif section and (decl := _DECL.match(line)):
            block.declarations.append(ReviewDeclaration(name=decl.group(1), data_type=decl.group(2), section=section, location=f"line {line_no}"))
    if block.block_type == "Unknown":
        block.parsing_warnings.append("No supported SCL block header was found.")
        block.verification_status = "partial"
    else:
        block.verification_status = "parsed"
    return block


def _xml(file: ReviewInputFile) -> ReviewBlock:
    try:
        root = ET.fromstring(file.content)
    except ET.ParseError as exc:
        return ReviewBlock(source_file=file.name, name=file.name, block_type="Unknown", language="XML", parsing_warnings=[f"Invalid XML: {exc}."], verification_status="failed")
    root_name = xml_local_name(root.tag)
    source_name = xml_attribute(root, "Name") or file.name
    joined = (" ".join(xml_local_name(node.tag) for node in root.iter()) + " " + source_name).upper()
    block_type = "FB" if ".FB" in joined or source_name.upper().startswith("FB_") or root_name.upper().endswith("FB") else "FC" if ".FC" in joined or source_name.upper().startswith("FC_") or root_name.upper().endswith("FC") else "DB" if "DB" in joined else "UDT" if "UDT" in joined or "TYPE" in joined else "Unknown"
    language = xml_attribute(root, "ProgrammingLanguage", "Language") or ("LAD/FBD XML" if block_type in {"FB", "FC"} else "SimaticML XML")
    block = ReviewBlock(source_file=file.name, name=source_name, block_type=block_type, language=language)
    section = ""
    for node in root.iter():
        tag = xml_local_name(node.tag)
        if tag == "Section": section = xml_attribute(node, "Name")
        if tag == "Member":
            name, data_type = xml_attribute(node, "Name"), xml_attribute(node, "Datatype", "DataType", "Type")
            if name and data_type:
                block.declarations.append(ReviewDeclaration(name=name, data_type=data_type, section=section, location="XML member " + name))
        if tag in {"CompileUnit", "Network"}:
            block.networks.append("network " + str(len(block.networks) + 1))
    if block_type == "Unknown": block.parsing_warnings.append("Unsupported XML export variant; declarations are best-effort only.")
    if not block.declarations and not block.networks: block.parsing_warnings.append("XML contains no recognized declarations or networks.")
    block.verification_status = "partial"
    return block


def analyze_files(files: list[ReviewInputFile]) -> ReviewReport:
    report = ReviewReport()
    for file in files:
        suffix = _suffix(file.name)
        if suffix not in SUPPORTED_SUFFIXES:
            report.file_warnings.append(f"{file.name}: unsupported extension; skipped.")
            continue
        if len(file.content.encode("utf-8")) > MAX_FILE_BYTES:
            report.file_warnings.append(f"{file.name}: exceeds {MAX_FILE_BYTES} byte limit; skipped.")
            continue
        report.files.append(_scl(file) if suffix == ".scl" else _xml(file))
    names = {block.name.casefold() for block in report.files if block.block_type != "Unknown"}
    for block in report.files:
        seen = set()
        for declaration in block.declarations:
            key = declaration.name.casefold()
            if key in seen:
                report.findings.append(ReviewFinding(source_file=block.source_file, block=block.name, language=block.language, location=declaration.location, severity="error", category="Duplicate declaration", explanation=f"{declaration.name} is declared more than once in this parsed block.", evidence=declaration.name))
            seen.add(key)
            data_type = declaration.data_type.split("[")[0].strip()
            if not is_builtin_type(data_type) and data_type.casefold() not in names:
                report.findings.append(ReviewFinding(source_file=block.source_file, block=block.name, language=block.language, location=declaration.location, severity="warning", category="Unresolved dependency", explanation=f"{data_type} is not among the loaded blocks or registered Siemens types.", suggested_fix="Load the defining UDT/FB/FC/DB or review in the full TIA project.", evidence=data_type, verification_status="requires project context"))
            elif not is_builtin_type(data_type):
                block.dependencies.append(data_type)
        block.dependencies = sorted(set(block.dependencies), key=str.casefold)
    return report
