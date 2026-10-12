"""Resumable, sequential Ollama -> TIA import batches.

Every successful batch is verified with a fresh Openness XLSX export before
the cursor advances. Checkpoints are stored locally (gitignored), so a
restart does not silently replay already verified batches.
"""
import json
import os
import tempfile
import time
from pathlib import Path
from typing import Literal
from threading import Lock
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from openpyxl import load_workbook
from pydantic import BaseModel, Field

from engine.tia.adapter import PROJECT_ROOT
from engine.tia.models import TranslateHmiTextsRequest
from engine.tia.hmi_text_safety import (
    needs_target_fill, normalize_hmi_translation, validate_hmi_translation,
)
from engine.tia.ollama_translation import resolve_ollama_model
from engine.tia import hmi_review as review

router = APIRouter()
JOB_DIR = PROJECT_ROOT / ".local" / "hmi_translation_jobs"
_JOB_LOCK = Lock()
_ACTIVE_JOBS: set[str] = set()


class StartBatchJobRequest(TranslateHmiTextsRequest):
    # One Ollama-to-TIA import transaction per batch, not the internal
    # Ollama JSON requests (whose size is OLLAMA_TRANSLATION_BATCH_SIZE).
    batch_size: int = Field(default=50, ge=1, le=200)
    total_to_translate: int | None = Field(default=None, ge=1, le=100000)


class BatchJobAction(BaseModel):
    retry_failed_batch: bool = False


class PrepareSkippedRequest(BaseModel):
    mode: Literal["ollama", "manual"] = "ollama"
    proposal: str | None = Field(default=None, max_length=50000)
    ollama_model: str | None = Field(default=None, max_length=128)


def _job_path(job_id: str) -> Path:
    if len(job_id) != 32 or any(c not in "0123456789abcdef" for c in job_id):
        raise HTTPException(422, "Invalid batch job ID.")
    return JOB_DIR / (job_id + ".json")


