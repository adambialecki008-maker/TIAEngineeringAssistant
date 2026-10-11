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
from threading import Lock
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from openpyxl import load_workbook
from pydantic import BaseModel, Field

from engine.tia.adapter import PROJECT_ROOT
from engine.tia.models import TranslateHmiTextsRequest
from engine.tia.ollama_translation import resolve_ollama_model
from engine.tia import hmi_review as review

router = APIRouter()
JOB_DIR = PROJECT_ROOT / ".local" / "hmi_translation_jobs"
_JOB_LOCK = Lock()
_ACTIVE_JOBS: set[str] = set()


class StartBatchJobRequest(TranslateHmiTextsRequest):
    # One Ollama-to-TIA import transaction per batch, not the internal
    # Ollama JSON requests (whose size is OLLAMA_TRANSLATION_BATCH_SIZE).
    batch_size: int = Field(default=15, ge=1, le=200)
    total_to_translate: int | None = Field(default=None, ge=1, le=100000)


class BatchJobAction(BaseModel):
    retry_failed_batch: bool = False


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
        "completed_unique": done,
        "completed_rows": job.get("completed_rows", 0),
        "batch_index": (done // job["batch_size"]) + 1
        if done < total else (total + job["batch_size"] - 1) // job["batch_size"],
        "total_batches": (total + job["batch_size"] - 1) // job["batch_size"],
        "last_verified_batch": job.get("last_verified_batch"),
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
    model = resolve_ollama_model(request.ollama_model)
    rows = _matching_source_rows(request)
    all_unique = list(dict.fromkeys(
        row["source"] for row in rows
        if any(ch.isalpha() for ch in row["source"])
    ))
    if not all_unique:
        raise HTTPException(422, "No translatable texts found for this HMI.")

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
        if job["status"] == "paused":
            job["pause_requested"] = False
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
    matching = [row for row in rows if row["source"] in selected_set]
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

    translations = review._translate_texts(
        selected, requested.target_culture, job["model"],
        progress=progress,
    )
    for row in matching:
        proposed = translations.get(row["source"])
        if not isinstance(proposed, str) or not proposed.strip():
            raise HTTPException(502, "Ollama returned missing/empty translation.")
        if proposed.strip().casefold() == "text" and row["source"].strip().casefold() != "text":
            raise HTTPException(
                502, "Ollama returned placeholder Text for " + row["source"][:80]
            )
        row["proposal"] = proposed

    review._record_progress(
        job["job_id"], "importing_to_tia", offset + len(selected),
        len(job["candidates"]),
    )
    token = uuid4().hex
    review._REVIEWS[token] = {
        "created": time.monotonic(),
        "request": requested.model_dump(),
        "model": job["model"],
        "rows": matching,
    }
    # Existing verified import logic checks source/current values against a
    # fresh export, retains all sibling rows of the selected HMI, imports
    # only that HMI, and verifies actual targets via another TIA export.
    verified = review.import_reviewed_hmi_translations(
        review.ImportReviewRequest(review_id=token)
    )
    review._record_progress(
        job["job_id"], "verified", offset + len(selected),
        len(job["candidates"]),
    )
    return {
        "next_offset": offset + len(selected),
        "verified_unique": len(selected),
        "verified_rows": verified.verified_rows,
        "import_state": verified.import_state,
        "import_log": verified.import_log,
        "batch_index": batch_index,
    }
