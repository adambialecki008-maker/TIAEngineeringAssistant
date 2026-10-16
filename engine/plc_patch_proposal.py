"""Preview-only SCL line edits. Never writes files or accesses TIA Portal."""
from __future__ import annotations

import difflib
import hashlib
import re

from fastapi import HTTPException
from pydantic import BaseModel, Field

from engine.plc_code_review import ReviewInputFile, analyze_files

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_MAX_SPAN = 20
_MAX_REPLACEMENT = 4000
_MAX_SOURCE = 256_000


class SclPatchPreviewRequest(BaseModel):
    file: ReviewInputFile
    expected_sha256: str = Field(min_length=64, max_length=64)
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)
    expected_original: str = Field(max_length=5000)
    replacement_text: str = Field(max_length=_MAX_REPLACEMENT)


class SclPatchPreviewResponse(BaseModel):
    source_file: str
    original_sha256: str
    modified_sha256: str
    output_filename: str
    start_line: int
    end_line: int
    unified_diff: str
    proposed_content: str
    preview_only: bool = True
    requires_explicit_approval: bool = True
    validation_status: str = "uncompiled; requires TIA validation"
    validation_warnings: list[str] = Field(default_factory=list)


def _digest(source: str) -> str:
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _source_lines(source: str) -> list[str]:
    return source.splitlines(keepends=True)


def preview_scl_change(request: SclPatchPreviewRequest) -> SclPatchPreviewResponse:
    """Validate the source identity and generate an in-memory diff, nothing more."""
    name = request.file.name
    normalized = name.replace("\\", "/")
    elements = normalized.split("/")
    if (
        not normalized.casefold().endswith(".scl")
        or not elements[-1]
        or any(item in {"", ".", ".."} for item in elements)
        or normalized.startswith("/")
        or ":" in normalized
    ):
        raise HTTPException(422, "Only relative, safe .scl source files can be changed.")
    source = request.file.content
    if len(source.encode("utf-8")) > _MAX_SOURCE:
        raise HTTPException(422, "SCL file exceeds the safe preview size limit.")
    if "\x00" in source or "\x00" in request.replacement_text:
        raise HTTPException(422, "NUL characters are not supported.")
    if not _SHA256.fullmatch(request.expected_sha256):
        raise HTTPException(422, "Invalid SHA-256 source identity.")
    actual = _digest(source)
    if actual != request.expected_sha256:
        raise HTTPException(409, "Source digest mismatch; re-analyze the original SCL file.")

    rows = _source_lines(source)
    if (
        request.end_line < request.start_line
        or request.end_line > len(rows)
        or request.end_line - request.start_line + 1 > _MAX_SPAN
    ):
        raise HTTPException(422, "Select a valid range of 1–20 existing SCL lines.")
    previous = "".join(rows[request.start_line - 1:request.end_line])
    if previous != request.expected_original:
        raise HTTPException(409, "Selected source lines changed; recreate the preview.")

    newline = "\r\n" if "\r\n" in source else "\n"
    # Replacement textarea values may use LF even for a Windows CRLF file.
    # Preserve the source's line-ending convention on the exported copy.
    replacement = request.replacement_text.replace("\r\n", "\n").replace("\r", "\n")
    replacement = replacement.replace("\n", newline)
    if previous.endswith(("\r\n", "\n")) and replacement and not replacement.endswith(newline):
        replacement += newline
    if not previous.endswith(("\r\n", "\n")):
        replacement = replacement.rstrip("\r\n")
    result = "".join(rows[:request.start_line - 1]) + replacement + "".join(rows[request.end_line:])
    if result == source:
        raise HTTPException(422, "The proposed code is identical to the original.")
    if not result.strip() or len(result.encode("utf-8")) > _MAX_SOURCE:
        raise HTTPException(422, "The proposed source is empty or exceeds the size limit.")

    before_report = analyze_files([ReviewInputFile(name=name, content=source)])
    after_report = analyze_files([ReviewInputFile(name=name, content=result)])
    before = before_report.files[0]
    after = after_report.files[0]
    # Never allow a line patch to silently replace the program block identity
    # or destroy the source's header.
    if (
        before.verification_status == "failed"
        or after.verification_status == "failed"
        or before.block_type != after.block_type
        or before.name != after.name
        or before.block_type == "Unknown"
    ):
        raise HTTPException(422, "The proposal changes or invalidates the PLC block identity.")
    warnings = [
        "Source-level checks only. Compile and validate the exported copy in TIA before use.",
    ]
    if len(after_report.findings) > len(before_report.findings):
        warnings.append(
            "The proposed copy has more deterministic findings than the original; "
            "inspect its full source before importing anywhere."
        )
    if "\r\n" in source and "\n" in source.replace("\r\n", ""):
        warnings.append("Original source has mixed line endings; inspect the diff.")
    diff = "".join(difflib.unified_diff(
        source.splitlines(keepends=True), result.splitlines(keepends=True),
        fromfile="a/" + name, tofile="b/" + name,
        n=3, lineterm="\n",
    ))
    if not diff.strip():
        raise HTTPException(422, "No textual difference found.")
    output = elements[-1][:-4] + ".reviewed.scl"
    return SclPatchPreviewResponse(
        source_file=name, original_sha256=actual,
        modified_sha256=_digest(result), output_filename=output,
        start_line=request.start_line, end_line=request.end_line,
        unified_diff=diff, proposed_content=result,
        validation_warnings=warnings,
    )
