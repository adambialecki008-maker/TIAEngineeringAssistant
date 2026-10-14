"""One batch UI for HMI XLSX and XML, with separate safe import endpoints."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "gui" / "index.html").read_text(encoding="utf-8")
JS = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")


def test_one_batch_form_for_checked_scopes():
    assert HTML.count('id="tia-hmi-batch-size"') == 1
    assert HTML.count('id="tia-hmi-total-to-translate"') == 1
    assert HTML.count('id="tia-hmi-translate-button"') == 1
    assert HTML.count('id="tia-hmi-import-reviewed-button"') == 1
    assert 'Step 2 — Batch settings (selected text types)' in HTML
    assert 'Step 3 — Prepare and review selected texts' in HTML
    assert 'Step 2 — Text lists' not in HTML
    assert 'Step 3 — Text lists' not in HTML
    for removed in (
        "tia-hmi-text-list-batch-size", "tia-hmi-text-list-total",
        "tia-hmi-text-list-prepare", "tia-hmi-text-list-import",
    ):
        assert f'id="{removed}"' not in HTML


def test_xml_checkbox_controls_expanding_catalogue_with_list_details():
    assert 'id="tia-hmi-scope-lists"' in HTML
    assert 'id="tia-hmi-text-lists-details"' in HTML
    assert 'data-hmi-scope="text_lists"' in HTML
    assert '!hmiScopeEnabled(element.dataset.hmiScope)' in JS
    assert 'detail.className = "hmi-text-list-catalog-item";' in JS
    assert 'entry.source_text || entry.preview_source' in JS
    assert 'entry.target_text || entry.preview_target' in JS
    assert 'type="hidden" id="tia-hmi-text-list-select"' in HTML


def test_common_actions_route_manual_import_to_correct_format():
    for pattern in (
        'async function prepareSelectedHmiBatch()',
        'async function importSelectedHmiBatch()',
        'nextHmiManualScope()',
        'await prepareHmiTextList();',
        'await translateSelectedHmi();',
        'await importReviewedHmiTextList();',
        'await importReviewedHmiTexts();',
        '"/api/v1/tia/hmis/text-lists/prepare"',
        '"/api/v1/tia/hmis/text-lists/import"',
        '"/api/v1/tia/hmis/import-reviewed-translations"',
        'if (!selected.length || !confirm(',
    ):
        assert pattern in JS


def test_combined_count_and_shared_total_across_formats():
    assert 'function combinedMissingCount()' in JS
    assert 'return project + eligibleXmlEntries();' in JS
    assert 'hmiBatchTotalInput.value = String(count);' in JS
    assert 'const count = manualHmiPrepareCount();' in JS
    assert 'max_rows: maxRows' in JS
    assert 'hmiCombinedApprovedCount += result.verified_entries;' in JS


def test_auto_import_is_xlsx_only_and_xml_requires_manual_confirmation():
    assert 'Step 4 — Automatic Project texts (XLSX) import' in HTML
    assert 'START AUTOMATIC XLSX-ONLY TIA IMPORT?' in JS
    assert 'Text lists (XML) are EXCLUDED' in JS
    start = JS.split('async function startHmiBatchImport()', 1)[1]
    start = start.split('async function resumeHmiBatchImport()', 1)[0]
    assert 'xlsxLimit' in start
    assert '"/api/v1/tia/hmis/text-lists/import"' not in start
