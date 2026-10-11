"""Two-phase, reviewable HMI text translation for TIA V21.

Prepare performs export + translation only; import is a separate explicit action.
The original source culture is never modified during import.
"""
import os
import tempfile
import time
from pathlib import Path
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from openpyxl import load_workbook
from pydantic import BaseModel, Field

from engine.tia.compat import run_adapter
from engine.tia.adapter import read_project_saved
from engine.tia.hmi_translation import (
    _project_text_columns,
    _reference_matches_hmi,
    _translate_texts,
)
from engine.tia.models import TranslateHmiTextsRequest

load_dotenv()
router = APIRouter()

# Local single-process app: prepared reviews are deliberately ephemeral.
_REVIEW_TTL = 30 * 60
_REVIEWS: dict[str, dict] = {}


class TranslationReviewItem(BaseModel):
    sheet: str
    view_path: str
    source_text: str
    current_target: str
    proposed_target: str


class TranslationReviewResponse(BaseModel):
    review_id: str
    hmi_name: str
    view_path_root: str
    source_culture: str
    target_culture: str
    selected_rows: int
    unique_texts: int
    examples: list[TranslationReviewItem]


class ImportReviewRequest(BaseModel):
    review_id: str = Field(min_length=32, max_length=64)


class ImportReviewResponse(BaseModel):
    status: str
    imported_rows: int
    verified_rows: int
    import_state: str
    import_log: str = ""
    project_saved: str | None = None
    examples: list[TranslationReviewItem]


def _prune_expired_reviews() -> None:
    now = time.monotonic()
    for key, review in list(_REVIEWS.items()):
        if now - review["created"] > _REVIEW_TTL:
            _REVIEWS.pop(key, None)


def _text(value) -> str:
    return "" if value is None else str(value)


def _project_export(process_id: int, source: str, target: str) -> Path:
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        path = Path(tmp.name)
    try:
        run_adapter(
            "export-project-texts", str(process_id), source, target, str(path)
        )
        if not path.exists() or path.stat().st_size == 0:
            raise HTTPException(502, "TIA did not produce an XLSX export.")
        return path
    except BaseException:
        path.unlink(missing_ok=True)
        raise


def _row_key(sheet: str, view_path: str, internal_id: str) -> tuple:
    return sheet, view_path, internal_id


def _source_target_columns(sheet, source: str, target: str):
    cols = _project_text_columns(sheet, source, target)
    if cols is None:
        return None
    header_row, source_col, target_col, category_col, view_col = cols
    if _text(sheet.cell(header_row, view_col).value).casefold() != "viewpath":
        raise HTTPException(
            409, "Unsupported TIA export layout: ViewPath column missing."
        )
    actual_source = _text(sheet.cell(header_row, source_col).value).strip()
    if actual_source.casefold() != (source + "*").casefold():
        raise HTTPException(
            409, "Unexpected source column: " + actual_source
        )
    actual_target = _text(sheet.cell(header_row, target_col).value).strip()
    if actual_target.casefold() not in (target.casefold(), source.casefold()):
        raise HTTPException(
            409, "Unexpected target column: " + actual_target
        )
    return cols, actual_target


def _matching_rows(workbook, request):
    for sheet in workbook.worksheets:
        column_info = _source_target_columns(
            sheet, request.source_culture, request.target_culture
        )
        if column_info is None:
            continue
        (header, src_col, tgt_col, _category_col, path_col), target_header = column_info
        for row_index in range(header + 1, sheet.max_row + 1):
            view_path = _text(sheet.cell(row_index, path_col).value)
            if not _reference_matches_hmi(
                view_path, request.device_name, request.hmi_name,
                request.view_path_root
            ):
                continue
            source = _text(sheet.cell(row_index, src_col).value)
            if not source.strip():
                continue
            internal_id = _text(sheet.cell(row_index, 3).value)
            current_target = _text(sheet.cell(row_index, tgt_col).value)
            yield {
                "key": _row_key(sheet.title, view_path, internal_id),
                "sheet": sheet.title,
                "row_index": row_index,
                "source": source,
                "current_target": current_target,
                "target_header": target_header,
                "target_column": tgt_col,
            }


