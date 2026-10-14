"""One batch UI for HMI XLSX and XML, with separate safe import endpoints."""
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "gui" / "index.html").read_text(encoding="utf-8")
JS = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")


def test_one_batch_form_for_checked_scopes():
    assert HTML.count('id="tia-hmi-batch-size"') == 1
    assert HTML.count('id="tia-hmi-total-to-translate"') == 1
    assert HTML.count('id="tia-hmi-translation-queue"') == 1
    assert 'Combined translation queue <span class="hmi-queue-subtitle">' in HTML
    assert 'function renderHmiTranslationQueue()' in JS
    assert 'renderHmiTranslationQueue();' in JS
    queue = JS.split('function renderHmiTranslationQueue()', 1)[1]
    queue = queue.split('function renderHmiBatchPlan()', 1)[0]
    assert queue.index('if (hmiScopeEnabled("project"))') < queue.index(
        'if (hmiScopeEnabled("text_lists"))')
    assert 'for (const list of lists)' in queue
    assert 'list.eligible_missing_entries' in queue
    assert HTML.count('id="tia-hmi-translate-button"') == 1
    assert HTML.count('id="tia-hmi-import-reviewed-button"') == 1
    assert 'Step 2 — Batch settings (selected text types)' in HTML
    assert 'Step 3 — Translate, review &amp; import' in HTML
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
        'if (!selected.length) return "edit_invalid";',
        'if (!confirm(',
    ):
        assert pattern in JS


def test_combined_count_and_shared_total_across_formats():
    assert 'function combinedMissingCount()' in JS
    assert 'return project + eligibleXmlEntries();' in JS
    assert 'hmiBatchTotalInput.value = String(count);' in JS
    assert 'const count = manualHmiPrepareCount();' in JS
    assert 'max_rows: maxRows' in JS
    assert 'hmiCombinedApprovedCount += result.verified_entries;' in JS


def test_one_translate_all_action_orchestrates_both_verified_pipelines():
    # A single automatic Translate all control lives in Step 3.
    assert HTML.count('class="hmi-step-heading">Step ') == 3
    assert 'Step 4 — ' not in HTML
    assert 'Step 5 — ' not in HTML
    assert 'class="hmi-automation-controls"' in HTML
    assert HTML.count('id="tia-hmi-batch-start"') == 1
    assert '>Translate</button>' in HTML
    assert 'id="tia-hmi-unified-status"' in HTML
    assert 'id="tia-hmi-batch-progress"' in HTML
    assert 'id="tia-hmi-xml-auto-section"' in HTML
    assert 'class="hmi-automatic-scope hidden" data-hmi-scope="project"' in HTML
    # The old separate XML Start/Pause actions must never reappear.
    assert 'id="tia-hmi-xml-auto-start"' not in HTML
    assert 'id="tia-hmi-xml-auto-pause"' not in HTML
    assert 'hmiXmlAutoStart?.addEventListener(' not in JS
    assert 'hmiBatchStartButton?.addEventListener(' in JS
    assert 'void translateAllSelectedHmi();' in JS

    orchestrator = JS.split('async function translateAllSelectedHmi()', 1)[1]
    orchestrator = orchestrator.split('function pauseUnifiedHmiTranslation()', 1)[0]
    # Both checkboxes or just one work; project must precede XML.
    assert 'const useProject = hmiScopeEnabled("project");' in orchestrator
    assert 'const useXml = hmiScopeEnabled("text_lists");' in orchestrator
    assert orchestrator.index('await startHmiBatchImport(') < orchestrator.index(
        'await startAutomaticXmlBatches({confirmed: true})')
    assert 'if (!job || job.status !== "completed" || hmiUnifiedPauseRequested)' in orchestrator
    assert 'if (useXml && xmlCount > 0 && quotaLeft > 0)' in orchestrator
    assert 'if (useProject && !(await scanHmiTextLists()))' in orchestrator
    assert '{confirmed: true, forceAll: true}' in orchestrator
    assert 'await startAutomaticXmlBatches({confirmed: true})' in orchestrator
    assert 'hmiCombinedApprovedCount' in orchestrator

    xlsx = JS.split('async function startHmiBatchImport({confirmed', 1)[1]
    xlsx = xlsx.split('async function resumeHmiBatchImport()', 1)[0]
    xml = JS.split('async function startAutomaticXmlBatches({confirmed', 1)[1]
    xml = xml.split('function pauseAutomaticXmlBatches()', 1)[0]
    assert 'START AUTOMATIC XLSX-ONLY TIA IMPORT?' in xlsx
    assert '"/api/v1/tia/hmis/batch-translations/start"' in xlsx
    assert '"/api/v1/tia/hmis/text-lists/import"' not in xlsx
    assert 'hmiCombinedApprovedCount += Number(finished?.completed_unique) || 0;' in xlsx
    assert 'START UNATTENDED XML TEXT LIST IMPORT?' in xml
    assert '"/api/v1/tia/hmis/text-lists/prepare"' in xml
    assert '"/api/v1/tia/hmis/text-lists/import"' in xml
    assert 'result.status !== "verified"' in xml
    assert 'const refreshed = await scanHmiTextLists()' in xml
    assert '"/api/v1/tia/hmis/batch-translations/start"' not in xml
    assert 'hmiXmlAutoPauseRequested && !hmiUnifiedPauseRequested' in xml
    assert 'hmiCombinedApprovedCount += result.verified_entries;' in xml



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


