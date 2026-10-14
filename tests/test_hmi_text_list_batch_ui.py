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


def test_automatic_xlsx_and_xml_imports_are_separate_workflows():
    # Both automatic mechanisms live in the SAME Step 3 container,
    # and no standalone Step 4/5 panels exist.
    assert HTML.count('class="hmi-step-heading">Step ') == 3
    assert 'Step 1 — Scan the selected HMI' in HTML
    assert 'Step 2 — Batch settings (selected text types)' in HTML
    assert 'Step 3 — Prepare and review selected texts' in HTML
    assert 'Step 4 — ' not in HTML
    assert 'Step 5 — ' not in HTML
    assert 'class="hmi-automation-controls"' in HTML
    assert 'id="tia-hmi-xml-auto-section"' in HTML
    assert 'class="hmi-automatic-scope" data-hmi-scope="project"' in HTML
    assert 'id="tia-hmi-xml-auto-start"' in HTML
    assert 'id="tia-hmi-xml-auto-pause"' in HTML
    assert 'id="tia-hmi-batch-start"' in HTML

    xlsx_start = JS.split('async function startHmiBatchImport()', 1)[1]
    xlsx_start = xlsx_start.split('async function resumeHmiBatchImport()', 1)[0]
    assert 'START AUTOMATIC XLSX-ONLY TIA IMPORT?' in xlsx_start
    assert 'Text lists (XML) are EXCLUDED' in xlsx_start
    assert 'xlsxLimit' in xlsx_start
    assert '"/api/v1/tia/hmis/text-lists/import"' not in xlsx_start

    xml_start = JS.split('async function startAutomaticXmlBatches()', 1)[1]
    xml_start = xml_start.split('function pauseAutomaticXmlBatches()', 1)[0]
    assert 'START UNATTENDED XML TEXT LIST IMPORT?' in xml_start
    assert '"/api/v1/tia/hmis/text-lists/prepare"' in xml_start
    assert '"/api/v1/tia/hmis/text-lists/import"' in xml_start
    assert 'result.status !== "verified"' in xml_start
    assert 'const refreshed = await scanHmiTextLists()' in xml_start
    assert '"/api/v1/tia/hmis/batch-translations/start"' not in xml_start
    assert 'hmiXmlAutoPauseRequested' in xml_start


def test_project_and_xml_scan_details_are_one_level_inside_step_one():
    start = HTML.index('Step 1 — Scan the selected HMI')
    end = HTML.index('Step 2 — Batch settings (selected text types)')
    section = HTML[start:end]
    xml = section.index('id="tia-hmi-text-lists-details"')
    project = section.index('id="tia-hmi-project-texts-details"')
    assert xml < project
    assert 'id="tia-hmi-dedicated-project-texts"' in section
    assert 'id="tia-hmi-preview-results"' in section
    assert 'id="tia-hmi-text-lists-catalog"' in section
    assert 'data-hmi-scope="text_lists"' in section
    assert 'data-hmi-scope="project"' in section
    assert 'setHmiScanDetailLabel(' in JS
    assert '"Project texts"' in JS
    assert '"Text lists"' in JS


def test_auto_actions_and_both_manual_reviews_reside_in_step_three():
    start = HTML.index('Step 3 — Prepare and review selected texts')
    end = HTML.index('data-tab-panel="devices"')
    section = HTML[start:end]
    for key in (
        'tia-hmi-translate-button',
        'tia-hmi-import-reviewed-button',
        'tia-hmi-text-list-review-rows',
        'tia-hmi-review-rows',
        'tia-hmi-xml-auto-start',
        'tia-hmi-xml-auto-pause',
        'tia-hmi-batch-start',
        'tia-hmi-batch-resume',
        'tia-hmi-batch-pause',
    ):
        assert section.count('id="' + key + '"') == 1
    assert 'hmi-batch-panel hmi-workflow-step' not in section
    assert 'hmiScopeEnabled(element.dataset.hmiScope)' in JS
    assert 'hmiAutomationControls?.classList.toggle("hidden", !scope)' in JS