def _samples(rows):
    return [
        TranslationReviewItem(
            sheet=row["sheet"],
            view_path=row["key"][1],
            source_text=row["source"],
            current_target=row["current_target"],
            proposed_target=row["proposal"],
        )
        for row in rows[:50]
    ]


@router.post(
    "/hmis/prepare-translations",
    response_model=TranslationReviewResponse,
)
def prepare_hmi_translations(request: TranslateHmiTextsRequest):
    if request.source_culture.casefold() == request.target_culture.casefold():
        raise HTTPException(400, "Source and target cultures must differ.")
    if not os.getenv("OPENAI_API_KEY", "").strip():
        raise HTTPException(
            503, "OPENAI_API_KEY is not configured; no TIA changes were made."
        )

    _prune_expired_reviews()
    if len(_REVIEWS) >= 20:
        raise HTTPException(
            429, "Too many pending reviews. Import or restart the app."
        )

    path = _project_export(
        request.process_id, request.source_culture, request.target_culture
    )
    try:
        workbook = load_workbook(path, read_only=False, data_only=True)
        try:
            rows = list(_matching_rows(workbook, request))
        finally:
            workbook.close()
    finally:
        path.unlink(missing_ok=True)

    if not rows:
        raise HTTPException(
            404, "No source text found for the selected HMI ViewPath root."
        )

    if request.max_rows is not None:
        chosen = []
        seen = set()
        for row in rows:
            if not any(char.isalpha() for char in row["source"]):
                continue
            if row["source"] in seen:
                continue
            seen.add(row["source"])
            chosen.append(row)
            if len(chosen) >= request.max_rows:
                break
        rows = chosen
    if not rows:
        raise HTTPException(422, "No meaningful text rows to translate.")

    unique = list(dict.fromkeys(
        row["source"] for row in rows
        if any(ch.isalpha() for ch in row["source"])
    ))
    translated = _translate_texts(unique, request.target_culture)

    for row in rows:
        source = row["source"]
        proposal = translated[source] if source in translated else source
        if not isinstance(proposal, str) or not proposal.strip():
            raise HTTPException(
                502, "Translation model returned empty text for " + source[:60]
            )
        if proposal.strip().casefold() == "text" and source.strip().casefold() != "text":
            raise HTTPException(
                502, "Translation returned suspicious placeholder 'Text' for "
                + source[:60]
            )
        row["proposal"] = proposal

    token = uuid4().hex
    _REVIEWS[token] = {
        "created": time.monotonic(),
        "request": request.model_dump(),
        "rows": rows,
    }
    return TranslationReviewResponse(
        review_id=token,
        hmi_name=request.hmi_name,
        view_path_root=request.view_path_root or request.device_name,
        source_culture=request.source_culture,
        target_culture=request.target_culture,
        selected_rows=len(rows),
        unique_texts=len(unique),
        examples=_samples(rows),
    )


