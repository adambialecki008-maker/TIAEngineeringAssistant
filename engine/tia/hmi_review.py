"""Two-phase, reviewable HMI text translation for TIA V21.

Prepare performs export + translation only; import is a separate explicit action.
The original source culture is never modified during import.
"""
import tempfile
import time
import re
from threading import Lock
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from openpyxl import load_workbook
from pydantic import BaseModel, Field

from engine.tia.compat import run_adapter
from engine.tia.adapter import read_project_saved
from engine.tia.hmi_translation import (
    _project_text_columns,
    _reference_matches_hmi,
    _hmi_project_text_kind,
    _translate_texts,
)
from engine.tia.models import TranslateHmiTextsRequest
from engine.tia.hmi_text_safety import (
    needs_target_fill, normalize_hmi_translation, validate_hmi_translation,
)
from engine.tia.hmi_semantic_qa import semantic_qa_warnings
from engine.tia.ollama_translation import (
    list_ollama_models, resolve_ollama_model, translation_batch_size,
    repair_ollama_translation,
)

router = APIRouter()

# Local single-process app: prepared reviews are deliberately ephemeral.
_REVIEW_TTL = 30 * 60
_REVIEWS: dict[str, dict] = {}
_PROGRESS: dict[str, dict] = {}
_PROGRESS_LOCK = Lock()
_PROGRESS_TTL = 3600


def _record_progress(progress_id: str | None, stage: str,
                     completed: int = 0, total: int = 0):
    if not progress_id:
        return
    now = time.monotonic()
    with _PROGRESS_LOCK:
        for key, value in list(_PROGRESS.items()):
            if now - value["updated_at"] > _PROGRESS_TTL:
                _PROGRESS.pop(key, None)
        previous = _PROGRESS.get(progress_id, {})
        _PROGRESS[progress_id] = {
            "stage": stage,
            "completed": completed,
            "total": total,
            "started_at": previous.get("started_at", now),
            "updated_at": now,
        }


@router.get("/hmis/translation-progress/{progress_id}")
def get_hmi_translation_progress(progress_id: str):
    if not re.fullmatch(r"[a-f0-9]{32}", progress_id):
        raise HTTPException(400, "Invalid translation progress identifier.")
    with _PROGRESS_LOCK:
        progress = _PROGRESS.get(progress_id)
        if progress is None:
            raise HTTPException(404, "No active HMI translation for this identifier.")
        snapshot = dict(progress)
    elapsed = round(time.monotonic() - snapshot["started_at"], 1)
    return {
        "stage": snapshot["stage"],
        "completed": snapshot["completed"],
        "total": snapshot["total"],
        "percent": round(100 * snapshot["completed"] / snapshot["total"], 1)
        if snapshot["total"] else None,
        "elapsed_seconds": elapsed,
    }


class TranslationReviewItem(BaseModel):
    sheet: str
    view_path: str
    source_text: str
    current_target: str
    proposed_target: str


class SkippedReviewTranslation(BaseModel):
    source_text: str
    proposed_target: str = ""
    reason: str


class TranslationReviewResponse(BaseModel):
    review_id: str | None = None
    prepare_id: str | None = None
    hmi_name: str
    view_path_root: str
    source_culture: str
    target_culture: str
    ollama_model: str
    selected_rows: int
    unique_texts: int
    skipped_unique: int = 0
    auto_repaired_unique: int = 0
    skipped: list[SkippedReviewTranslation] = Field(default_factory=list)
    examples: list[TranslationReviewItem]



class ExistingHmiQaFinding(BaseModel):
    sheet: str
    row: int
    view_path: str
    source_text: str
    target_text: str
    reasons: list[str]


class ExistingHmiQaAuditResponse(BaseModel):
    hmi_name: str
    scanned_rows: int
    filled_target_rows: int
    suspicious_rows: int
    shown_rows: int
    limit: int
    findings: list[ExistingHmiQaFinding]


class RepairPreparedTranslationRequest(BaseModel):
    prepare_id: str = Field(pattern=r"^[a-f0-9]{32}$")
    source_text: str = Field(min_length=1, max_length=50000)
    proposal: str = Field(min_length=1, max_length=50000)


class ReviewedTextProposal(BaseModel):
    source_text: str = Field(min_length=1, max_length=50000)
    proposal: str = Field(min_length=1, max_length=50000)


