"""Regressions for manual Project Text edits and automatic XML orchestration."""
import time
from uuid import uuid4
from pathlib import Path

from fastapi import HTTPException
from fastapi.testclient import TestClient

from engine.main import app
from engine.tia import hmi_review


ROOT = Path(__file__).resolve().parents[1]
client = TestClient(app)


def _pending_review():
    token = uuid4().hex
    prepared = {
        "created": time.monotonic(),
        "request": {
            "process_id": 1,
            "device_name": "Panel",
            "hmi_name": "HMI_1",
            "source_culture": "pl-PL",
            "target_culture": "en-US",
        },
        "rows": [{
            "source": "Start",
            "proposal": "Start",
            "key": ("Sheet1", "HMI_1/Screen1", "123"),
            "sheet": "Sheet1",
            "current_target": "",
        }],
        "skipped_rows": {},
        "skipped": [],
    }
    hmi_review._REVIEWS[token] = prepared
    return token, prepared


def test_manual_project_text_validation_refuses_unsafe_change_without_write(
    monkeypatch,
):
    token, pending = _pending_review()
    calls = []
    monkeypatch.setattr(
        hmi_review, "validate_hmi_translation_quality",
        lambda *args: (_ for _ in ()).throw(
            HTTPException(502, "Changed PLC identifier")
        ),
    )
    monkeypatch.setattr(
        hmi_review, "run_adapter",
        lambda *args: calls.append(args),
    )
    try:
        response = client.post(
            "/api/v1/tia/hmis/import-reviewed-translations",
            json={
                "review_id": token,
                "proposals": [
                    {"source_text": "Start", "proposal": "Changed PLC identifier"}
                ],
            },
        )
        assert response.status_code == 422, response.text
        assert "PROJECT_TEXT_REVIEW_EDIT_INVALID" in response.json()["detail"]
        assert token in hmi_review._REVIEWS
        assert pending["rows"][0]["proposal"] == "Start"
        assert calls == []
    finally:
        hmi_review._REVIEWS.pop(token, None)


def test_manual_project_texts_require_exact_source_set(monkeypatch):
    token, _ = _pending_review()
    calls = []
    monkeypatch.setattr(
        hmi_review, "run_adapter",
        lambda *args: calls.append(args),
    )
    try:
        for entries in ([], [
            {"source_text": "Other", "proposal": "Text"},
        ], [
            {"source_text": "Start", "proposal": "Start"},
            {"source_text": "Start", "proposal": "Start"},
        ]):
            result = client.post(
                "/api/v1/tia/hmis/import-reviewed-translations",
                json={"review_id": token, "proposals": entries},
            )
            assert result.status_code == 409, result.text
        assert token in hmi_review._REVIEWS
        assert calls == []
    finally:
        hmi_review._REVIEWS.pop(token, None)


def test_manual_project_review_is_optional_for_existing_batch_api():
    # Automatic XLSX job calls ImportReviewRequest(review_id=token)
    # and must remain backward compatible.
    request = hmi_review.ImportReviewRequest(review_id="a" * 32)
    assert request.proposals is None


def test_auto_xml_ui_is_separate_from_xlsx_auto_and_has_pause():
    html = (ROOT / "gui/index.html").read_text(encoding="utf-8")
    js = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    assert 'id="tia-hmi-xml-auto-section"' in html
    assert 'data-hmi-scope="text_lists"' in html
    assert 'id="tia-hmi-xml-auto-start"' in html
    assert 'id="tia-hmi-xml-auto-pause"' in html
    assert "startAutomaticXmlBatches()" in js
    assert "pauseAutomaticXmlBatches()" in js
    assert '"/api/v1/tia/hmis/text-lists/prepare"' in js
    assert '"/api/v1/tia/hmis/text-lists/import"' in js
    assert 'result.status !== "verified"' in js
    assert "const refreshed = await scanHmiTextLists()" in js
    assert "hmiXmlAutoPauseRequested" in js
    assert "500 batches" in js
    assert "No automatic retry or resume" in js


def test_project_text_review_editor_submits_validated_proposals():
    js = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    assert "hmi-project-review-editor" in js
    assert "textarea.hmi-project-review-editor[data-source-text]" in js
    assert "{ review_id: review.reviewId, proposals }" in js
    backend = (ROOT / "engine/tia/hmi_review.py").read_text(
        encoding="utf-8"
    )
    assert "Submitted Project texts must match every validated review row" in backend
    assert "validate_hmi_translation_quality(" in backend
