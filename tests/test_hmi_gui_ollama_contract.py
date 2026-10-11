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
