"""Contract for consolidated HMI XLSX and XML batch stages.

XML preparation can be bounded, but XML import remains manually reviewed
and is never routed through the automatic XLSX batch importer.
"""
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "gui" / "index.html").read_text(encoding="utf-8")
JS = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")


def test_one_scan_stage_and_both_types_have_step_two_batch_settings():
    assert HTML.count('id="tia-hmi-scan-button"') == 1
    assert 'Step 2 — Project texts (XLSX) · Batch settings' in HTML
    assert 'Step 2 — Text lists (XML) · Batch settings' in HTML
    assert 'Step 3 — Text lists (XML) · Prepare, review' in HTML
    assert 'data-hmi-scope="text_lists"' in HTML
    assert 'data-hmi-scope="project"' in HTML
    assert 'The scanned missing-target count excludes all Text lists' in HTML


def test_text_list_controls_are_in_batch_not_standalone_preview():
    for control in ("tia-hmi-text-list-select",
                    "tia-hmi-text-list-batch-size",
                    "tia-hmi-text-list-total", "tia-hmi-text-list-batch-plan",
                    "tia-hmi-text-list-prepare", "tia-hmi-text-list-import"):
        assert HTML.count(f'id="{control}"') == 1
    assert '<details id="tia-hmi-text-list-preview"' in HTML
    assert 'id="tia-hmi-text-lists-details"' in HTML
    assert 'Text lists: select one list, then Prepare' not in HTML


def test_xml_batches_are_limited_and_still_require_manual_review():
    assert "function textListBatchCount()" in JS
    assert "return Math.min(size, left, 50);" in JS
    assert "max_rows: maxRows" in JS
    assert '"/api/v1/tia/hmis/text-lists/prepare"' in JS
    assert '"/api/v1/tia/hmis/text-lists/import"' in JS
    assert "const selected = [...(hmiTextListReviewRows" in JS
    assert 'if (!selected.length || !confirm(' in JS
    assert "hmiTextListImportedCount += result.verified_entries;" in JS
    assert "const refreshed = await scanHmiTextLists();" in JS
    assert '"/api/v1/tia/hmis/batch-translations/start"' in JS


def test_scanned_counts_explicitly_exclude_other_scope():
    assert '"Project texts (XLSX only, excludes Text lists): "' in JS
    assert '"Text lists (XML only): "' in JS
    assert '"Project texts ONLY: excludes Text lists and Graphic lists. "' in JS
    assert "readable entries with missing targets" in JS


def test_unreadable_xml_is_diagnosed_and_not_enabled_as_normal_batch():
    assert 'entry.reason || "unsupported XML"' in JS
    assert "const hasEligibleRows =" in JS
    assert "&& hasEligibleRows && !hmiBatchRunning" in JS