def test_editor_in_step_two_and_unified_controls_in_step_three():
    second = HTML.split('Step 2 — Batch settings (selected text types)', 1)[1]
    second = second.split('Step 3 — Translate, review &amp; import', 1)[0]
    third = HTML.split('Step 3 — Translate, review &amp; import', 1)[1]
    third = third.split('data-tab-panel="devices"', 1)[0]
    for key in (
        'tia-hmi-text-list-review-rows', 'tia-hmi-review-rows',
        'tia-hmi-edit-details',
    ):
        assert second.count('id="' + key + '"') == 1
        assert 'id="' + key + '"' not in third
    for key in (
        'tia-hmi-translate-button', 'tia-hmi-import-reviewed-button',
        'tia-hmi-unified-status', 'tia-hmi-xml-auto-status',
        'tia-hmi-batch-start', 'tia-hmi-batch-resume',
        'tia-hmi-batch-pause', 'tia-hmi-review-each-batch',
        'tia-hmi-run-report',
    ):
        assert third.count('id="' + key + '"') == 1
    assert 'hmi-batch-panel hmi-workflow-step' not in third
    assert 'hmiScopeEnabled(element.dataset.hmiScope)' in JS
    assert 'hmiAutomationControls?.classList.toggle("hidden", !scope)' in JS


class _ContainerScanner(HTMLParser):
    """Record the CSS ancestry of UI controls in the actual HTML tree."""

    def __init__(self):
        super().__init__()
        self.stack = []
        self.parents_by_id = {}

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        classes = set((data.get("class") or "").split())
        is_void = tag in {
            "area", "base", "br", "col", "embed", "hr", "img",
            "input", "link", "meta", "param", "source", "track", "wbr",
        }
        if not is_void:
            self.stack.append((tag, classes))
        if data.get("id"):
            self.parents_by_id[data["id"]] = classes.union(
                *(entry[1] for entry in self.stack)
            )

    def handle_endtag(self, tag):
        if self.stack:
            expected, _ = self.stack.pop()
            assert expected == tag, (
                f"Malformed HTML: closed {tag} while inside {expected}"
            )

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in {
            "area", "base", "br", "col", "embed", "hr", "img",
            "input", "link", "meta", "param", "source", "track", "wbr",
        }:
            self.handle_endtag(tag)