class ImportReviewRequest(BaseModel):
    review_id: str = Field(min_length=32, max_length=64)
    # Optional, so unattended XLSX batch jobs preserve their existing API.
    # Manual review supplies every approved unique source with its edited text.
    proposals: list[ReviewedTextProposal] | None = Field(default=None, max_length=50)


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
        (header, src_col, tgt_col, category_col, path_col), target_header = column_info
        for row_index in range(header + 1, sheet.max_row + 1):
            view_path = _text(sheet.cell(row_index, path_col).value)
            if not _reference_matches_hmi(
                view_path, request.device_name, request.hmi_name,
                request.view_path_root
            ):
                continue
            if _hmi_project_text_kind(
                _text(sheet.cell(row_index, category_col).value), view_path,
            ) != "other":
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
    "/hmis/audit-existing-translations",
    response_model=ExistingHmiQaAuditResponse,
)
def audit_existing_hmi_translations(request: TranslateHmiTextsRequest):
    return _audit_existing_hmi_translations(request, limit=200)


def _audit_existing_hmi_translations(
    request: TranslateHmiTextsRequest, *, limit: int,
) -> ExistingHmiQaAuditResponse:
    """Read-only semantic audit of ALL existing selected-HMI target rows.

    No Ollama calls, language activation, workbook imports or project saves.
    Samples are capped for UI responsiveness; aggregate counts are complete.
    """
    if not request.view_path_root:
        raise HTTPException(
            422, "Choose an explicit HMI ViewPath root and scan it first."
        )
    if request.source_culture.casefold() == request.target_culture.casefold():
        raise HTTPException(422, "Source and target languages must differ.")

    path = _project_export(
        request.process_id, request.source_culture, request.target_culture
    )
    scanned = 0
    filled = 0
    suspicious = 0
    findings = []
    if not 1 <= limit <= 1000000:
        raise HTTPException(422, "Invalid audit reporting limit.")
    try:
        workbook = load_workbook(path, data_only=True)
        try:
            valid_header = False
            for sheet in workbook.worksheets:
                columns = _source_target_columns(
                    sheet, request.source_culture, request.target_culture
                )
                if columns is None:
                    continue
                valid_header = True
                if columns[1].casefold() != request.target_culture.casefold():
                    raise HTTPException(
                        409, "TIA export does not contain the requested target "
                        "language column; audit cannot compare existing translations."
                    )
            if not valid_header:
                raise HTTPException(409, "No supported project-text sheets to audit.")

            for row in _matching_rows(workbook, request):
                scanned += 1
                target = row["current_target"]
                if needs_target_fill(row["source"], target):
                    continue
                if not target.strip():
                    continue
                filled += 1
                reasons = semantic_qa_warnings(
                    row["source"], target, request.target_culture
                )
                if not reasons:
                    continue
                suspicious += 1
                if len(findings) < limit:
                    findings.append(ExistingHmiQaFinding(
                        sheet=row["sheet"],
                        row=row["row_index"],
                        view_path=row["key"][1],
                        source_text=row["source"],
                        target_text=target,
                        reasons=reasons,
                    ))
        finally:
            workbook.close()
    finally:
        path.unlink(missing_ok=True)

    return ExistingHmiQaAuditResponse(
        hmi_name=request.hmi_name,
        scanned_rows=scanned,
        filled_target_rows=filled,
        suspicious_rows=suspicious,
        shown_rows=len(findings),
        limit=limit,
        findings=findings,
    )


@router.get("/hmis/translation-models")
def get_hmi_translation_models():
    """List installed local Ollama models without modifying the TIA project."""
    names = list_ollama_models()
    selected = None
    try:
        selected = resolve_ollama_model(available=names)
    except HTTPException as exc:
        if exc.status_code not in (422, 503):
            raise
    return {
        "provider": "ollama",
        "models": names,
        "selected_model": selected,
        "request_batch_size": translation_batch_size(),
    }


def validate_hmi_translation_quality(
    source: str, proposal: str, target_culture: str,
) -> None:
    """Enforce structural guards and explicit semantic-risk review markers."""
    validate_hmi_translation(source, proposal)
    warnings = semantic_qa_warnings(source, proposal, target_culture)
    if warnings:
        raise HTTPException(
            502, "Semantic QA requires manual review: " + "; ".join(warnings),
        )


def try_repair_unsafe_translation(
    source: str, rejected: str, validation_error: str,
    target_culture: str, model: str,
) -> str | None:
    """Attempt one isolated Ollama repair; never accept invalid output.

    Failed repair or unavailable Ollama means the original proposal is
    still skipped, not that the entire HMI batch fails. Never mutate TIA.
    """
    try:
        candidate = repair_ollama_translation(
            source, rejected, validation_error, target_culture, model,
        )
        candidate = normalize_hmi_translation(source, candidate)
        validate_hmi_translation_quality(source, candidate, target_culture)
    except HTTPException:
        return None
    return candidate


