"""Regression contract for independent HMI Project texts / Text lists UI scopes.

The browser UI keeps existing separate Project XLSX and Classic TextList XML
pipelines; these checks prevent accidentally combining their import or review pipelines.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "gui" / "index.html").read_text(encoding="utf-8")
JS = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")


def _function(name, until):
    return JS.split(name, 1)[1].split(until, 1)[0]


def test_checkbox_scope_supports_zero_one_or_both():
    assert 'id="tia-hmi-scope-project" checked' in HTML
    assert 'id="tia-hmi-scope-lists"' in HTML
    assert 'id="tia-hmi-scope-lists" checked' not in HTML
    assert 'hmiScopeProject?.addEventListener(' in JS
    assert 'hmiScopeLists?.addEventListener(' in JS
    assert 'if (changed.checked && other) other.checked = false;' not in JS
    assert 'return "both";' in JS
    assert 'if (scanProject) projectOk = await scanProjectHmiTexts();' in JS
    assert 'if (scanLists) listsOk = await scanHmiTextLists();' in JS
    assert 'hmiScanButton.disabled = busy || !scope || !selection;' in JS


def test_each_scan_uses_only_its_dedicated_endpoint():
    xml = _function('async function scanHmiTextLists()', 
                    'async function previewSelectedHmi()')
    xlsx = _function('async function scanProjectHmiTexts()',
                     'function populateHmiTranslationLanguages()')
    assert '"/api/v1/tia/hmis/inspect-text-lists"' in xml
    assert '"/api/v1/tia/hmis/preview-texts"' not in xml
    assert '"/api/v1/tia/hmis/preview-texts"' in xlsx
    assert '"/api/v1/tia/hmis/inspect-text-lists"' not in xlsx
    assert 'if (!hmiScopeEnabled("project")) return false;' in xlsx
    assert 'verifiedHmiTextListsScanKey = scanKey;' in xml
    assert 'verifiedHmiScanKey = hmiScanKey(confirmed);' in xlsx


def test_only_selected_scope_shows_related_translation_sections():
    for marker in (
        'id="tia-hmi-text-lists-details"',
        'data-hmi-scope="text_lists"',
        'class="hmi-workflow-step hmi-scope-step" data-hmi-scope="project"',
        'class="hmi-workflow-step hmi-manual-step" data-hmi-scope="project"',
        'class="hmi-batch-panel hmi-workflow-step" data-hmi-scope="project"',
        'id="tia-hmi-preview-results" class="hidden" data-hmi-scope="project"',
        'id="tia-hmi-review-results" class="hidden" data-hmi-scope="project"',
    ):
        assert marker in HTML
    assert '!hmiScopeEnabled(element.dataset.hmiScope)' in JS
    assert 'hmiScopeEnabled("text_lists")' in JS
    assert '!hmiScopeEnabled("project")' in JS
    assert 'hmiTextListPrepare.disabled = busy || !listsSelected' in JS
    assert 'hmiBatchResumeButton.disabled = busy || !projectSelected' in JS


def test_text_list_preview_and_import_are_separate_from_project_workflow():
    assert 'id="tia-hmi-text-list-preview-rows"' in HTML
    assert 'id="tia-hmi-text-list-review-rows"' in HTML
    assert 'async function renderSelectedTextListPreview()' not in JS
    assert 'function renderSelectedTextListPreview()' in JS
    assert '"/api/v1/tia/hmis/text-lists/prepare"' in JS
    assert '"/api/v1/tia/hmis/text-lists/import"' in JS
    assert '"/api/v1/tia/hmis/import-reviewed-translations"' in JS
    assert 'id="tia-hmi-preview-filter"' in HTML
    assert '<option value="text_lists">' not in HTML