def test_scan_disclosures_and_review_actions_belong_to_exactly_three_steps():
    parser = _ContainerScanner()
    parser.feed(HTML)
    parents = parser.parents_by_id

    for key in (
        "tia-hmi-scan-summary",
        "tia-hmi-text-lists-details",
        "tia-hmi-project-texts-details",
        "tia-hmi-preview-results",
    ):
        assert "hmi-scan-help" in parents[key], key

    for key in (
        "tia-hmi-batch-size",
        "tia-hmi-total-to-translate",
    ):
        assert "hmi-scope-step" in parents[key], key

    for key in ("tia-hmi-review-results", "tia-hmi-text-list-review",
                "tia-hmi-edit-details"):
        assert "hmi-scope-step" in parents[key], key

    for key in (
        "tia-hmi-translate-button",
        "tia-hmi-import-reviewed-button",
        "tia-hmi-unified-status",
        "tia-hmi-batch-start", "tia-hmi-review-each-batch",
    ):
        assert "hmi-manual-step" in parents[key], key



def test_reviewed_mode_waits_for_confirmation_between_batches():
    assert 'id="tia-hmi-review-each-batch" type="checkbox" checked' in HTML
    assert 'async function startReviewedHmiQueue(' in JS
    assert 'async function prepareNextReviewedHmiBatch()' in JS
    assert 'async function approveReviewedHmiQueueBatch()' in JS
    pipeline = JS.split('async function prepareNextReviewedHmiBatch()', 1)[1]
    pipeline = pipeline.split('async function approveReviewedHmiQueueBatch()', 1)[0]
    assert 'await translateSelectedHmi()' in pipeline
    assert 'await prepareHmiTextList()' in pipeline
    assert 'await importSelectedHmiBatch()' not in pipeline
    assert 'hmiReviewQueuePending = true;' in pipeline
    approval = JS.split('async function approveReviewedHmiQueueBatch()', 1)[1]
    approval = approval.split('async function startHmiBatchImport(', 1)[0]
    assert approval.index('await importSelectedHmiBatch({automatic})') < approval.index(
        'await prepareNextReviewedHmiBatch()')
    assert 'hmiCombinedApprovedCount <= before' in approval


def test_review_mode_can_switch_an_active_review_queue_to_automatic():
    state = JS.split('function updateHmiTranslateButtonState()', 1)[1]
    state = state.split('if (hmiRunDescription)', 1)[0]
    assert 'hmiReviewEachBatch.disabled = false;' in state
    listener = JS.split('hmiReviewEachBatch?.addEventListener("change", () => {', 1)[1].split(
        'const changeHmiScope', 1
    )[0]
    assert 'hmiReviewQueueAutoContinue = true;' in listener
    assert 'void approveReviewedHmiQueueBatch({automatic: true});' in listener
    assert 'current safe operation will finish' in listener
    queue = JS.split('async function prepareNextReviewedHmiBatch()', 1)[1].split(
        'async function approveReviewedHmiQueueBatch()', 1
    )[0]
    assert 'await approveReviewedHmiQueueBatch({automatic: true});' in queue
    approval = JS.split('async function approveReviewedHmiQueueBatch()', 1)[1].split(
        'async function skipReviewedHmiQueueBatch()', 1
    )[0]
    assert 'await continueReviewedQueueAutomatically();' in approval
    continuation = JS.split('async function continueReviewedQueueAutomatically()', 1)[1].split(
        'async function skipReviewedHmiQueueBatch()', 1
    )[0]
    assert 'await translateAllSelectedHmi({confirmed: true, preserveRunReport: true});' in continuation
    assert 'if (!automatic && !confirm(' in JS


def test_one_csv_report_covers_skipped_xlsx_xml_and_blocks_formulas():
    assert 'id="tia-hmi-run-report"' in HTML
    for text in (
        'function downloadHmiRunReport()', 'function appendHmiRunIssue(',
        'async function collectHmiXlsxRunSkips()',
        'for (const item of result.skipped || [])',
        'for (const item of prepared.skipped || [])',
        'hmiRunReportButton?.addEventListener("click", downloadHmiRunReport)',
        'new Blob(', 'text/csv;charset=utf-8', 'revokeObjectURL',
    ):
        assert text in JS
    assert 'hmiReviewQueueBlockedLists.add(' in JS
    assert 'hmiReviewQueueProjectExhausted = true;' in JS