@router.post(
    "/hmis/prepare-translations",
    response_model=TranslationReviewResponse,
)
def prepare_hmi_translations(request: TranslateHmiTextsRequest):
    if request.source_culture.casefold() == request.target_culture.casefold():
        raise HTTPException(400, "Source and target cultures must differ.")
    if request.max_rows is None or request.max_rows > 50:
        raise HTTPException(
            422, "Prepare one batch requires max_rows from 1 to 50. "
            "Use the batch import workflow for a larger total.",
        )
    # Source-copy mode is intentional when Polish labels live in en-US*.
    # Never require or call Ollama for this deterministic operation.
    model = (
        "source-copy"
        if request.translation_strategy == "copy"
        else resolve_ollama_model(request.ollama_model)
    )

    _prune_expired_reviews()
    if len(_REVIEWS) >= 20:
        raise HTTPException(
            429, "Too many pending reviews. Import or restart the app."
        )

    # The synchronous FastAPI endpoint runs in a thread pool. A separate
    # GET request can report progress while export or Ollama is running.
    _record_progress(request.progress_id, "exporting_project_texts")

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

    # Fill only empty / generic 'Text' target cells. Never retranslate
    # correctly populated targets, even when Ollama would propose a change.
    rows = [r for r in rows
            if needs_target_fill(r["source"], r["current_target"])]
    chosen = []
    seen = set()
    for row in rows:
        if row["source"] in seen:
            continue
        seen.add(row["source"])
        chosen.append(row)
        if len(chosen) >= request.max_rows:
            break
    rows = chosen
    if not rows:
        raise HTTPException(
            422, "No missing/placeholder target texts in this HMI. "
            "Existing target translations are preserved.",
        )

    unique = list(dict.fromkeys(
        row["source"] for row in rows
        if any(ch.isalpha() for ch in row["source"])
    ))
    _record_progress(request.progress_id, "translating", 0, len(unique))

    if request.translation_strategy == "copy":
        translated = {source: source for source in unique}
        _record_progress(request.progress_id, "translating", len(unique), len(unique))
    else:
        translated = _translate_texts(
            unique, request.target_culture, model,
            progress=lambda done, total: _record_progress(
                request.progress_id, "translating", done, total
            ),
        )
    _record_progress(request.progress_id, "preparing_review", len(unique), len(unique))

    safe_rows = []
    skipped = []
    skipped_rows = {}
    auto_repaired = 0
    for row in rows:
        source = row["source"]
        proposal = translated.get(source)
        if request.translation_strategy == "copy":
            proposal = source
        proposal = normalize_hmi_translation(source, proposal)
        try:
            validate_hmi_translation_quality(
                source, proposal, request.target_culture,
            )
        except HTTPException as exc:
            if exc.status_code != 502:
                raise
            # One targeted Ollama correction only for structural failures.
            # The repair itself must pass the SAME validator before approval.
            fixed = (
                try_repair_unsafe_translation(
                    source, proposal if isinstance(proposal, str) else "",
                    str(exc.detail), request.target_culture, model,
                )
                if request.translation_strategy == "ollama" else None
            )
            if fixed is not None:
                row["proposal"] = fixed
                safe_rows.append(row)
                auto_repaired += 1
                continue
            rejected = SkippedReviewTranslation(
                source_text=source,
                proposed_target=proposal if isinstance(proposal, str) else "",
                reason=str(exc.detail).split(". Source:", 1)[0],
            )
            skipped.append(rejected)
            skipped_rows[source] = row
            continue
        row["proposal"] = proposal
        safe_rows.append(row)

    # Persist ALL rows in an ephemeral review. Invalid rows are held
    # separately and can only be moved into importable rows after an explicit
    # user edit and a fresh validation. A zero-safe preview has NO import token.
    token = uuid4().hex
    _REVIEWS[token] = {
        "created": time.monotonic(),
        "request": request.model_dump(),
        "model": model,
        "rows": safe_rows,
        "skipped_rows": skipped_rows,
        "skipped": skipped,
        "auto_repaired_unique": auto_repaired,
    }
    _record_progress(request.progress_id, "ready", len(unique), len(unique))
    return _prepared_review_response(token, _REVIEWS[token])


def _prepared_review_response(token: str, prepared: dict) -> TranslationReviewResponse:
    request = TranslateHmiTextsRequest(**prepared["request"])
    safe_rows = prepared["rows"]
    skipped = prepared.get("skipped", [])
    return TranslationReviewResponse(
        review_id=token if safe_rows else None,
        prepare_id=token,
        hmi_name=request.hmi_name,
        view_path_root=request.view_path_root or request.device_name,
        source_culture=request.source_culture,
        target_culture=request.target_culture,
        ollama_model=prepared["model"],
        selected_rows=len(safe_rows),
        unique_texts=len({row["source"] for row in safe_rows}),
        skipped_unique=len(skipped),
        auto_repaired_unique=prepared.get("auto_repaired_unique", 0),
        skipped=skipped,
        examples=_samples(safe_rows),
    )


