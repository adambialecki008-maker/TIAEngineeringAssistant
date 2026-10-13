"""Regression checks for HMI GUI Ollama-only translation requests."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_hmi_gui_has_no_text_handling_dropdown():
    html = (ROOT / "gui" / "index.html").read_text(encoding="utf-8")
    assert "Text handling" not in html
    assert "tia-hmi-text-handling" not in html
    assert 'id="tia-hmi-ollama-model"' in html


def test_hmi_gui_sends_explicit_ollama_strategy_for_both_workflows():
    script = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")
    selection = script.split("function hmiTranslationSelection()", 1)[1]
    selection = selection.split("function hmiTranslationKey(", 1)[0]
    assert 'translation_strategy: "ollama"' in selection
    assert "ollama_model: hmiOllamaModelSelect?.value || null" in selection
    assert '"/api/v1/tia/hmis/prepare-translations"' in script
    assert '"/api/v1/tia/hmis/batch-translations/start"' in script
    assert script.count("...selection") >= 2


def test_hmi_scope_changes_recalculate_action_buttons():
    script = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")
    for field_id in ("hmiBatchSizeInput", "hmiBatchTotalInput"):
        listener = script.split(
            f'{field_id}?.addEventListener("input", () => {{', 1
        )[1].split("});", 1)[0]
        assert "updateHmiTranslateButtonState();" in listener
    assert "!missingUnique || !validBatchSize || !validTotal" in script


def test_ollama_model_change_keeps_scan_but_discards_prepared_review():
    script = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")
    scan_key = script.split("function hmiScanKey(", 1)[1]
    scan_key = scan_key.split("function hmiTranslationKey(", 1)[0]
    assert "ollama_model" not in scan_key
    for field in (
        "process_id", "device_name", "hmi_name", "view_path_root",
        "source_culture", "target_culture",
    ):
        assert f"selection.{field}" in scan_key

    model_handler = script.split(
        'hmiOllamaModelSelect.addEventListener(', 1
    )[1].split('if (hmiRefreshOllamaModels)', 1)[0]
    assert "discardHmiReview()" in model_handler
    assert "invalidateHmiPreview()" not in model_handler

    refresh_handler = script.split(
        "if (hmiOllamaModelSelect.value !== previous)", 1
    )[1].split("} else {", 1)[0]
    assert "discardHmiReview()" in refresh_handler
    assert "invalidateHmiPreview()" not in refresh_handler


def test_scan_approval_is_model_independent_but_review_is_not():
    script = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")
    assert "verifiedHmiPreviewKey" not in script
    assert "const isVerified = Boolean(scanKey && scanKey === verifiedHmiScanKey)" in script
    assert "verifiedHmiScanKey = hmiScanKey(confirmed)" in script
    assert "const previewKey = hmiScanKey(selection)" in script
    assert "scanKey !== verifiedHmiScanKey" in script
    assert "review.selectionKey !== key" in script
    assert "preparedHmiReview.selectionKey !== reviewKey" in script
    assert "hmiScanKey(selectionBeforeImport) !== verifiedHmiScanKey" in script


def test_saved_job_rejects_resume_with_changed_model():
    script = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")
    resume = script.split("async function resumeHmiBatchImport()", 1)[1]
    resume = resume.split("async function pauseHmiBatchImport()", 1)[0]
    assert "job.model !== selectedModel" in resume
    assert "Model changes never alter a saved job" in resume