def test_scan_is_a_visible_primary_action_and_checkboxes_have_project_wide_style():
    html = (ROOT / "gui/index.html").read_text(encoding="utf-8")
    css = (ROOT / "gui/style.css").read_text(encoding="utf-8")
    scan = html.split('id="tia-hmi-scan-button"', 1)[1].split("</button>", 1)[0]
    assert 'class="primary-button"' in scan
    assert 'input[type="checkbox"] {' in css
    assert 'input[type="checkbox"]:checked {' in css
    assert 'input[type="checkbox"]:focus-visible {' in css
    assert 'button.primary-button:disabled {' in css


def test_edit_panel_is_not_shown_before_prepared_translation_rows():
    html = (ROOT / "gui/index.html").read_text(encoding="utf-8")
    js = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    assert 'id="tia-hmi-edit-details" class="hmi-edit-details hidden"' in html
    assert 'function syncHmiReviewPreview()' in js
    sync = js.split("function syncHmiReviewPreview()", 1)[1].split(
        "function updateHmiTranslateButtonState()", 1
    )[0]
    assert 'hmiReviewRows?.children.length' in sync
    assert 'hmiTextListReviewRows?.children.length' in sync
    assert 'hmiEditDetails.classList.toggle("hidden", !hasReview)' in sync
    assert 'syncHmiReviewPreview();' in js
    assert 'id="tia-hmi-review-rows"' in html
    assert 'id="tia-hmi-text-list-review-rows"' in html


def test_queue_descriptions_follow_selected_scope_and_xml_imports_one_list_at_time():
    html = (ROOT / "gui/index.html").read_text(encoding="utf-8")
    js = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    assert 'id="tia-hmi-queue-scope-note"' in html
    assert 'const projectNote = "Project texts (XLSX):' in js
    assert 'const xmlNote = "Text lists (XML):' in js
    assert 'hmiQueueScopeNote.textContent = projectSelected && listsSelected' in js
    assert 'Each XML import sends one full Text list at a time.' in js


def test_application_wide_design_tokens_unify_controls_and_disclosure_chevrons():
    css = (ROOT / "gui/style.css").read_text(encoding="utf-8")
    html = (ROOT / "gui/index.html").read_text(encoding="utf-8")
    assert '/* Application-wide design system v1:' in css
    for token in (
        "--ui-primary:", "--ui-primary-hover:", "--ui-text:",
        "--ui-blue-accent:", "--ui-focus:", "--ui-font:",
    ):
        assert token in css
    for selector in (
        'button.primary-button {',
        'button.primary-button:hover:not(:disabled) {',
        'button.primary-button:disabled {',
        'input[type="checkbox"]:checked {',
        'details > summary::before {',
        'details[open] > summary::before {',
        'details > summary::-webkit-details-marker {',
        'details > summary::marker {',
    ):
        assert selector in css
    assert 'prefers-reduced-motion: reduce' in css
    assert 'button:not(.primary-button):not(.danger-button):not(:disabled)' not in css
    # PLC, HMI and hardware sections use native details/summary elements.
    assert 'class="tia-inventory-details"' in html
    assert 'id="tia-hmi-text-lists-details"' in html
    assert 'id="tia-hmi-edit-details"' in html


def test_stop_translation_is_available_and_restores_scope_controls_safely():
    assert HTML.count('id="tia-hmi-batch-stop"') == 1
    third = HTML.split('Step 3 — Translate, review &amp; import', 1)[1]
    third = third.split('data-tab-panel="devices"', 1)[0]
    assert 'id="tia-hmi-batch-stop"' in third
    assert 'id="tia-hmi-import-reviewed-button"' in third
    assert 'id="tia-hmi-skip-reviewed"' in third
    second = HTML.split('Step 2 — Batch settings (selected text types)', 1)[1]
    second = second.split('Step 3 — Translate, review &amp; import', 1)[0]
    assert 'id="tia-hmi-import-reviewed-button"' not in second
    assert 'id="tia-hmi-skip-reviewed"' not in second
    assert 'function stopUnifiedHmiTranslation()' in JS
    assert 'function finishStoppedReviewedHmiQueue()' in JS
    assert 'hmiBatchStopButton?.addEventListener(' in JS
    assert 'hmiBatchStopButton.classList.toggle("hidden", !activeRun)' in JS
    assert 'hmiScopeProject.disabled = busy || hmiReviewQueueActive;' in JS
    assert 'hmiScopeLists.disabled = busy || hmiReviewQueueActive;' in JS
    finish = JS.split('function finishReviewedHmiQueue(', 1)[1].split(
        'async function startReviewedHmiQueue(', 1
    )[0]
    for clause in (
        'hmiReviewQueueActive = false',
        'hmiReviewQueueStopRequested = false',
        'hmiReviewQueuePending = false',
        'updateHmiTranslateButtonState();',
    ):
        assert clause in finish