@router.post(
    "/hmis/repair-prepared-translation",
    response_model=TranslationReviewResponse,
)
def repair_prepared_hmi_translation(request: RepairPreparedTranslationRequest):
    """Validate a user-edited rejected proposal; NEVER import in this step."""
    _prune_expired_reviews()
    prepared = _REVIEWS.get(request.prepare_id)
    if prepared is None or prepared.get("skip_origin"):
        raise HTTPException(404, "HMI prepare review not found or expired.")
    source = request.source_text
    row = prepared.get("skipped_rows", {}).get(source)
    if row is None:
        raise HTTPException(
            409, "The selected source is not an unresolved skipped proposal."
        )
    proposal = normalize_hmi_translation(source, request.proposal)
    validate_hmi_translation_quality(
        source, proposal, prepared["request"]["target_culture"],
    )
    # Do not accept a repair when it could conflict with a safe candidate.
    if any(existing["source"] == source for existing in prepared["rows"]):
        raise HTTPException(409, "Text already exists in the validated review.")

    row["proposal"] = proposal
    prepared["rows"].append(row)
    del prepared["skipped_rows"][source]
    prepared["skipped"] = [
        item for item in prepared["skipped"] if item.source_text != source
    ]
    return _prepared_review_response(request.prepare_id, prepared)


@router.post(
    "/hmis/import-reviewed-translations",
    response_model=ImportReviewResponse,
)
def import_reviewed_hmi_translations(request: ImportReviewRequest):
    return _import_reviewed_hmi_translations(request)


def _import_reviewed_hmi_translations(
    request: ImportReviewRequest, *, allow_skipped: bool = False,
):
    _prune_expired_reviews()
    review = _REVIEWS.get(request.review_id)
    if review and review.get("skip_origin") and not allow_skipped:
        raise HTTPException(
            409, "Skipped-translation review must be imported through "
            "its original batch job, so the verified checkpoint is updated."
        )
    if review and not review["rows"]:
        raise HTTPException(409, "No validated HMI translations to import.")
    # Validate ALL manually edited proposals while the review is still present.
    # No Openness write or review-token consumption occurs on validation error.
    if review and request.proposals is not None:
        if review.get("skip_origin"):
            raise HTTPException(409, "Batch-skipped proposals require job approval.")
        provided = {item.source_text: item.proposal for item in request.proposals}
        current = {item["source"]: item for item in review["rows"]}
        if len(provided) != len(request.proposals) or set(provided) != set(current):
            raise HTTPException(
                409, "Submitted Project texts must match every validated review row."
            )
        validated = {}
        for source, proposal in provided.items():
            candidate = normalize_hmi_translation(source, proposal)
            validate_hmi_translation_quality(
                source, candidate, review["request"]["target_culture"]
            )
            validated[source] = candidate
        for source, candidate in validated.items():
            current[source]["proposal"] = candidate
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

                # Siemens imports multilingual texts with their parent
                # object. Retain all rows belonging to the selected HMI,
                # even in a 10-text pilot, while leaving their existing
                # target values untouched unless explicitly reviewed.
                path_col = columns[0][4]
                category_col = columns[0][3]
                for index in range(header + 1, sheet.max_row + 1):
                    ref = _text(sheet.cell(index, path_col).value)
                    kind = _hmi_project_text_kind(
                        _text(sheet.cell(index, category_col).value), ref
                    )
                    if kind == "other" and _reference_matches_hmi(
                        ref, requested.device_name, requested.hmi_name,
                        requested.view_path_root
                    ):
                        keep[sheet.title].add(index)

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
                if not needs_target_fill(row["source"], row["current_target"]):
                    raise HTTPException(
                        409, "Existing HMI target is already populated; "
                        "refusing to overwrite: " + row["key"][1][:180]
                    )
                validate_hmi_translation_quality(
                    prepared_row["source"], prepared_row["proposal"], target,
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

            # Keep entire selected HMI's original worksheet structure,
            # row IDs and parent references; exclude unrelated HMI devices.
            # Only individually reviewed target cells are changed.
            for sheet in workbook.worksheets:
                columns = _source_target_columns(sheet, source, target)
                if columns is None:
                    continue
                # _source_target_columns returns (column_tuple, target_header).
                # The header row index is the first element of column_tuple.
                header = columns[0][0]
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
        # ProjectTextResultState.Info is a non-error result from TIA
        # Openness, not a failed import. It still requires a fresh XLSX
        # export and exact verification of every approved target cell below.
        # Warning/Error/unknown states remain blocked.
        accepted_states = {"success", "succeeded", "ok", "info", "information"}
        if import_state.strip().casefold() not in accepted_states:
            raise HTTPException(
                502, "TIA import returned a non-confirmed state: "
                + (import_state or "missing status")
                + ". Review the XML log: " + (import_log or "not available")
                + ". Import may have partially changed TIA; check the "
                + "current project texts before retrying."
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
            "TIA import returned " + import_state
            + " but re-export verification failed for "
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