@router.post(
    "/hmis/import-reviewed-translations",
    response_model=ImportReviewResponse,
)
def import_reviewed_hmi_translations(request: ImportReviewRequest):
    _prune_expired_reviews()
    review = _REVIEWS.pop(request.review_id, None)
    if review is None:
        raise HTTPException(
            404, "Prepared translation not found or expired. Prepare again."
        )

    source = review["request"]["source_culture"]
    target = review["request"]["target_culture"]
    process_id = review["request"]["process_id"]

    # The user has explicitly approved import; only now may we add a language.
    run_adapter("add-project-language", str(process_id), target)
    path = _project_export(process_id, source, target)
    try:
        workbook = load_workbook(path)
        try:
            requested = TranslateHmiTextsRequest(**review["request"])
            prepared = {row["key"]: row for row in review["rows"]}
            found = set()
            keep = {}

            for sheet in workbook.worksheets:
                columns = _source_target_columns(sheet, source, target)
                if columns is None:
                    continue
                (header, _src_col, target_col, _cat_col, _path_col), actual = columns
                if actual.casefold() != target.casefold():
                    raise HTTPException(
                        409, "TIA did not export the requested target column "
                        + target + " after language activation."
                    )
                keep[sheet.title] = set()

            for row in _matching_rows(workbook, requested):
                key = row["key"]
                prepared_row = prepared.get(key)
                if prepared_row is None:
                    continue
                if key in found:
                    raise HTTPException(409, "Duplicate TIA text identifier.")
                if (
                    row["source"] != prepared_row["source"]
                    or row["current_target"] != prepared_row["current_target"]
                ):
                    raise HTTPException(
                        409,
                        "TIA project text changed after review: "
                        + row["key"][1][:180]
                    )
                workbook[row["sheet"]].cell(
                    row["row_index"], row["target_column"]
                ).value = prepared_row["proposal"]
                keep[row["sheet"]].add(row["row_index"])
                found.add(key)

            if found != set(prepared):
                raise HTTPException(
                    409,
                    "TIA project changed after review: "
                    + str(len(set(prepared) - found))
                    + " translated rows could not be matched."
                )

            # Keep the original worksheet/header/ID format. Import rows only
            # for this HMI; never translate or reimport unrelated HMI rows.
            for sheet in workbook.worksheets:
                columns = _source_target_columns(sheet, source, target)
                if columns is None:
                    continue
                header = columns[0]
                retained = keep.get(sheet.title, set())
                runs = []
                start = None
                for idx in range(header + 1, sheet.max_row + 1):
                    if idx not in retained:
                        if start is None:
                            start = idx
                    elif start is not None:
                        runs.append((start, idx - 1))
                        start = None
                if start is not None:
                    runs.append((start, sheet.max_row))
                for first, last in reversed(runs):
                    sheet.delete_rows(first, last - first + 1)

            workbook.save(path)
        finally:
            workbook.close()

        lines = run_adapter(
            "import-project-texts", str(process_id), str(path), "false"
        )
        import_state = ""
        import_log = ""
        for line in lines:
            if line.startswith("PROJECT_TEXTS_IMPORTED|"):
                parts = line.split("|", 2)
                import_state = parts[1] if len(parts) > 1 else ""
                import_log = parts[2] if len(parts) > 2 else ""
        if import_state.casefold() not in ("success", "succeeded"):
            raise HTTPException(
                502, "TIA import did not confirm success: "
                + (import_state or "missing status")
                + ". Log: " + (import_log or "not available")
            )
    finally:
        path.unlink(missing_ok=True)

    # Verify actual TIA content, not merely an Openness success status.
    verify_path = _project_export(process_id, source, target)
    try:
        check = load_workbook(verify_path, data_only=True)
        try:
            request_obj = TranslateHmiTextsRequest(**review["request"])
            actual = {
                row["key"]: row["current_target"]
                for row in _matching_rows(check, request_obj)
            }
        finally:
            check.close()
    finally:
        verify_path.unlink(missing_ok=True)

    mismatches = [
        row["key"][1]
        for row in review["rows"]
        if actual.get(row["key"]) != row["proposal"]
    ]
    if mismatches:
        raise HTTPException(
            502,
            "TIA reported import success but verification failed for "
            + str(len(mismatches)) + " row(s). First: "
            + mismatches[0][:180] + ". Import log: "
            + (import_log or "not available")
        )

    return ImportReviewResponse(
        status="verified",
        imported_rows=len(review["rows"]),
        verified_rows=len(review["rows"]),
        import_state=import_state,
        import_log=import_log,
        project_saved=read_project_saved(lines),
        examples=_samples(review["rows"])[:10],
    )