def test_stop_during_inflight_prepare_or_import_never_aborts_tia_write():
    prepare = JS.split('async function prepareNextReviewedHmiBatch()', 1)[1].split(
        'async function approveReviewedHmiQueueBatch()', 1
    )[0]
    assert 'hmiReviewQueueOperation = "preparing"' in prepare
    assert 'await prepareHmiTextList()' in prepare
    assert 'hmiReviewQueueOperation = null;' in prepare
    assert 'if (hmiReviewQueueStopRequested)' in prepare
    # Crucially there must be a SECOND stop boundary after the awaited
    # read-only prepare returns, not only before it starts.
    after_prepare = prepare.split('hmiReviewQueueOperation = null;', 1)[1]
    assert 'if (hmiReviewQueueStopRequested)' in after_prepare
    assert 'finishStoppedReviewedHmiQueue();' in after_prepare
    approval = JS.split('async function approveReviewedHmiQueueBatch()', 1)[1].split(
        'async function skipReviewedHmiQueueBatch()', 1
    )[0]
    assert 'hmiReviewQueueOperation = "importing / verifying"' in approval
    assert 'completed = await importSelectedHmiBatch({automatic});' in approval
    assert 'hmiReviewQueueStopRequested' in approval
    assert 'completed?.state === "prewrite_rejected"' in approval
    assert 'completed?.state === "verified_refresh_failed"' in approval
    stop = JS.split('function stopUnifiedHmiTranslation()', 1)[1].split(
        'function pauseUnifiedHmiTranslation()', 1
    )[0]
    assert 'if (hmiReviewQueueOperation)' in stop
    assert 'finishStoppedReviewedHmiQueue()' in stop
    assert 'hmiUnifiedPauseRequested = true;' in stop
    assert 'if (hmiBatchRunning) void pauseHmiBatchImport();' in stop
    assert 'if (hmiXmlAutoRunning) pauseAutomaticXmlBatches();' in stop
    assert 'run_adapter(' not in stop


def test_new_hmi_runs_clear_only_a_stale_review_queue_error_style():
    js = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    automatic = js.split("async function translateAllSelectedHmi()", 1)[1].split(
        "function finishStoppedReviewedHmiQueue()", 1
    )[0]
    reviewed = js.split("async function startReviewedHmiQueue(", 1)[1].split(
        "async function prepareNextReviewedHmiBatch()", 1
    )[0]
    assert 'hmiUnifiedStatus?.classList.remove("error");' in automatic
    assert 'hmiUnifiedStatus?.classList.remove("error");' in reviewed


def test_queue_marks_items_awaiting_approval_only_while_review_queue_is_active():
    queue = JS.split('function renderHmiTranslationQueue()', 1)[1].split(
        'function renderHmiBatchPlan()', 1
    )[0]
    assert 'const reviewing = hmiReviewQueueActive && hmiReviewQueuePending' in queue
    assert ': ready ? "Ready to translate" : "Scan required"' in queue
    assert ': "hmi-queue-ready");' in queue


