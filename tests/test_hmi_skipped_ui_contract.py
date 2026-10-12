"""Static contract: skipped labels are reviewed individually in the HMI GUI."""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_skipped_manager_is_integrated_beneath_batch_status():
    html = (ROOT / "gui/index.html").read_text(encoding="utf-8")
    code = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    module = (ROOT / "gui/js/hmi_skipped_manager.js").read_text(
        encoding="utf-8"
    )
    assert 'id="tia-hmi-skipped-open"' in html
    assert 'id="tia-hmi-skipped-list"' in html
    assert html.index('id="tia-hmi-batch-status"') < html.index(
        'id="tia-hmi-skipped-panel"'
    )
    assert 'from "./hmi_skipped_manager.js"' in code
    assert "hmiSkippedManager.updateJob(job)" in code
    assert "hmiSkippedManager.reset()" in code
    assert '"/skipped/" + item.offset + "/prepare"' in module
    assert '"/skipped/" + item.offset + "/import"' in module
    assert '"/skipped"' in module
    assert 'editor.value !== prepared.proposal' in module
    assert 'approve.addEventListener("click", async () =>' in module
    assert 'if (!confirm("IMPORT APPROVED HMI TRANSLATION?' in module
    assert 'rejected.textContent = item.rejected_proposal' in module


def test_skipped_manager_never_inserts_untrusted_source_as_html():
    module = (ROOT / "gui/js/hmi_skipped_manager.js").read_text(
        encoding="utf-8"
    )
    assert "innerHTML" not in module
    assert "source.textContent = item.source" in module
    assert "reason.textContent = item.reason" in module
    assert "editor.value = item.source" in module
    assert 'mode === "manual"' in module
    assert 'mode, ollama_model: getModel() || null' in module
