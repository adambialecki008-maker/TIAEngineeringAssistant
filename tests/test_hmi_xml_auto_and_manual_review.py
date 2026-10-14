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


def test_manual_project_edit_is_applied_to_validated_review_before_import(
    monkeypatch,
):
    token, pending = _pending_review()

    class WriteReached(Exception):
        pass

    adapter_calls = []
    monkeypatch.setattr(
        hmi_review, "validate_hmi_translation_quality",
        lambda *args: None,
    )
    monkeypatch.setattr(
        hmi_review, "normalize_hmi_translation",
        lambda source, proposal: proposal,
    )

    def fake_adapter(*args):
        adapter_calls.append(args)
        raise WriteReached()

    monkeypatch.setattr(hmi_review, "run_adapter", fake_adapter)
    try:
        # Deliberately halt at the FIRST possible adapter call, without TIA.
        import pytest
        with pytest.raises(WriteReached):
            hmi_review._import_reviewed_hmi_translations(
                hmi_review.ImportReviewRequest(
                    review_id=token,
                    proposals=[hmi_review.ReviewedTextProposal(
                        source_text="Start",
                        proposal="Manual user text",
                    )],
                )
            )
        assert pending["rows"][0]["proposal"] == "Manual user text"
        assert adapter_calls[0][0] == "add-project-language"
    finally:
        hmi_review._REVIEWS.pop(token, None)


def test_manual_project_review_is_optional_for_existing_batch_api():
    # Automatic XLSX job calls ImportReviewRequest(review_id=token)
    # and must remain backward compatible.
    request = hmi_review.ImportReviewRequest(review_id="a" * 32)
    assert request.proposals is None


def test_auto_xml_pipeline_is_routed_by_translate_all_with_safe_pause():
    html = (ROOT / "gui/index.html").read_text(encoding="utf-8")
    js = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    # One shared entry point replaces the old separate XML/XLSX start buttons.
    assert 'id="tia-hmi-batch-start"' in html
    assert '>Translate all</button>' in html
    assert 'id="tia-hmi-batch-pause"' in html
    assert 'id="tia-hmi-xml-auto-section"' in html
    assert 'data-hmi-scope="text_lists"' in html
    assert 'id="tia-hmi-xml-auto-start"' not in html
    assert 'id="tia-hmi-xml-auto-pause"' not in html
    assert "async function translateAllSelectedHmi()" in js
    assert "async function startAutomaticXmlBatches({confirmed = false} = {})" in js
    assert "function pauseAutomaticXmlBatches()" in js
    orchestrator = js.split("async function translateAllSelectedHmi()", 1)[1].split(
        "function pauseUnifiedHmiTranslation()", 1
    )[0]
    assert orchestrator.index("await startHmiBatchImport(") < orchestrator.index(
        "await startAutomaticXmlBatches({confirmed: true})"
    )
    assert 'job.status !== "completed"' in orchestrator
    assert "const useXml = hmiScopeEnabled(\"text_lists\");" in orchestrator
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


def test_reviewed_xml_distinguishes_verified_import_from_followup_scan_failure():
    """TIA's verified import must not be reported as an uncertain TIA write."""
    js = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    xml_import = js.split("async function importReviewedHmiTextList()", 1)[1]
    xml_import = xml_import.split("function pauseAutomaticXmlBatches()", 1)[0]
    assert 'result.status !== "verified"' in xml_import
    assert 'state: "verified_refresh_failed"' in xml_import
    assert 'state: safePreflight ? "prewrite_rejected" : "uncertain"' in xml_import
    assert 'TextList changed since preparation. Nothing imported.' in xml_import
    queue = js.split("async function approveReviewedHmiQueueBatch()", 1)[1]
    queue = queue.split("async function skipReviewedHmiQueueBatch()", 1)[0]
    assert 'completed?.state === "verified_refresh_failed"' in queue
    assert 'completed?.state === "prewrite_rejected"' in queue
    assert 'hmiReviewQueueBlockedLists.add(reviewListName)' in queue
    assert 'const refreshed = await scanHmiTextLists()' in queue
    assert 'completed?.detail' in queue
    assert 'appendHmiRunIssue("XML", reviewListName' in queue


def test_xml_backend_preserves_prewrite_safety_and_reexport_verification():
    source = (ROOT / "engine/tia/hmi_text_list_translation.py").read_text(
        encoding="utf-8"
    )
    reviewed = source.split("def _perform_reviewed_import(", 1)[1]
    assert 'if _text_list_fingerprint(xml, selection.text_list_name)' in reviewed
    assert 'TextList changed since preparation. Nothing imported.' in reviewed
    assert 'if _REVIEWS.pop(request.review_id, None) is not prepared:' in reviewed
    assert 'lines = run_adapter(' in reviewed
    assert 'current_xml = _export_one(selection)' in reviewed
    assert '"status": "verified"' in reviewed
    assert reviewed.index('if _text_list_fingerprint(') < reviewed.index(
        'lines = run_adapter(')
    assert reviewed.index('lines = run_adapter(') < reviewed.index(
        'current_xml = _export_one(selection)')


def test_reviewed_xml_prepare_never_reselects_list_or_invalidates_review_identity():
    js = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    start = js.split("async function prepareHmiTextList()", 1)[1]
    prepare = start.split("async function importReviewedHmiTextList()", 1)[0]
    assert "hmiTextListSelect.value = nextEligibleTextList()" not in prepare
    assert "const identity = textListReviewKey();" in prepare
    assert "if (identity !== textListReviewKey()) {" in prepare
    assert "The review was discarded without any TIA import." in prepare
    assert "return false;" in prepare
    assert "hmiTextListPreparedKey = identity;" in prepare
    review_import = js.split("async function importReviewedHmiTextList()", 1)[1]
    assert "hmiTextListPreparedKey !== textListReviewKey()" in review_import
    assert '"/api/v1/tia/hmis/text-lists/import"' in review_import
    assert 'result.status !== "verified"' in review_import