def test_xlsx_backend_verification_is_not_confused_with_followup_ui_scan():
    js = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    importer = js.split('async function importReviewedHmiTexts()', 1)[1].split(
        'async function refreshProjectLanguages()', 1
    )[0]
    # Backend verifies the actual edited target cells via independent XLSX
    # re-export; frontend never promotes an unverified response to success.
    assert '"/api/v1/tia/hmis/import-reviewed-translations"' in importer
    assert 'result?.status !== "verified"' in importer
    assert 'count !== imported || count !== review.rowCount' in importer
    assert 'hmiCombinedApprovedCount += review.rowCount;' in importer
    assert importer.index('result?.status !== "verified"') < importer.index(
        'hmiCombinedApprovedCount += review.rowCount;')
    assert 'return {state: "uncertain", detail: reason};' in importer
    assert 'return {state: "prewrite_rejected", detail: reason};' in importer
    assert 'state: "verified_refresh_failed"' in importer
    assert 'Post-import UI refresh failed:' in importer
    assert 'return true;' in importer
    assert 'return refreshVerified;' not in importer
    approval = js.split('async function approveReviewedHmiQueueBatch()', 1)[1].split(
        'async function skipReviewedHmiQueueBatch()', 1
    )[0]
    assert 'const importType = hmiReviewQueueCurrentScope === "project"' in approval
    assert 'completed?.state === "verified_refresh_failed"' in approval
    assert '"Verified in TIA — re-scan required"' in approval
    assert 'renderHmiBatchProgress(' in approval
    assert '"Stopped: " + importType' in approval
    assert 'XML/TIA import status uncertain' not in approval


def test_translate_label_and_modal_are_consistent():
    html = (ROOT / "gui/index.html").read_text(encoding="utf-8")
    js = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    assert '>Translate</button>' in html
    assert 'click Translate.' in html
    assert '>Translate all</button>' not in html
    assert 'TRANSLATE SELECTED HMI TEXTS?' in js
    assert 'TRANSLATE ALL SELECTED HMI TEXTS?' not in js