def _save_job(job: dict) -> None:
    JOB_DIR.mkdir(parents=True, exist_ok=True)
    path = _job_path(job["job_id"])
    tmp_name = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=JOB_DIR,
            suffix=".tmp", delete=False,
        ) as handle:
            tmp_name = handle.name
            json.dump(job, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    finally:
        if tmp_name:
            Path(tmp_name).unlink(missing_ok=True)


def _load_job(job_id: str) -> dict:
    path = _job_path(job_id)
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:
        raise HTTPException(404, "Batch translation job was not found.") from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(
            500, "Batch job checkpoint is corrupted or unavailable."
        ) from exc
    if data.get("job_id") != job_id:
        raise HTTPException(500, "Batch job checkpoint ID mismatch.")
    return data


def _public_job(job: dict) -> dict:
    done = job["next_offset"]
    skipped = job.get("skipped", [])
    recovered = job.get("recovered", {})
    pending = [item for item in skipped
               if str(item["offset"]) not in recovered]
    verified = max(0, done - len(skipped) + len(recovered))
    total = len(job["candidates"])
    state = job["status"]
    if state == "processing" and job["job_id"] not in _ACTIVE_JOBS:
        state = "interrupted"
    return {
        "job_id": job["job_id"],
        "status": state,
        "hmi_name": job["request"]["hmi_name"],
        "view_path_root": job["request"].get("view_path_root"),
        "model": job["model"],
        "batch_size": job["batch_size"],
        "total_unique": total,
        "completed_unique": verified,
        "processed_unique": done,
        "skipped_unique": len(pending),
        "skipped_total": len(skipped),
        "recovered_unique": len(recovered),
        "skipped_examples": pending[-5:],
        "completed_rows": job.get("completed_rows", 0),
        "batch_index": (done // job["batch_size"]) + 1
        if done < total else (total + job["batch_size"] - 1) // job["batch_size"],
        "total_batches": (total + job["batch_size"] - 1) // job["batch_size"],
        "last_verified_batch": job.get("last_verified_batch"),
        "last_batch": job.get("last_batch"),
        "error": job.get("error"),
        "started_at": job["started_at"],
        "updated_at": job["updated_at"],
        "note": (
            "A batch may have reached TIA before interruption. "
            "Do not retry until its import state has been checked."
            if state == "interrupted" else ""
        ),
    }


def _matching_source_rows(request: TranslateHmiTextsRequest) -> list[dict]:
    path = review._project_export(
        request.process_id, request.source_culture, request.target_culture
    )
    try:
        workbook = load_workbook(path, data_only=True, read_only=False)
        try:
            return list(review._matching_rows(workbook, request))
        finally:
            workbook.close()
    finally:
        path.unlink(missing_ok=True)


@router.post("/hmis/batch-translations/start")
def start_hmi_batch_job(request: StartBatchJobRequest):
    if request.source_culture.casefold() == request.target_culture.casefold():
        raise HTTPException(400, "Source and target cultures must differ.")
    if not request.view_path_root:
        raise HTTPException(
            422, "Choose the verified exported HMI ViewPath root before starting batch import."
        )
    model = (
        "source-copy" if request.translation_strategy == "copy"
        else resolve_ollama_model(request.ollama_model)
    )
    rows = _matching_source_rows(request)
    all_unique = list(dict.fromkeys(
        row["source"] for row in rows
        if needs_target_fill(row["source"], row["current_target"])
    ))
    if not all_unique:
        raise HTTPException(
            422,
            "No empty/placeholder target texts in this HMI; "
            "already populated translations will not be overwritten.",
        )

    limit = request.total_to_translate
    selected = all_unique[:limit] if limit else all_unique
    now = time.time()
    job = {
        "job_id": uuid4().hex,
        "request": request.model_dump(exclude={
            "batch_size", "total_to_translate", "max_rows", "progress_id",
        }),
        "model": model,
        "batch_size": request.batch_size,
        "candidates": selected,
        "next_offset": 0,
        "completed_rows": 0,
        "skipped": [],
        "recovered": {},
        "status": "ready",
        "error": None,
        "last_verified_batch": None,
        "started_at": now,
        "updated_at": now,
    }
    _save_job(job)
    return _public_job(job)


@router.get("/hmis/batch-translations/{job_id}")
def get_hmi_batch_job(job_id: str):
    with _JOB_LOCK:
        return _public_job(_load_job(job_id))




def _skipped_entry(job: dict, offset: int) -> dict:
    """Use the complete original candidate, not the 160-char log excerpt."""
    skipped = next(
        (item for item in job.get("skipped", [])
         if item.get("offset") == offset),
        None,
    )
    if skipped is None or offset < 0 or offset >= job["next_offset"]:
        raise HTTPException(404, "This offset was not skipped in this job.")
    recovered = job.get("recovered", {}).get(str(offset))
    return {
        "offset": offset,
        "source": job["candidates"][offset],
        "reason": skipped["reason"],
        "resolved": recovered is not None,
        "verified_rows": recovered.get("verified_rows", 0) if recovered else 0,
    }


@router.get("/hmis/batch-translations/{job_id}/skipped")
def list_skipped_hmi_translations(job_id: str):
    with _JOB_LOCK:
        job = _load_job(job_id)
        return {
            "job_id": job_id,
            "status": _public_job(job)["status"],
            "model": job["model"],
            "items": [
                _skipped_entry(job, item["offset"])
                for item in job.get("skipped", [])
            ],
        }


def _check_skipped_recovery_allowed(job: dict, offset: int) -> dict:
    if _ACTIVE_JOBS or job["status"] != "completed":
        raise HTTPException(
            409, "Finish the original batch job and confirm its TIA state "
            "before recovering skipped translations."
        )
    item = _skipped_entry(job, offset)
    if item["resolved"]:
        raise HTTPException(409, "This skipped text was already verified in TIA.")
    return item


@router.post("/hmis/batch-translations/{job_id}/skipped/{offset}/prepare")
def prepare_skipped_hmi_translation(
    job_id: str, offset: int, request: PrepareSkippedRequest,
):
    with _JOB_LOCK:
        job = _load_job(job_id)
        item = _check_skipped_recovery_allowed(job, offset)

    requested = TranslateHmiTextsRequest(**job["request"])
    source = item["source"]
    # Always fresh export; never trust a stale checkpoint as a TIA target state.
    matching = [
        row for row in _matching_source_rows(requested)
        if row["source"] == source
        and needs_target_fill(row["source"], row["current_target"])
    ]
    if not matching:
        raise HTTPException(
            409, "The target is no longer missing or its source changed. "
            "Check TIA and create a new job if necessary."
        )

    if request.mode == "manual":
        if request.proposal is None:
            raise HTTPException(422, "Enter a proposed translation first.")
        model = "manual-reviewed"
        proposal = request.proposal
    else:
        # Explicit model selection is allowed for a NEW single-text retry;
        # original batch model and checkpoint are never modified.
        model = resolve_ollama_model(request.ollama_model or job["model"])
        proposals = review._translate_texts(
            [source], requested.target_culture, model
        )
        proposal = proposals.get(source)

    proposal = normalize_hmi_translation(source, proposal)
    validate_hmi_translation(source, proposal)
    for row in matching:
        row["proposal"] = proposal

    token = uuid4().hex
    review._prune_expired_reviews()
    review._REVIEWS[token] = {
        "created": time.monotonic(),
        "request": requested.model_dump(),
        "model": model,
        "rows": matching,
        "skip_origin": {"job_id": job_id, "offset": offset},
    }
    return {
        "job_id": job_id,
        "offset": offset,
        "review_id": token,
        "source": source,
        "proposal": proposal,
        "model": model,
        "rows": len(matching),
        "note": "Review the proposal. TIA has NOT been modified.",
    }


@router.post("/hmis/batch-translations/{job_id}/skipped/{offset}/import")
def import_skipped_hmi_translation(
    job_id: str, offset: int, request: review.ImportReviewRequest,
):
    with _JOB_LOCK:
        job = _load_job(job_id)
        _check_skipped_recovery_allowed(job, offset)
        review._prune_expired_reviews()
        prepared = review._REVIEWS.get(request.review_id)
        if prepared is None or prepared.get("skip_origin") != {
            "job_id": job_id, "offset": offset,
        }:
            raise HTTPException(
                409, "This review does not belong to the selected skipped text. "
                "Prepare it again."
            )
        _ACTIVE_JOBS.add(job_id)

    try:
        # The existing reviewed-import path validates each source and target,
        # imports ONLY selected-HMI rows, then checks a fresh TIA XLSX export.
        verified = review.import_reviewed_hmi_translations(request)
        with _JOB_LOCK:
            current = _load_job(job_id)
            _skipped_entry(current, offset)
            current.setdefault("recovered", {})[str(offset)] = {
                "verified_rows": verified.verified_rows,
                "timestamp": time.time(),
                "mode": prepared["model"],
            }
            current["completed_rows"] += verified.verified_rows
            current["updated_at"] = time.time()
            _save_job(current)
            result = _public_job(current)
        return {
            "status": "verified",
            "verified_rows": verified.verified_rows,
            "import_state": verified.import_state,
            "import_log": verified.import_log,
            "job": result,
        }
    finally:
        with _JOB_LOCK:
            _ACTIVE_JOBS.discard(job_id)


@router.post("/hmis/batch-translations/{job_id}/pause")
def pause_hmi_batch_job(job_id: str):
    with _JOB_LOCK:
        job = _load_job(job_id)
        job["pause_requested"] = True
        if job["status"] == "ready":
            job["status"] = "paused"
        job["updated_at"] = time.time()
        _save_job(job)
        return _public_job(job)


@router.post("/hmis/batch-translations/{job_id}/next")
def run_next_hmi_batch(job_id: str, action: BatchJobAction):
    with _JOB_LOCK:
        job = _load_job(job_id)
        if _ACTIVE_JOBS:
            raise HTTPException(409, "A TIA translation batch is already running.")
        if job["status"] in ("completed",):
            return _public_job(job)
        if job["status"] in ("error", "processing"):
            if not action.retry_failed_batch:
                raise HTTPException(
                    409,
                    "Previous batch failed or was interrupted; its TIA import "
                    "may be uncertain. Check actual TIA texts before using "
                    "retry_failed_batch.",
                )
        # Calling /next from an explicitly paused job means resume.
        # A pause requested DURING a running batch is handled at the
        # previous batch's commit boundary, never mid-import.
        job["pause_requested"] = False
        job["status"] = "processing"
        job["error"] = None
        job["updated_at"] = time.time()
        _save_job(job)
        _ACTIVE_JOBS.add(job_id)

    try:
        result = _perform_one_batch(job)
        with _JOB_LOCK:
            current = _load_job(job_id)
            if current["next_offset"] != job["next_offset"]:
                raise HTTPException(409, "Batch checkpoint changed unexpectedly.")
            current["next_offset"] = result["next_offset"]
            current["completed_rows"] += result["verified_rows"]
            current.setdefault("skipped", []).extend(result["skipped"])
            current["last_batch"] = {
                "batch_index": result["batch_index"],
                "verified_unique": result["verified_unique"],
                "verified_rows": result["verified_rows"],
                "skipped_unique": len(result["skipped"]),
            }
            if result["verified_unique"]:
                current["last_verified_batch"] = {
                    "batch_index": result["batch_index"],
                    "verified_unique": result["verified_unique"],
                    "verified_rows": result["verified_rows"],
                    "import_state": result["import_state"],
                    "import_log": result["import_log"],
                }
            current["status"] = (
                "completed" if current["next_offset"] >= len(current["candidates"])
                else "paused" if current.get("pause_requested") else "ready"
            )
            current["updated_at"] = time.time()
            _save_job(current)
            return _public_job(current)
    except Exception as exc:
        with _JOB_LOCK:
            current = _load_job(job_id)
            current["status"] = "error"
            current["error"] = (
                str(exc.detail) if isinstance(exc, HTTPException)
                else str(exc)
            )[:1000]
            current["updated_at"] = time.time()
            _save_job(current)
        # Preserve the error response for the GUI while retaining checkpoint.
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(502, "Batch failed: " + str(exc)[:600]) from exc
    finally:
        with _JOB_LOCK:
            _ACTIVE_JOBS.discard(job_id)


def _perform_one_batch(job: dict) -> dict:
    offset = job["next_offset"]
    selected = job["candidates"][offset:offset + job["batch_size"]]
    if not selected:
        raise HTTPException(409, "No more texts in this job.")
    requested = TranslateHmiTextsRequest(**job["request"])
    batch_index = offset // job["batch_size"] + 1

    review._record_progress(
        job["job_id"], "exporting_project_texts", offset,
        len(job["candidates"]),
    )
    rows = _matching_source_rows(requested)
    selected_set = set(selected)
    matching = [
        row for row in rows
        if row["source"] in selected_set
        and needs_target_fill(row["source"], row["current_target"])
    ]
    observed = {row["source"] for row in matching}
    if observed != selected_set:
        raise HTTPException(
            409, "HMI source texts changed since job started. Missing "
            + str(len(selected_set - observed))
            + " unique texts. Stop and create a fresh job.",
        )

    # Translate all rows sharing the same source string in this HMI, so
    # repeated HMI texts are covered by a single model request.
    def progress(done, _total):
        review._record_progress(
            job["job_id"], "translating", offset + done,
            len(job["candidates"]),
        )

    if requested.translation_strategy == "copy":
        # Polish texts in the exported en-US* source column should be copied
        # verbatim, not paraphrased by a language model.
        translations = {source: source for source in selected}
        progress(len(selected), len(selected))
    else:
        translations = review._translate_texts(
            selected, requested.target_culture, job["model"],
            progress=progress,
        )
    # Check every UNIQUE source before building the import workbook. Bad model
    # proposals are skipped, not copied, retried, or sent to TIA.
    valid_proposals = {}
    skipped = []
    for index, source in enumerate(selected):
        proposal = normalize_hmi_translation(source, translations.get(source))
        try:
            validate_hmi_translation(source, proposal)
        except HTTPException as exc:
            if exc.status_code != 502:
                raise
            skipped.append({
                "offset": offset + index,
                "source": source[:160],
                "reason": str(exc.detail).split(". Source:", 1)[0][:240],
            })
        else:
            valid_proposals[source] = proposal

    safe_rows = []
    for row in matching:
        if row["source"] in valid_proposals:
            row["proposal"] = valid_proposals[row["source"]]
            safe_rows.append(row)

    verified_rows = 0
    import_state = "skipped_no_import"
    import_log = None
    if safe_rows:
        review._record_progress(
            job["job_id"], "importing_to_tia", offset + len(selected),
            len(job["candidates"]),
        )
        token = uuid4().hex
        review._REVIEWS[token] = {
            "created": time.monotonic(),
            "request": requested.model_dump(),
            "model": job["model"],
            "rows": safe_rows,
        }
        # Existing verified import logic re-exports TIA text values, checks
        # siblings, imports only the selected HMI, then re-exports to verify.
        verified = review.import_reviewed_hmi_translations(
            review.ImportReviewRequest(review_id=token)
        )
        verified_rows = verified.verified_rows
        import_state = verified.import_state
        import_log = verified.import_log

    review._record_progress(
        job["job_id"], "verified" if safe_rows else "skipped",
        offset + len(selected), len(job["candidates"]),
    )
    return {
        "next_offset": offset + len(selected),
        "verified_unique": len(valid_proposals),
        "verified_rows": verified_rows,
        "skipped": skipped,
        "import_state": import_state,
        "import_log": import_log,
        "batch_index": batch_index,
    }
