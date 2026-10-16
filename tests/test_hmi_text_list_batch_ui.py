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
    # The three workflow steps are native, keyboard-accessible disclosures.
    # Their contents stay collapsed until a user opens the relevant step.
    assert HTML.count('class="card device-section hmi-') == 3
    assert '<summary>Step 1 — Scan the selected HMI</summary>' in HTML
    assert '<summary>Step 2 — Batch settings (selected text types)</summary>' in HTML
    assert '<summary>Step 3 — Translate, review &amp; import</summary>' in HTML
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
    # The listener and completion paths share one boundary. Actual asynchronous
    # behavior, importers and buttons are exercised by the runtime suite.
    assert 'hmiReviewQueueAutoContinue = !hmiReviewEachBatch.checked;' in listener
    assert 'void continueReviewedQueueAutomatically();' in listener
    queue = JS.split('async function prepareNextReviewedHmiBatch()', 1)[1].split(
        'async function approveReviewedHmiQueueBatch()', 1
    )[0]
    assert 'await continueReviewedQueueAutomatically();' in queue
    approval = JS.split('async function approveReviewedHmiQueueBatch()', 1)[1].split(
        'async function skipReviewedHmiQueueBatch()', 1
    )[0]
    assert 'await continueReviewedQueueAutomatically();' in approval
    continuation = JS.split('async function continueReviewedQueueAutomatically()', 1)[1].split(
        'async function skipReviewedHmiQueueBatch()', 1
    )[0]
    assert 'await approveReviewedHmiQueueBatch({automatic: true});' in continuation
    assert 'await prepareNextReviewedHmiBatch();' in continuation
    assert 'await translateAllSelectedHmi(' not in continuation
    assert 'if (hmiReviewQueuePaused)' in continuation
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
    assert '"importing / verifying" : "awaiting confirmation"' in approval
    # The importer switches to writing state only AFTER user confirmation.
    assert 'completed = await importSelectedHmiBatch({automatic});' in approval
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
    assert 'const reviewing = running && hmiReviewQueuePending;' in queue
    assert 'const currentItem = type === "project"' in queue
    assert 'operation === "awaiting confirmation"' in queue
    assert 'operation === "importing / verifying"' in queue
    assert 'const quotaReached = ready && requested > 0' in queue
    assert 'ready ? "Ready to translate" : "Scan required"' in queue
    assert 'quotaReached ? "Limit reached — run complete"' in queue
    state = JS.split('function updateHmiTranslateButtonState()', 1)[1].split(
        'async function refreshHmiOllamaModels()', 1
    )[0]
    assert 'renderHmiBatchPlan();' in state


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
    boundary = JS.split("async function continueReviewedQueueAutomatically()", 1)[1].split(
        "async function skipReviewedHmiQueueBatch()", 1
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
    async function continueReviewedQueueAutomatically()""" + boundary + """
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
let verifiedHmiScanKey = "verified-project";
let verifiedHmiTextListsScanKey = "verified-xml";
let controlsUpdated = 0;
const uiProgress = [];
let stoppedStatus = "";
function renderHmiBatchProgress(done, total) {
    uiProgress.push([done, total]);
}
function discardHmiTextListReview() {}
function discardHmiReview() {}
function updateHmiTranslateButtonState() {controlsUpdated++;}
function finishReviewedHmiQueue(message) {stoppedStatus = message;}
function finishStoppedReviewedHmiQueue()""" + review_stop + r"""
finishStoppedReviewedHmiQueue();
assert.deepEqual(uiProgress, [[0, 0]]);
assert.match(stoppedStatus, /5 translation\(s\) already verified in TIA/);
assert.equal(hmiCombinedApprovedCount, 5);
assert.equal(verifiedHmiScanKey, null);
assert.equal(verifiedHmiTextListsScanKey, null);
assert.equal(controlsUpdated, 1);

// Check Stop of an automatic run independently from the reviewed run.
verifiedHmiScanKey = "verified-project";
verifiedHmiTextListsScanKey = "verified-xml";
let hmiUnifiedCarryVerified = 0;
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
assert.equal(verifiedHmiScanKey, null);
assert.equal(verifiedHmiTextListsScanKey, null);

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


def test_review_to_auto_transition_preserves_overall_ten_text_progress():
    """Do not restart progress at 0/5 after the first five verified reviews."""
    import shutil
    import subprocess
    import pytest

    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js required for HMI progress transition regression")
    render = JS.split("function renderUnifiedHmiProgress()", 1)[1].split(
        "function renderHmiBatchProgress(", 1
    )[0]
    script = r"""
const assert = require("node:assert/strict");
let hmiUnifiedRunning = true;
let hmiUnifiedCarryVerified = 5;
let hmiUnifiedXlsxVerified = 0, hmiXmlAutoVerified = 0;
let hmiUnifiedQuota = 10;
let rendered;
function renderHmiBatchProgress(done, total) {rendered = [done, total];}
function renderUnifiedHmiProgress()""" + render + r"""
renderUnifiedHmiProgress();
assert.deepEqual(rendered, [5, 10]);
hmiUnifiedXlsxVerified = 5;
renderUnifiedHmiProgress();
assert.deepEqual(rendered, [10, 10]);
"""
    result = subprocess.run(
        [node, "-e", script], capture_output=True, text=True, timeout=20
    )
    assert result.returncode == 0, result.stdout + result.stderr
    auto = JS.split("async function translateAllSelectedHmi()", 1)[1].split(
        "function finishStoppedReviewedHmiQueue()", 1
    )[0]
    assert "hmiUnifiedCarryVerified = carriedVerified;" in auto
    assert "hmiUnifiedQuota = quota + carriedVerified;" in auto
    assert "hmiUnifiedCarryVerified + hmiUnifiedXlsxVerified + hmiXmlAutoVerified" in JS
    assert "hmiUnifiedCarryVerified\n                    + hmiUnifiedXlsxVerified" in auto


def test_xlsx_job_updates_do_not_replace_shared_verified_progress():
    """Review -> auto: retain 5/10 while a new XLSX job starts at 0/5."""
    import shutil
    import subprocess
    import pytest

    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js required for live HMI progress regression")
    source = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    handler = source.split("function showHmiBatchJob(job)", 1)[1].split(
        "async function pollHmiBatchProgress(", 1
    )[0]
    shared = source.split("function renderUnifiedHmiProgress()", 1)[1].split(
        "function renderHmiBatchProgress(", 1
    )[0]
    script = r"""
const assert = require("node:assert/strict");
let hmiUnifiedRunning = true, hmiUnifiedCarryVerified = 5;
let hmiUnifiedXlsxVerified = 0, hmiXmlAutoVerified = 0;
let hmiUnifiedQuota = 10, hmiBatchJobId = null;
const recorded = [];
const hmiSkippedManager = {updateJob() {}};
function renderHmiBatchProgress(done, total) {recorded.push([done, total]);}
function setHmiBatchStatus() {}
function renderUnifiedHmiProgress()""" + shared + r"""
function showHmiBatchJob(job)""" + handler + r"""
const job = {
    job_id: "test", status: "ready", total_unique: 5,
    completed_unique: 0, processed_unique: 0,
    skipped_unique: 0, completed_rows: 0, batch_index: 1, total_batches: 1,
};
showHmiBatchJob(job);
assert.deepEqual(recorded, [[5, 10]]);
job.completed_unique = 5;
job.processed_unique = 5;
job.status = "completed";
showHmiBatchJob(job);
assert.deepEqual(recorded, [[5, 10], [10, 10]]);
assert.equal(hmiBatchJobId, "test");
// An XLSX-only run still uses its own actual job denominator.
hmiUnifiedRunning = false;
recorded.length = 0;
job.completed_unique = 2;
showHmiBatchJob(job);
assert.deepEqual(recorded, [[2, 5]]);
"""
    result = subprocess.run([node, "-e", script], capture_output=True,
                            text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
    init = source.split("async function startHmiBatchImport(", 1)[1].split(
        "async function resumeHmiBatchImport()", 1
    )[0]
    assert 'if (!hmiUnifiedRunning) {' in init
    assert "renderHmiBatchProgress(0, xlsxLimit" in init


def test_hmi_diagnostics_json_is_read_only_and_excludes_translation_content():
    """A support snapshot works during active review without any TIA calls."""
    import shutil
    import subprocess
    import pytest

    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js required for HMI diagnostic snapshot regression")
    html = (ROOT / "gui/index.html").read_text(encoding="utf-8")
    source = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    assert html.count('id="tia-hmi-diagnostics-download"') == 1
    assert 'hmiDiagnosticsButton?.addEventListener("click", downloadHmiDiagnostics);' in source
    builder = source.split("function buildHmiDiagnostics()", 1)[1].split(
        "function downloadHmiDiagnostics()", 1
    )[0]
    script = r"""
const assert = require("node:assert/strict");
const currentProjectName = "Test project";
const hmiBatchSizeInput = {value: "5"};
const hmiBatchTotalInput = {value: "10"};
const hmiReviewEachBatch = {checked: false};
const verifiedHmiScanKey = "current-project";
const verifiedHmiTextListsScanKey = "current-xml";
const latestHmiScan = {missingUnique: 20};
const hmiCombinedApprovedCount = 5;
const hmiRunReportStartCount = 0;
const hmiRunReportVerifiedCount = null;
const hmiRunReport = [];
const hmiReviewQueueActive = true, hmiReviewQueuePending = true;
const hmiReviewQueuePaused = false, hmiReviewQueueAutoContinue = true;
const hmiReviewQueueStopRequested = false, hmiReviewQueueCurrentScope = "project";
const hmiReviewQueueOperation = "importing / verifying";
const hmiReviewQueueQuota = 10, hmiReviewQueueStartApproved = 0;
const hmiUnifiedRunning = false, hmiUnifiedPauseRequested = false;
const hmiUnifiedStopRequested = false, hmiUnifiedQuota = 0;
const hmiUnifiedCarryVerified = 0, hmiUnifiedXlsxVerified = 0;
const hmiXmlAutoVerified = 0;
const hmiBatchRunning = false, hmiBatchStarting = false;
const hmiBatchPauseRequested = false, hmiBatchJobId = null;
const hmiXmlAutoRunning = false, hmiXmlAutoPauseRequested = false;
const hmiTextListBusy = false, hmiTextListSelect = {value: "List A"};
const hmiRunStartedAt = "2026-10-14T20:00:00Z";
function hmiTranslationSelection() {
    return {hmi_name: "HMI_RT_1", source_culture:"pl-PL",
        target_culture:"en-US", secret:"should-not-export",
        source_text:"should-not-export"};
}
function hmiScopeEnabled(scope) {return scope === "project";}
function hmiScanKey(_selection, scope="project") {
    return scope === "project" ? "current-project" : "current-xml";
}
function eligibleXmlEntries() {return 0;}
function buildHmiDiagnostics()""" + builder + r"""
const snapshot = buildHmiDiagnostics();
assert.equal(snapshot.schema_version, 1);
assert.equal(snapshot.project_name, "Test project");
assert.equal(snapshot.settings.batch_size, 5);
assert.equal(snapshot.settings.total_requested, 10);
assert.equal(snapshot.reviewed_queue.automatic_continuation_requested, true);
assert.equal(snapshot.reviewed_queue.pending, true);
assert.equal(snapshot.counters.verified_since_scan, 5);
assert.equal(snapshot.scan.project_current, true);
const raw = JSON.stringify(snapshot);
assert.equal(raw.includes("should-not-export"), false);
assert.equal(raw.includes("proposal"), false);
assert.equal(raw.includes("password"), false);
assert.ok(!("source_text" in snapshot));
"""
    result = subprocess.run([node, "-e", script], capture_output=True,
                            text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
    exporter = source.split("function downloadHmiDiagnostics()", 1)[1].split(
        "function downloadHmiRunReport()", 1
    )[0]
    assert "application/json;charset=utf-8" in exporter
    assert "URL.createObjectURL(blob)" in exporter
    assert "anchor.click();" in exporter
    assert "postJson(" not in exporter and "getJson(" not in exporter


def test_hmi_status_phase_changes_are_visible_during_import_and_after_completion():
    """An import cannot continue to display its confirmation prompt or stale queue."""
    import shutil
    import subprocess
    import pytest

    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js needed for HMI live queue regression")
    queue = JS.split("function renderHmiTranslationQueue()", 1)[1].split(
        "function renderHmiBatchPlan()", 1
    )[0]
    plan = JS.split("function renderHmiBatchPlan()", 1)[1].split(
        "function showHmiBatchJob(job)", 1
    )[0]
    script = r"""
const assert = require("node:assert/strict");
class Element {
    constructor() {
        this.children = []; this.textContent = "";
        this.className = ""; this.attributes = {};
    }
    append(...items) {this.children.push(...items);}
    appendChild(item) {this.children.push(item);}
    replaceChildren() {this.children = [];}
    setAttribute(name,value) {this.attributes[name] = value;}
}
const document = {
    createElement() {return new Element();},
    createTextNode(s) {return s;}
};
let hmiReviewQueueActive = true, hmiReviewQueuePending = true;
let hmiReviewQueueOperation = "awaiting confirmation";
let hmiReviewQueueCurrentScope = "project", hmiReviewQueuePaused = false;
let hmiUnifiedRunning = false, hmiXmlAutoRunning = false;
let hmiCombinedApprovedCount = 5;
let verifiedHmiScanKey = "valid", verifiedHmiTextListsScanKey = null;
const latestHmiScan = {missingUnique: 178};
const hmiTranslationQueue = new Element();
const hmiBatchPlan = new Element();
const hmiBatchSizeInput = {value:"5"};
const hmiBatchTotalInput = {value:"10"};
const hmiTextListSelect = {value:""};
function hmiTranslationSelection() {return {hmi_name:"HMI_RT_1"};}
function hmiScanKey() {return "valid";}
function hmiScopeEnabled(scope) {return scope === "project";}
function addHmiTextCell(row,value) {
    const cell = new Element(); cell.textContent = String(value);
    row.appendChild(cell); return cell;
}
function combinedMissingCount() {return 178;}
function eligibleXmlEntries() {return 0;}
function renderHmiTranslationQueue()""" + queue + r"""
function renderHmiBatchPlan()""" + plan + r"""
function queueStatus() {
    return hmiTranslationQueue.children[0].children[4].children[0].textContent;
}
renderHmiBatchPlan();
assert.equal(queueStatus(), "Confirm import");
assert.match(hmiBatchPlan.textContent, /remaining 5/);
hmiReviewQueueOperation = "importing / verifying";
renderHmiBatchPlan();
assert.equal(queueStatus(), "Importing / verifying in TIA");
hmiCombinedApprovedCount = 10;
hmiReviewQueuePending = false;
hmiReviewQueueActive = false;
hmiReviewQueueOperation = null;
renderHmiBatchPlan();
assert.equal(queueStatus(), "Limit reached — run complete");
assert.match(hmiBatchPlan.textContent, /10 \/ 10/);
assert.match(hmiBatchPlan.textContent, /178 missing targets remain/);
assert.doesNotMatch(queueStatus(), /Awaiting approval/);
"""
    result = subprocess.run([node, "-e", script], capture_output=True,
                            text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr


def test_hmi_confirmation_and_import_have_separate_states():
    approval = JS.split('async function approveReviewedHmiQueueBatch()', 1)[1].split(
        'async function skipReviewedHmiQueueBatch()', 1
    )[0]
    project = JS.split('async function importReviewedHmiTexts()', 1)[1].split(
        'async function refreshProjectLanguages(', 1
    )[0]
    xml = JS.split('async function importReviewedHmiTextList()', 1)[1].split(
        'async function startAutomaticXmlBatches(', 1
    )[0]
    assert 'automatic\n            ? "importing / verifying" : "awaiting confirmation"' in approval
    assert '"Confirmation required — "' in approval
    assert 'hmiReviewQueueOperation = "importing / verifying";' in project
    assert '"Importing Project texts (XLSX) into TIA and verifying by "' in project
    assert '" Backend verification complete. Refreshing the "' in project
    assert 'hmiReviewQueueOperation = "importing / verifying";' in xml
    assert '"TIA VERIFIED "' in xml


def test_hmi_readiness_uses_active_phase_not_stale_scan_ready():
    """Readiness must not claim that a queued import is idle."""
    state = JS.split("function updateHmiTranslateButtonState()", 1)[1].split(
        "async function refreshHmiOllamaModels()", 1
    )[0]
    phase = state.split("if (hmiBatchReadiness) {", 1)[1].split(
        "hmiBatchReadiness.textContent = hint;", 1
    )[0]
    assert phase.index("} else if (hmiReviewQueueActive) {") < phase.index(
        '} else if (busy) {')
    for value in (
        '"awaiting confirmation"',
        '"importing / verifying"',
        '"preparing"',
        '"Batch prepared. Review in Step 2',
        '"Translation paused. Resume or stop the queue.',
    ):
        assert value in phase
    assert 'renderHmiBatchPlan();' in state