def test_review_queue_does_not_exhaust_xlsx_after_fully_rejected_qa_batch():
    """Five QA rejects must not prevent reaching the next five candidates."""
    import shutil
    import subprocess
    import pytest

    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js is required for this UI state regression")
    queue = JS.split("async function prepareNextReviewedHmiBatch()", 1)[1].split(
        "async function approveReviewedHmiQueueBatch()", 1
    )[0]
    script = r"""
const assert = require("node:assert/strict");
let hmiReviewQueueActive = true, hmiReviewQueuePending = false;
let hmiReviewQueueStopRequested = false, hmiReviewQueuePaused = false;
let hmiReviewQueueOperation = null, hmiReviewQueueAutoContinue = false;
let hmiCombinedApprovedCount = 0, hmiReviewQueueStartApproved = 0;
let hmiReviewQueueQuota = 10, hmiReviewQueueProjectExhausted = false;
let hmiReviewQueueCurrentScope = null;
const hmiReviewQueueTypes = {project: true, text_lists: false};
const latestHmiScan = {missingUnique: 10};
const hmiReviewQueueExcludedProject = new Set();
const hmiReviewQueueBlockedLists = new Set();
const hmiBatchSizeInput = {value: "5"};
const hmiUnifiedStatus = {textContent: ""};
const hmiEditDetails = {open: false, scrollIntoView() {}};
const hmiEditCaption = {textContent: ""};
function hmiScopeEnabled(scope) {return scope === "project";}
function renderHmiBatchProgress() {}
function updateHmiTranslateButtonState() {}
function nextEligibleTextList() {return null;}
function finishStoppedReviewedHmiQueue() {throw Error("Unexpected stop");}
function finishReviewedHmiQueue() {throw Error("Premature XLSX exhaustion");}
let prepareCalls = 0;
async function translateSelectedHmi() {
    prepareCalls++;
    if (prepareCalls === 1) {
        for (let i = 0; i < 5; i++)
            hmiReviewQueueExcludedProject.add("rejected-" + i);
        return false;  // First five candidates all rejected by QA.
    }
    return true;  // A later eligible group is safe.
}
async function prepareHmiTextList() {throw Error("Unexpected XML preparation");}
async function prepareNextReviewedHmiBatch()""" + queue + """
(async () => {
    await prepareNextReviewedHmiBatch();
    assert.equal(prepareCalls, 2);
    assert.equal(hmiReviewQueuePending, true);
    assert.equal(hmiReviewQueueProjectExhausted, false);
    assert.equal(hmiReviewQueueExcludedProject.size, 5);
    assert.match(hmiUnifiedStatus.textContent, /Awaiting approval/);
})().catch(error => {console.error(error); process.exitCode = 1;});
"""
    result = subprocess.run(
        [node, "-e", script], capture_output=True, text=True, timeout=20
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_stopping_hmi_run_clears_visual_progress_but_keeps_verified_count():
    """A finished Stop resets the bar, not confirmed TIA writes or job state."""
    import shutil
    import subprocess
    import pytest

    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js required for HMI stop-state regression")
    review_stop = JS.split("function finishStoppedReviewedHmiQueue()", 1)[1].split(
        "function stopUnifiedHmiTranslation()", 1
    )[0]
    automatic = JS.split("async function translateAllSelectedHmi()", 1)[1].split(
        "function finishStoppedReviewedHmiQueue()", 1
    )[0]
    auto_finally = automatic.split(
        "const wasStopped = hmiUnifiedStopRequested;", 1
    )[1].split("showHmiRunReport();", 1)[0]

    script = r"""
const assert = require("node:assert/strict");
let hmiCombinedApprovedCount = 5;
let hmiReviewQueueStartApproved = 0;
const uiProgress = [];
let stoppedStatus = "";
function renderHmiBatchProgress(done, total) {
    uiProgress.push([done, total]);
}
function discardHmiTextListReview() {}
function discardHmiReview() {}
function finishReviewedHmiQueue(message) {stoppedStatus = message;}
function finishStoppedReviewedHmiQueue()""" + review_stop + r"""
finishStoppedReviewedHmiQueue();
assert.deepEqual(uiProgress, [[0, 0]]);
assert.match(stoppedStatus, /5 translation\(s\) already verified in TIA/);
assert.equal(hmiCombinedApprovedCount, 5);

let hmiUnifiedStopRequested = true;
let hmiUnifiedPauseRequested = true;
let hmiUnifiedXlsxVerified = 5, hmiXmlAutoVerified = 0;
let hmiUnifiedStatus = {textContent: ""};
const automaticFinalizer = () => {
    const wasStopped = hmiUnifiedStopRequested;
""" + auto_finally + r"""
};
uiProgress.length = 0;
automaticFinalizer();
assert.deepEqual(uiProgress, [[0, 0]]);
assert.match(hmiUnifiedStatus.textContent, /5 translation\(s\) already verified in TIA/);
assert.equal(hmiCombinedApprovedCount, 5);
assert.equal(hmiUnifiedStopRequested, false);
assert.equal(hmiUnifiedPauseRequested, false);

// Successful runs should retain their completed-progress display.
hmiUnifiedStopRequested = false;
uiProgress.length = 0;
automaticFinalizer();
assert.deepEqual(uiProgress, []);
"""
    result = subprocess.run(
        [node, "-e", script], capture_output=True, text=True, timeout=20
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_stop_requires_fresh_hmi_scan_and_completed_csv_keeps_final_count():
    """No stale total reuse after Stop and no negative count after fresh Scan."""
    auto = JS.split("async function translateAllSelectedHmi()", 1)[1].split(
        "function finishStoppedReviewedHmiQueue()", 1
    )[0]
    auto_stopped = auto.split("if (wasStopped) {", 1)[1].split(
        "showHmiRunReport();", 1
    )[0]
    reviewed = JS.split("function finishStoppedReviewedHmiQueue()", 1)[1].split(
        "function stopUnifiedHmiTranslation()", 1
    )[0]
    for section in (auto_stopped, reviewed):
        assert "renderHmiBatchProgress(0, 0);" in section
        assert "verifiedHmiScanKey = null;" in section
        assert "verifiedHmiTextListsScanKey = null;" in section
        assert "hmiCombinedApprovedCount = 0;" not in section
    assert "hmiRunReportVerifiedCount = Math.max(0," in JS
    report = JS.split("function downloadHmiRunReport()", 1)[1].split(
        "async function collectHmiXlsxRunSkips()", 1
    )[0]
    assert "hmiRunReportVerifiedCount" in report
    assert "?? Math.max(0, hmiCombinedApprovedCount - hmiRunReportStartCount)" in report
    assert "hmiRunReportVerifiedCount = null;" in JS
