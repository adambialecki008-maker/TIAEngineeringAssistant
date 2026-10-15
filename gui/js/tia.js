import {
    deleteJson,
    getJson,
    patchJson,
    postJson,
} from "./api.js";

import {
    projectConfig,
    saveProjectConfig,
} from "./state.js";

import { createPlcMemberTree } from "./plc_member_tree.js";
import { createHmiSkippedManager } from "./hmi_skipped_manager.js";


const MANUAL_SELECTION =
    "__manual__";

// Same Project texts transaction limit for manual and automatic workflows.
const HMI_PROJECT_BATCH_MAX = 50;


export function initTiaUi(
    getPlcFamily
) {
    const refreshButton =
        document.getElementById(
            "tia-refresh-button"
        );

    const processSelect =
        document.getElementById(
            "tia-process"
        );
    // PLC and HMI tabs show the same TIA session; these are mirror controls.
    // The original processSelect remains the single source of truth.
    const hmiProcessSelect = document.getElementById("tia-hmi-process");
    const hmiRefreshButton = document.getElementById("tia-hmi-refresh-button");
    const hmiRefreshProjectButton =
        document.getElementById("tia-hmi-refresh-project-button");
    const hmiConnectionStatus =
        document.getElementById("tia-hmi-connection-status");
    const hmiProjectNameElement =
        document.getElementById("tia-hmi-project-name");
    const tiaConnectionStatus =
        document.getElementById("tia-connection-status");

    const refreshPlcsButton =
        document.getElementById(
            "tia-refresh-plcs-button"
        );

    const existingPlcsBody =
        document.getElementById(
            "tia-existing-plcs-body"
        );

    const existingHmisBody =
        document.getElementById(
            "tia-existing-hmis-body"
        );

    const hmiTranslationPanel =
        document.getElementById(
            "tia-hmi-translation-panel"
        );

    const hmiTranslationTitle =
        document.getElementById(
            "tia-hmi-translation-title"
        );

    const hmiSourceLanguageSelect =
        document.getElementById(
            "tia-hmi-source-language"
        );

    const hmiTargetLanguageSelect =
        document.getElementById(
            "tia-hmi-target-language"
        );

    const hmiViewPathRootSelect =
        document.getElementById(
            "tia-hmi-view-path-root"
        );

    const hmiBatchSizeInput = document.getElementById("tia-hmi-batch-size");
    const hmiBatchTotalInput = document.getElementById("tia-hmi-total-to-translate");
    const hmiBatchStartButton = document.getElementById("tia-hmi-batch-start");
    const hmiBatchResumeButton = document.getElementById("tia-hmi-batch-resume");
    const hmiBatchPauseButton = document.getElementById("tia-hmi-batch-pause");
    const hmiBatchStatus = document.getElementById("tia-hmi-batch-status");
    const hmiQualityReportButton = document.getElementById(
        "tia-hmi-quality-report"
    );
    const hmiSkippedOpen = document.getElementById("tia-hmi-skipped-open");
    const hmiSkippedPanel = document.getElementById("tia-hmi-skipped-panel");
    const hmiSkippedStatus = document.getElementById("tia-hmi-skipped-status");
    const hmiSkippedList = document.getElementById("tia-hmi-skipped-list");
    const hmiBatchReadiness =
        document.getElementById("tia-hmi-batch-readiness");
    const hmiBatchPlan = document.getElementById("tia-hmi-batch-plan");
    const hmiTranslationQueue = document.getElementById("tia-hmi-translation-queue");
    const hmiBatchAutoRepeat = document.getElementById("tia-hmi-batch-auto-repeat");
    const hmiBatchProgress = document.getElementById("tia-hmi-batch-progress");
    const hmiBatchProgressText =
        document.getElementById("tia-hmi-batch-progress-text");
    const hmiBatchProgressPanel =
        document.getElementById("tia-hmi-batch-progress-panel");
    const hmiScanSummary = document.getElementById("tia-hmi-scan-summary");
    const hmiDedicatedTextLists = document.getElementById(
        "tia-hmi-dedicated-text-lists"
    );
    const hmiTextListDetails = document.getElementById("tia-hmi-text-lists-details");
    const hmiProjectTextDetails = document.getElementById("tia-hmi-project-texts-details");
    const hmiDedicatedProjectTexts = document.getElementById("tia-hmi-dedicated-project-texts");
    const hmiAutomationControls = document.querySelector(".hmi-automation-controls");
    const hmiUnifiedStatus = document.getElementById("tia-hmi-unified-status");
    const hmiRunReportButton = document.getElementById("tia-hmi-run-report");
    const hmiDiagnosticsButton = document.getElementById("tia-hmi-diagnostics-download");
    const hmiSkipReviewedButton = document.getElementById("tia-hmi-skip-reviewed");
    const hmiBatchStopButton = document.getElementById("tia-hmi-batch-stop");
    const hmiRunReportSummary = document.getElementById("tia-hmi-report-summary");
    const hmiReviewEachBatch = document.getElementById("tia-hmi-review-each-batch");
    const hmiModeDescription = document.getElementById("tia-hmi-mode-description");
    const hmiStep3Description = document.getElementById("tia-hmi-step3-description");
    const hmiRunDescription = document.getElementById("tia-hmi-run-description");
    const hmiEditDetails = document.getElementById("tia-hmi-edit-details");
    const hmiEditCaption = document.getElementById("tia-hmi-edit-caption");
    const hmiQueueScopeNote = document.getElementById("tia-hmi-queue-scope-note");
    const hmiTextListCatalog = document.getElementById("tia-hmi-text-lists-catalog");
    const hmiTextListSelect = document.getElementById("tia-hmi-text-list-select");
    const hmiTextListStatus = document.getElementById("tia-hmi-text-list-status");
    const hmiTextListReview = document.getElementById("tia-hmi-text-list-review");
    const hmiTextListReviewRows = document.getElementById("tia-hmi-text-list-review-rows");
    const hmiXmlAutoStart = document.getElementById("tia-hmi-xml-auto-start");
    const hmiXmlAutoPause = document.getElementById("tia-hmi-xml-auto-pause");
    const hmiXmlAutoStatus = document.getElementById("tia-hmi-xml-auto-status");
    const hmiXmlAutoProgress = document.getElementById("tia-hmi-xml-auto-progress");
    const hmiScopeProject = document.getElementById("tia-hmi-scope-project");
    const hmiScopeLists = document.getElementById("tia-hmi-scope-lists");
    const hmiScopeSections = document.querySelectorAll("[data-hmi-scope]");
    const hmiTextListPreview = document.getElementById("tia-hmi-text-list-preview");
    const hmiTextListPreviewSummary = document.getElementById("tia-hmi-text-list-preview-summary");
    const hmiTextListPreviewRows = document.getElementById("tia-hmi-text-list-preview-rows");
    const hmiScanButton = document.getElementById("tia-hmi-scan-button");
    const hmiAuditExistingButton = document.getElementById(
        "tia-hmi-audit-existing"
    );
    const hmiExistingQaReportButton = document.getElementById(
        "tia-hmi-existing-qa-report"
    );
    const hmiExistingQaStatus = document.getElementById(
        "tia-hmi-existing-qa-status"
    );
    const hmiExistingQaResults = document.getElementById(
        "tia-hmi-existing-qa-results"
    );
    const hmiExistingQaRows = document.getElementById(
        "tia-hmi-existing-qa-rows"
    );
    const hmiUseScanTotalButton =
        document.getElementById("tia-hmi-use-scan-total");
    const hmiScanInstruction =
        document.getElementById("tia-hmi-scan-instruction");

    const hmiOllamaModelSelect = document.getElementById(
        "tia-hmi-ollama-model"
    );
    const hmiRefreshOllamaModels = document.getElementById(
        "tia-hmi-refresh-ollama-models"
    );
    const hmiOllamaStatus = document.getElementById(
        "tia-hmi-ollama-status"
    );

    const hmiTranslateButton =
        document.getElementById(
            "tia-hmi-translate-button"
        );

    const hmiImportReviewedButton = document.getElementById(
        "tia-hmi-import-reviewed-button"
    );
    const hmiReviewResults = document.getElementById("tia-hmi-review-results");
    const hmiReviewSummary = document.getElementById("tia-hmi-review-summary");
    const hmiReviewRows = document.getElementById("tia-hmi-review-rows");
    const hmiReviewSkipped = document.getElementById("tia-hmi-review-skipped");
    const hmiReviewSkippedSummary = document.getElementById(
        "tia-hmi-review-skipped-summary"
    );
    const hmiReviewSkippedList = document.getElementById(
        "tia-hmi-review-skipped-list"
    );

    const hmiPreviewResults =
        document.getElementById(
            "tia-hmi-preview-results"
        );

    const hmiPreviewSummary =
        document.getElementById(
            "tia-hmi-preview-summary"
        );

    const hmiPreviewRows =
        document.getElementById(
            "tia-hmi-preview-rows"
        );

    const hmiPreviewFilter = document.getElementById(
        "tia-hmi-preview-filter"
    );
    const hmiPreviewSampleCount = document.getElementById(
        "tia-hmi-preview-sample-count"
    );

    const hmiPreviewReferences =
        document.getElementById(
            "tia-hmi-preview-references"
        );

    const hmiTranslationStatus =
        document.getElementById(
            "tia-hmi-translation-status"
        );

    const readTagsButton =
        document.getElementById(
            "tia-read-tags-button"
        );

    const plcTagsStatus =
        document.getElementById(
            "tia-plc-tags-status"
        );

    const plcTagsBody =
        document.getElementById(
            "tia-plc-tags-body"
        );


    const plcTagsSummary =
        document.getElementById(
            "tia-plc-tags-summary"
        );


    const plcTagSortButtons =
        [
            ...document.querySelectorAll(
                "[data-plc-tag-sort]"
            ),
        ];

    const plcTagsTableFilter =
        document.getElementById(
            "tia-plc-tags-table-filter"
        );

    const plcTagsTypeFilter =
        document.getElementById(
            "tia-plc-tags-type-filter"
        );

    const plcTagsCategoryFilter =
        document.getElementById(
            "tia-plc-tags-category-filter"
        );

    const plcTagsBreakdown =
        document.getElementById(
            "tia-plc-tags-breakdown"
        );

    const tagCountElements = {
        total:
            document.getElementById(
                "tia-tag-count-total"
            ),

        inputs:
            document.getElementById(
                "tia-tag-count-inputs"
            ),

        outputs:
            document.getElementById(
                "tia-tag-count-outputs"
            ),

        fdi:
            document.getElementById(
                "tia-tag-count-fdi"
            ),

        fdq:
            document.getElementById(
                "tia-tag-count-fdq"
            ),

        safety_other:
            document.getElementById(
                "tia-tag-count-safety-other"
            ),

        iw:
            document.getElementById(
                "tia-tag-count-iw"
            ),

        qw:
            document.getElementById(
                "tia-tag-count-qw"
            ),

        other:
            document.getElementById(
                "tia-tag-count-other"
            ),
    };


    const readProgramBlocksButton =
        document.getElementById(
            "tia-read-program-blocks-button"
        );

    const plcProgramBlocksStatus =
        document.getElementById(
            "tia-plc-program-blocks-status"
        );

    const plcProgramBlocksSummary =
        document.getElementById(
            "tia-plc-program-blocks-summary"
        );

    const plcProgramBlocksBody =
        document.getElementById(
            "tia-plc-program-blocks-body"
        );

    const plcProgramBlocksKindFilter =
        document.getElementById(
            "tia-plc-program-blocks-kind-filter"
        );


    const plcProgramBlockDetail =
        document.getElementById(
            "tia-plc-program-block-detail"
        );

    const plcProgramBlockDetailTitle =
        document.getElementById(
            "tia-plc-program-block-detail-title"
        );

    const plcProgramBlockDetailStatus =
        document.getElementById(
            "tia-plc-program-block-detail-status"
        );

    const plcProgramBlockDetailMeta =
        document.getElementById(
            "tia-plc-program-block-detail-meta"
        );

    const plcProgramBlockDetailBody =
        document.getElementById(
            "tia-plc-program-block-detail-body"
        );


    const readStructuresButton =
        document.getElementById(
            "tia-read-structures-button"
        );

    const plcStructuresStatus =
        document.getElementById(
            "tia-plc-structures-status"
        );

    const plcDbsBody =
        document.getElementById(
            "tia-plc-dbs-body"
        );

    const plcUdtsBody =
        document.getElementById(
            "tia-plc-udts-body"
        );


    const plcDbsSummary =
        document.getElementById(
            "tia-plc-dbs-summary"
        );

    const plcUdtsSummary =
        document.getElementById(
            "tia-plc-udts-summary"
        );


    const plcDbsSort =
        document.getElementById(
            "tia-plc-dbs-sort"
        );

    const plcUdtsSort =
        document.getElementById(
            "tia-plc-udts-sort"
        );


    const plcStructureDetail =
        document.getElementById(
            "tia-plc-structure-detail"
        );

    const plcStructureDetailTitle =
        document.getElementById(
            "tia-plc-structure-detail-title"
        );

    const plcStructureDetailStatus =
        document.getElementById(
            "tia-plc-structure-detail-status"
        );

    const plcStructureDetailBody =
        document.getElementById(
            "tia-plc-structure-detail-body"
        );


    const loadModelsButton =
        document.getElementById(
            "tia-load-models-button"
        );

    const modelSelect =
        document.getElementById(
            "tia-plc-model"
        );

    const manualContainer =
        document.getElementById(
            "tia-manual-container"
        );

    const manualCodeInput =
        document.getElementById(
            "tia-manual-code"
        );

    const deviceNameInput =
        document.getElementById(
            "tia-device-name"
        );

    const plcNameInput =
        document.getElementById(
            "tia-plc-name"
        );

    const createPlcButton =
        document.getElementById(
            "tia-create-plc-button"
        );

    const statusElement =
        document.getElementById(
            "tia-status"
        );

    const tiaActivePlcElement =
        document.getElementById(
            "tia-active-plc"
        );

    const projectActivePlcElement =
        document.getElementById(
            "project-active-plc"
        );

    const overviewProjectNameElement =
        document.getElementById(
            "overview-project-name"
        );

    const overviewDeviceNameElement =
        document.getElementById(
            "overview-device-name"
        );

    const overviewPlcFamilyElement =
        document.getElementById(
            "overview-plc-family"
        );

    const tiaProjectNameElement =
        document.getElementById(
            "tia-project-name"
        );

    const headerActivePlcElement =
        document.getElementById(
            "active-plc-summary"
        );

    const previewTargetPlcElement =
        document.getElementById(
            "preview-target-plc"
        );


    let existingPlcs = [];

    let existingHmis = [];

    let projectLanguages = [];

    let selectedHmiForTranslation = null;

    let verifiedHmiScanKey = null;
    let verifiedHmiTextListsScanKey = null;
    let hmiProjectScanMessage = null;
    let hmiTextListsScanMessage = null;
    let hmiPreviewInProgress = false;
    let hmiAuditInProgress = false;
    let lastHmiPreviewRows = [];
    let hmiTextListsData = null;
    let hmiTextListReviewToken = null;
    let hmiTextListBusy = false;
    let hmiXmlAutoRunning = false;
    let hmiXmlAutoPauseRequested = false;
    let hmiXmlAutoVerified = 0;
    let hmiTextListPreparedKey = null;
    let hmiTextListImportedCount = 0;
    let hmiTextListProgressKey = null;
    let hmiCombinedApprovedCount = 0;
    let hmiUnifiedRunning = false;
    let hmiUnifiedPauseRequested = false;
    // An automatic run may be switched to review mode only after its current
    // batch has completed and has been verified by TIA.
    let hmiUnifiedReviewHandoffRequested = false;
    let hmiUnifiedQuota = 0;
    let hmiUnifiedCarryVerified = 0;
    let hmiUnifiedXlsxVerified = 0;
    let hmiReviewQueueActive = false;
    let hmiReviewQueuePending = false;
    let hmiReviewQueuePaused = false;
    let hmiReviewQueueAutoContinue = false;
    let hmiReviewQueueStopRequested = false;
    let hmiReviewQueueOperation = null;
    let hmiUnifiedStopRequested = false;
    let hmiReviewQueueQuota = 0;
    let hmiReviewQueueStartApproved = 0;
    let hmiReviewQueueTypes = {project: false, text_lists: false};
    let hmiReviewQueueCurrentScope = null;
    let hmiReviewQueueProjectExhausted = false;
    const hmiReviewQueueExcludedProject = new Set();
    let hmiReviewQueuePendingSkippedList = null;
    const hmiReviewQueueBlockedLists = new Set();
    const hmiReviewQueueExcludedXml = new Map();
    let hmiRunReport = [];
    let hmiRunStartedAt = null;
    let hmiRunReportSelection = null;
    let hmiRunReportStartCount = 0;
    let hmiRunReportVerifiedCount = null;
    let hmiRunBatchJobId = null;
    let latestHmiScan = null;
    let hmiBatchRunning = false;
    let hmiBatchStarting = false;
    let hmiBatchPauseRequested = false;
    let hmiBatchJobId = null;
    let hmiReviewInProgress = false;
    let preparedHmiReview = null;
    let preparedHmiRepairId = null;

    const hmiSkippedManager = createHmiSkippedManager({
        openButton: hmiSkippedOpen,
        panel: hmiSkippedPanel,
        status: hmiSkippedStatus,
        list: hmiSkippedList,
        getJson,
        postJson,
        getModel: () => hmiOllamaModelSelect?.value || null,
        onJobUpdate: job => showHmiBatchJob(job),
    });

    let currentProjectName = "";


    let loadedPlcTags = [];

    let plcTagSortState = {
        key: "name",
        direction: "asc",
    };

    let loadedPlcProgramBlocks = [];

    let loadedPlcStructures = {
        data_blocks: [],
        udts: [],
    };


    function setStatus(
        message,
        type = "normal"
    ) {
        statusElement.textContent =
            message;

        statusElement.classList.toggle(
            "error",
            type === "error"
        );

        statusElement.classList.toggle(
            "success",
            type === "success"
        );
    }


    function syncHmiConnectionControls() {
        if (hmiProcessSelect && processSelect) {
            // Mirror options, value and disabled state without a second API call.
            hmiProcessSelect.replaceChildren(
                ...Array.from(processSelect.options, option => option.cloneNode(true))
            );
            hmiProcessSelect.value = processSelect.value;
            hmiProcessSelect.disabled = processSelect.disabled;
        }
        if (hmiRefreshButton && refreshButton)
            hmiRefreshButton.disabled = refreshButton.disabled;
        if (hmiRefreshProjectButton && refreshPlcsButton)
            hmiRefreshProjectButton.disabled = refreshPlcsButton.disabled;
        if (hmiConnectionStatus && tiaConnectionStatus) {
            hmiConnectionStatus.textContent = tiaConnectionStatus.textContent;
            hmiConnectionStatus.classList.toggle(
                "error", tiaConnectionStatus.classList.contains("error")
            );
            hmiConnectionStatus.classList.toggle(
                "success", tiaConnectionStatus.classList.contains("success")
            );
        }
        if (hmiProjectNameElement) {
            hmiProjectNameElement.textContent =
                currentProjectName || "Not connected";
        }
    }

    function setTiaConnectionStatus(message, type = "normal") {
        if (!tiaConnectionStatus) {
            return;
        }
        tiaConnectionStatus.textContent = message;
        tiaConnectionStatus.classList.toggle("error", type === "error");
        tiaConnectionStatus.classList.toggle("success", type === "success");
        syncHmiConnectionControls();
    }

    function selectedProcessId() {
        const value =
            Number(
                processSelect.value
            );


        if (
            !Number.isInteger(value)
            ||
            value <= 0
        ) {
            return null;
        }


        return value;
    }


    function resetModels(
        message =
            "Load models first"
    ) {
        modelSelect.replaceChildren();


        const option =
            document.createElement(
                "option"
            );

        option.value = "";

        option.textContent =
            message;


        modelSelect.appendChild(
            option
        );

        modelSelect.disabled = true;

        manualContainer.classList.add(
            "hidden"
        );

        manualCodeInput.value = "";
    }


    function familyChanged() {
        resetModels(
            "Load models for selected PLC family"
        );

        suggestCreateNames();

        updateTargetSummary();

        setStatus(
            "PLC family changed. Load Hardware Catalog models again."
        );
    }


    function sameTarget(
        plc,
        target
    ) {
        if (
            !plc
            ||
            !target
        ) {
            return false;
        }


        return (
            plc.device_name
                .toLowerCase()
            ===
            target.device_name
                .toLowerCase()
            &&
            plc.plc_name
                .toLowerCase()
            ===
            target.plc_name
                .toLowerCase()
        );
    }


    function updateTargetSummary() {
        const target =
            projectConfig.tia_target;

        const family =
            getPlcFamily();


        let text =
            "Active PLC: not selected";

        let overviewPlcText =
            "Not selected";

        let overviewDeviceText =
            "Not selected";

        let previewText =
            "Target PLC: not selected";


        if (target) {
            text =
                `Active PLC: ${target.plc_name} `
                +
                `(${target.device_name})`;

            overviewPlcText =
                target.plc_name;

            overviewDeviceText =
                target.device_name;

            previewText =
                `Target PLC: ${target.plc_name} `
                +
                `(${target.device_name})`;
        }


        tiaActivePlcElement.textContent =
            text;

        headerActivePlcElement.textContent =
            text;

        projectActivePlcElement.textContent =
            overviewPlcText;

        previewTargetPlcElement.textContent =
            previewText;


        if (overviewDeviceNameElement) {
            overviewDeviceNameElement.textContent =
                overviewDeviceText;
        }

        if (overviewPlcFamilyElement) {
            overviewPlcFamilyElement.textContent =
                family
                ||
                "Not selected";
        }

        if (overviewProjectNameElement) {
            overviewProjectNameElement.textContent =
                currentProjectName
                ||
                "Not connected";
        }

        if (tiaProjectNameElement) {
            tiaProjectNameElement.textContent =
                currentProjectName
                ||
                "Not connected";
        }
        syncHmiConnectionControls();


        if (readTagsButton) {
            readTagsButton.disabled =
                !target;
        }


        if (readProgramBlocksButton) {
            readProgramBlocksButton.disabled =
                !target;
        }


        if (readStructuresButton) {
            readStructuresButton.disabled =
                !target;
        }
    }

    function selectTarget(
        plc
    ) {
        projectConfig.tia_target = {
            device_name:
                plc.device_name,

            plc_name:
                plc.plc_name,

            type_identifier:
                plc.plc_type_identifier
                || "",
        };


        saveProjectConfig();

        updateTargetSummary();

        renderExistingPlcs();

        loadedPlcTags = [];

        resetPlcTagFilters();

        loadedPlcProgramBlocks = [];

        loadedPlcStructures = {
            data_blocks: [],
            udts: [],
        };

        renderEmptyPlcTags(
            "Click Read PLC tags to load tags from the Active PLC."
        );

        setPlcTagsStatus(
            `Active PLC: ${plc.plc_name}. Tags not loaded yet.`
        );

        resetPlcProgramBlocks(
            "Click Read program blocks to inspect the Active PLC."
        );

        setPlcProgramBlocksStatus(
            `Active PLC: ${plc.plc_name}. Program blocks not loaded yet.`
        );


        resetPlcStructures(
            "Click Read DB / UDT to load structures from the Active PLC."
        );

        setPlcStructuresStatus(
            `Active PLC: ${plc.plc_name}. DB / UDT inventory not loaded yet.`
        );


        setStatus(
            `Active PLC set to ${plc.plc_name} `
            +
            `(${plc.device_name}).`,
            "success"
        );
    }


    function clearTarget() {
        projectConfig.tia_target =
            null;

        saveProjectConfig();

        updateTargetSummary();

        renderExistingPlcs();

        loadedPlcTags = [];

        loadedPlcProgramBlocks = [];

        loadedPlcStructures = {
            data_blocks: [],
            udts: [],
        };

        renderEmptyPlcTags(
            "Select an Active PLC first."
        );

        setPlcTagsStatus(
            "Select an Active PLC first."
        );

        resetPlcProgramBlocks(
            "Select an Active PLC first."
        );

        setPlcProgramBlocksStatus(
            "Select an Active PLC first."
        );

        resetPlcStructures(
            "Select an Active PLC first."
        );

        setPlcStructuresStatus(
            "Select an Active PLC first."
        );
    }


    function renderEmptyHmis(
        message
    ) {
        if (!existingHmisBody) {
            return;
        }


        existingHmisBody.replaceChildren();


        const row =
            document.createElement(
                "tr"
            );

        const cell =
            document.createElement(
                "td"
            );

        cell.colSpan =
            6;

        cell.className =
            "empty-table-cell";

        cell.textContent =
            message;


        row.appendChild(
            cell
        );

        existingHmisBody.appendChild(
            row
        );
    }


    function renderExistingHmis() {
        if (!existingHmisBody) {
            return;
        }


        existingHmisBody.replaceChildren();


        if (existingHmis.length === 0) {
            renderEmptyHmis(
                "No HMI / WinCC software found in the open TIA project."
            );

            return;
        }


        for (
            const hmi
            of existingHmis
        ) {
            const row =
                document.createElement(
                    "tr"
                );


            for (const value of [
                hmi.device_name || "—",
                hmi.hmi_name || "—",
                hmi.ip_address || "—",
            ]) {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            }

            // Show the human-readable catalog model by default. The native
            // details marker is the only control for inspecting the full
            // TIA OrderNumber/TypeIdentifier, without another full-width row.
            const typeCell = document.createElement("td");
            typeCell.className = "hmi-model-cell";
            const modelName = hmi.model_name?.trim() || "Model unavailable";
            const typeIdentifiers = [
                ["HMI type identifier", hmi.hmi_type_identifier],
                ["Device type identifier", hmi.device_type_identifier],
            ].filter((entry, index, all) => entry[1]
                && !all.slice(0, index).some((earlier) =>
                    earlier[1] === entry[1]));
            if (typeIdentifiers.length > 0) {
                const details = document.createElement("details");
                details.className = "hmi-model-details";
                const summary = document.createElement("summary");
                summary.textContent = modelName;
                details.appendChild(summary);
                const detailBody = document.createElement("div");
                detailBody.className = "hmi-model-identifier";
                for (const [label, value] of typeIdentifiers) {
                    const line = document.createElement("div");
                    const heading = document.createElement("strong");
                    heading.textContent = label + ": ";
                    line.append(heading, document.createTextNode(value));
                    detailBody.appendChild(line);
                }
                details.appendChild(detailBody);
                typeCell.appendChild(details);
            } else {
                typeCell.textContent = modelName;
            }
            row.appendChild(typeCell);

            const softwareCell = document.createElement("td");
            softwareCell.textContent =
                hmi.software_name || hmi.software_type || "—";
            row.appendChild(softwareCell);


            const actionsCell =
                document.createElement(
                    "td"
                );

            actionsCell.className =
                "actions-cell";

            actionsCell.appendChild(
                createActionButton(
                    "Translate texts",
                    () =>
                        openHmiTranslation(
                            hmi
                        )
                )
            );

            row.appendChild(
                actionsCell
            );


            existingHmisBody.appendChild(
                row
            );
        }
    }


    function setHmiTranslationStatus(
        message,
        type = "normal"
    ) {
        if (!hmiTranslationStatus) {
            return;
        }

        hmiTranslationStatus.textContent =
            message;

        hmiTranslationStatus.classList.toggle(
            "error",
            type === "error"
        );

        hmiTranslationStatus.classList.toggle(
            "success",
            type === "success"
        );
    }


    function projectLanguageLabel(
        language
    ) {
        const roles = [];

        if (language.is_reference) {
            roles.push(
                "Reference"
            );
        }

        if (language.is_editing) {
            roles.push(
                "Editing"
            );
        }

        return (
            language.english_name
            +
            " ("
            +
            language.culture
            +
            ")"
            +
            (
                roles.length
                    ? " · " + roles.join(" / ")
                    : ""
            )
        );
    }


    function hmiScopeEnabled(scope) {
        if (scope === "project") return Boolean(hmiScopeProject?.checked);
        if (scope === "text_lists") return Boolean(hmiScopeLists?.checked);
        return false;
    }

    function hmiWorkScope() {
        if (hmiScopeEnabled("project") && hmiScopeEnabled("text_lists"))
            return "both";
        if (hmiScopeEnabled("project")) return "project";
        if (hmiScopeEnabled("text_lists")) return "text_lists";
        return null;
    }

    // Identical blue/white disclosure labels for both formats.
    function setHmiScanDetailLabel(element, title, status) {
        if (!element) return;
        const name = document.createElement("span");
        name.className = "hmi-scan-details-name";
        name.textContent = title;
        const detail = document.createElement("span");
        detail.className = "hmi-scan-details-status";
        detail.textContent = " — " + status;
        element.replaceChildren(name, detail);
    }

    function renderHmiScanSummary() {
        if (!hmiScanSummary) return;
        const parts = [];
        if (hmiScopeEnabled("project"))
            parts.push("Project texts (XLSX only, excludes Text lists): "
                + (hmiProjectScanMessage || "not scanned"));
        if (hmiScopeEnabled("text_lists"))
            parts.push("Text lists (XML only): "
                + (hmiTextListsScanMessage || "not scanned"));
        hmiScanSummary.textContent = parts.length ? parts.join("\n")
            : "Select Project texts, Text lists, or both to enable Scan.";
    }

    function applyHmiScope() {
        const scope = hmiWorkScope();
        for (const element of hmiScopeSections) {
            if (element.closest(".hmi-automation-controls")) {
                // Detailed XLSX/XML backend state is diagnostic, not another UI.
                element.classList.add("hidden");
                continue;
            }
            element.classList.toggle("hidden",
                !hmiScopeEnabled(element.dataset.hmiScope));
        }
        hmiPreviewResults?.classList.add("hidden");
        hmiReviewResults?.classList.add("hidden");
        if (hmiTextListDetails) hmiTextListDetails.open = false;
        if (hmiProjectTextDetails) hmiProjectTextDetails.open = false;
        hmiAutomationControls?.classList.toggle("hidden", !scope);
        if (hmiScanButton) {
            hmiScanButton.textContent = scope === "both"
                ? "Scan selected texts (XLSX + XML)"
                : scope === "project" ? "Scan Project texts"
                : scope === "text_lists" ? "Scan Text lists"
                : "Select scope to scan";
        }
        if (hmiScanInstruction) {
            hmiScanInstruction.textContent = scope === "both"
                ? "Scan reads both formats separately; details and import controls share Steps 1–3."
                : scope ? "Scan is read-only and uses only the selected type."
                : "Select at least one text type to enable Scan.";
        }
        renderHmiScanSummary();
    }

    function hmiTranslationSelection() {
        const hmi = selectedHmiForTranslation;
        const processId = selectedProcessId();
        const sourceCulture = hmiSourceLanguageSelect?.value?.trim();
        const targetCulture = hmiTargetLanguageSelect?.value?.trim();
        if (!hmi || !processId || !sourceCulture || !targetCulture
            || sourceCulture === targetCulture) {
            return null;
        }
        return {
            process_id: processId,
            device_name: hmi.device_name,
            hmi_name: hmi.hmi_name,
            view_path_root: hmiViewPathRootSelect?.value || null,
            ollama_model: hmiOllamaModelSelect?.value || null,
            // The GUI always translates; API-only callers may still use "copy".
            translation_strategy: "ollama",
            source_culture: sourceCulture,
            target_culture: targetCulture,
        };
    }

    // A scan verifies the HMI/project/languages/root, not the Ollama model.
    // Keep review identity model-sensitive through hmiTranslationKey().
    function hmiScanKey(selection, scope = "project") {
        if (!selection) {
            return null;
        }
        return JSON.stringify({
            scope,
            process_id: selection.process_id,
            device_name: selection.device_name,
            hmi_name: selection.hmi_name,
            view_path_root: scope === "project" ? selection.view_path_root : null,
            source_culture: selection.source_culture,
            target_culture: selection.target_culture,
        });
    }

    function hmiTranslationKey(selection) {
        return selection ? JSON.stringify(selection) : null;
    }

    function addHmiTextCell(row, value, title = "") {
        const cell = document.createElement("td");
        cell.textContent = String(value ?? "");
        if (title) {
            cell.title = title;
        }
        row.appendChild(cell);
        return cell;
    }

    function addHmiDetailsCell(row, viewPath, category, sheet, rowIndex) {
        const cell = document.createElement("td");
        const details = document.createElement("details");
        details.className = "hmi-row-details";
        const summary = document.createElement("summary");
        summary.textContent = "Path";
        details.appendChild(summary);
        const body = document.createElement("div");
        body.className = "hmi-row-meta";
        const label = [category, sheet && ("Sheet: " + sheet),
            rowIndex && ("Row: " + rowIndex)].filter(Boolean).join(" · ");
        const metadata = document.createElement("small");
        metadata.textContent = label;
        const path = document.createElement("div");
        path.textContent = String(viewPath ?? "");
        body.append(metadata, path);
        details.appendChild(body);
        cell.appendChild(details);
        row.appendChild(cell);
    }

    function renderHmiPreviewRows() {
        hmiPreviewRows?.replaceChildren();
        if (!hmiScopeEnabled("project")) return;
        const selected = hmiPreviewFilter?.value || "matched";
        const subset = lastHmiPreviewRows.filter(item =>
            Boolean(item.matches_hmi) === (selected === "matched")
        );
        for (const item of subset) {
            const row = document.createElement("tr");
            addHmiTextCell(row, item.source_text);
            addHmiTextCell(row, item.target_text || "— (empty)");
            addHmiTextCell(row, item.category);
            addHmiDetailsCell(row, item.reference, item.category,
                item.sheet, item.row);
            hmiPreviewRows?.appendChild(row);
        }
        if (hmiPreviewSampleCount) {
            hmiPreviewSampleCount.textContent =
                subset.length + " displayed sample(s)";
        }
    }

    function discardHmiReview() {
        preparedHmiReview = null;
        preparedHmiRepairId = null;
        hmiReviewResults?.classList.add("hidden");
        hmiReviewRows?.replaceChildren();
        hmiReviewSkipped?.classList.add("hidden");
        hmiReviewSkippedList?.replaceChildren();
        updateHmiTranslateButtonState();
    }

    function invalidateHmiPreview(resetQuota = true) {
        hmiSkippedManager.reset();
        hmiExistingQaResults?.classList.add("hidden");
        hmiExistingQaRows?.replaceChildren();
        if (hmiExistingQaStatus) hmiExistingQaStatus.textContent = "";
        if (hmiAuditExistingButton) hmiAuditExistingButton.disabled = true;
        verifiedHmiScanKey = null;
        verifiedHmiTextListsScanKey = null;
        hmiProjectScanMessage = null;
        hmiTextListsScanMessage = null;
        latestHmiScan = null;
        renderHmiScanSummary();
        hmiTextListsData = null;
        hmiTextListImportedCount = 0;
        hmiTextListProgressKey = null;
        if (resetQuota) hmiCombinedApprovedCount = 0;
        discardHmiTextListReview();
        if (hmiTextListSelect) {
            hmiTextListSelect.value = "";
        }
        hmiTextListCatalog?.replaceChildren();
        setHmiScanDetailLabel(
            hmiDedicatedTextLists, "Text lists", "not scanned · Details"
        );
        setHmiScanDetailLabel(
            hmiDedicatedProjectTexts, "Project texts", "not scanned · Details"
        );
        if (hmiProjectTextDetails) hmiProjectTextDetails.open = false;
        if (hmiTextListStatus) hmiTextListStatus.textContent = "";
        hmiTextListPreview?.classList.add("hidden");
        if (hmiTextListPreview) hmiTextListPreview.open = false;
        hmiTextListPreviewRows?.replaceChildren();
        if (hmiBatchTotalInput) {
            hmiBatchTotalInput.placeholder = "Scan selected texts to see combined total";
            renderHmiBatchPlan();
        }
        if (hmiScanInstruction) {
            hmiScanInstruction.textContent =
                "After scanning, the total appears below.";
        }
        hmiPreviewResults?.classList.add("hidden");
        lastHmiPreviewRows = [];
        renderHmiPreviewRows();
        discardHmiReview();
    }

    function manualHmiPrepareCount() {
        const size = Number(hmiBatchSizeInput?.value);
        const totalRaw = hmiBatchTotalInput?.value?.trim() || "";
        const total = totalRaw ? Number(totalRaw) : null;
        if (!Number.isInteger(size) || size < 1 || size > HMI_PROJECT_BATCH_MAX
            || (total !== null &&
                (!Number.isInteger(total) || total < 1 || total > 100000))) {
            return null;
        }
        const remaining = total === null
            ? size : Math.max(0, total - hmiCombinedApprovedCount);
        const queueRemaining = hmiReviewQueueActive
            ? Math.max(0, hmiReviewQueueQuota
                - (hmiCombinedApprovedCount - hmiReviewQueueStartApproved))
            : remaining;
        return Math.min(size, remaining, queueRemaining);
    }

    function eligibleXmlEntries() {
        if (!hmiScopeEnabled("text_lists")
            || hmiScanKey(hmiTranslationSelection(), "text_lists")
                !== verifiedHmiTextListsScanKey) return 0;
        return (hmiTextListsData?.lists || []).reduce((total, item) =>
            total + (Number.isInteger(item.eligible_missing_entries)
                ? item.eligible_missing_entries : 0), 0);
    }

    function nextEligibleTextList() {
        return (hmiTextListsData?.lists || []).find(item =>
            Number.isInteger(item.eligible_missing_entries)
                && item.eligible_missing_entries > 0
                && (!hmiReviewQueueActive || (
                    !hmiReviewQueueBlockedLists.has(item.name)
                    && item.eligible_missing_entries
                        > (hmiReviewQueueExcludedXml.get(item.name)?.size || 0)
                ))
        ) || null;
    }

    function combinedMissingCount() {
        const project = hmiScopeEnabled("project")
            && hmiScanKey(hmiTranslationSelection()) === verifiedHmiScanKey
            ? (latestHmiScan?.missingUnique || 0) : 0;
        return project + eligibleXmlEntries();
    }

    function textListBatchIdentity() {
        return hmiScanKey(hmiTranslationSelection(), "text_lists")
            + ":" + (hmiTextListSelect?.value || "");
    }

    function textListBatchCount() {
        const count = manualHmiPrepareCount();
        const list = nextEligibleTextList();
        if (!count || !list) return 0;
        const requestedTotal = hmiBatchTotalInput?.value?.trim();
        const remaining = requestedTotal
            ? Math.max(0, Number(requestedTotal) - hmiCombinedApprovedCount)
            : count;
        return Math.min(count, remaining, list.eligible_missing_entries, 50);
    }

    function nextHmiManualScope() {
        // One combined queue: all eligible Project texts BEFORE XML lists.
        const selection = hmiTranslationSelection();
        const projectVerified = hmiScopeEnabled("project")
            && hmiScanKey(selection) === verifiedHmiScanKey;
        if (projectVerified && latestHmiScan?.missingUnique) return "project";
        const xmlVerified = hmiScopeEnabled("text_lists")
            && hmiScanKey(selection, "text_lists") === verifiedHmiTextListsScanKey;
        if (xmlVerified && nextEligibleTextList()) return "text_lists";
        return null;
    }

    function syncHmiReviewPreview() {
        // Step 2 has NO placeholder preview: display the editor only after
        // an actual XML or XLSX preparation returned editable/rejected rows.
        const projectReview = hmiScopeEnabled("project")
            && hmiReviewResults
            && !hmiReviewResults.classList.contains("hidden")
            && Boolean(hmiReviewRows?.children.length
                || hmiReviewSkippedList?.children.length);
        const xmlReview = hmiScopeEnabled("text_lists")
            && hmiTextListReview
            && !hmiTextListReview.classList.contains("hidden")
            && Boolean(hmiTextListReviewRows?.children.length);
        const hasReview = Boolean(projectReview || xmlReview);
        if (!hmiEditDetails) return;
        const wasHidden = hmiEditDetails.classList.contains("hidden");
        hmiEditDetails.classList.toggle("hidden", !hasReview);
        if (!hasReview) {
            hmiEditDetails.open = false;
            if (hmiEditCaption) hmiEditCaption.textContent =
                "Translations are shown after preparing a batch";
            return;
        }
        if (hmiEditCaption) {
            const source = projectReview && xmlReview
                ? "Project texts + Text lists"
                : projectReview ? "Project texts" : "Text list";
            hmiEditCaption.textContent = source + " — editable prepared batch";
        }
        if (wasHidden) hmiEditDetails.open = true;
    }

    function updateHmiTranslateButtonState() {
        const selection = hmiTranslationSelection();
        const scanKey = hmiScanKey(selection);
        const reviewKey = hmiTranslationKey(selection);
        const scope = hmiWorkScope();
        const projectSelected = hmiScopeEnabled("project");
        const listsSelected = hmiScopeEnabled("text_lists");
        const isVerified = Boolean(scanKey && scanKey === verifiedHmiScanKey);
        const busy = hmiPreviewInProgress || hmiReviewInProgress
            || hmiBatchRunning || hmiBatchStarting || hmiAuditInProgress
            || hmiTextListBusy || hmiXmlAutoRunning || hmiUnifiedRunning;
        if (hmiScopeProject) hmiScopeProject.disabled = busy || hmiReviewQueueActive;
        if (hmiScopeLists) hmiScopeLists.disabled = busy || hmiReviewQueueActive;
        if (hmiReviewEachBatch) {
            hmiReviewEachBatch.disabled = false;
            const isReview = hmiReviewEachBatch.checked;
            const appliesToNextRun = busy && !hmiReviewQueueActive;
            if (hmiModeDescription) hmiModeDescription.textContent = isReview
                ? "ON: translate one batch → edit in Step 2 → approve in Step 3 → verified import → next batch."
                    + (appliesToNextRun ? " Changes apply to the next run." : "")
                : "OFF: translate and import automatically, with verification after every batch."
                    + (hmiReviewQueueActive
                        ? (hmiReviewQueuePending
                            ? " The prepared batch still requires approval; "
                                + "automatic mode applies after it is resolved."
                            : " Current reviewed queue switches at its next safe boundary.")
                        : "");
            if (hmiStep3Description) hmiStep3Description.textContent = isReview
                ? "Edit prepared translations in Step 2; approve and import each batch here in Step 3."
                : "Import eligible translations automatically for the checked types.";
        }
        if (hmiRunDescription) {
            const order = projectSelected && listsSelected
                ? "Project texts → Text lists"
                : projectSelected ? "Project texts"
                : listsSelected ? "Text lists" : "No text type selected";
            hmiRunDescription.textContent = "Queue: " + order
                + ". Checked types only. TIA imports are validated and verified.";
        }
        if (hmiQueueScopeNote) {
            const projectNote = "Project texts (XLSX): one HMI Project texts "
                + "work item, translated and verified in batches.";
            const xmlNote = "Text lists (XML): an entire XML Text list is "
                + "submitted to TIA for each import, one list at a time. "
                + "Unedited entries must be preserved and verified.";
            hmiQueueScopeNote.textContent = projectSelected && listsSelected
                ? projectNote + " " + xmlNote
                : projectSelected ? projectNote
                : listsSelected ? xmlNote
                : "Select at least one text type to populate the queue.";
        }
        // Keep a prepared XML review bound to its ORIGINAL Text list.
        // Selecting a new eligible list during a state refresh invalidates the
        // review token/identity and silently disables Approve & import.
        if (hmiTextListSelect && !hmiTextListReviewToken
            && !hmiTextListBusy && !hmiReviewQueuePending) {
            hmiTextListSelect.value = nextEligibleTextList()?.name || "";
        }
        const hasTranslationEngine = Boolean(selection?.ollama_model);
        const missingUnique = latestHmiScan?.missingUnique ?? 0;
        const batchSize = Number(hmiBatchSizeInput?.value);
        const totalRaw = hmiBatchTotalInput?.value?.trim() || "";
        const total = totalRaw ? Number(totalRaw) : null;
        const validBatchSize = Number.isInteger(batchSize)
            && batchSize >= 1 && batchSize <= HMI_PROJECT_BATCH_MAX;
        const validTotal = total === null || (Number.isInteger(total)
            && total >= 1 && total <= 100000
            && total <= combinedMissingCount() + hmiCombinedApprovedCount);
        const activeManualScope = nextHmiManualScope();
        const count = manualHmiPrepareCount();
        const quotaRemaining = total === null || hmiCombinedApprovedCount < total;
        if (hmiTranslateButton) {
            hmiTranslateButton.textContent = activeManualScope === "text_lists"
                ? "Prepare XML batch for review"
                : activeManualScope === "project"
                    ? "Prepare XLSX batch for review" : "Prepare selected batch";
            hmiTranslateButton.disabled = busy || hmiReviewQueueActive || !activeManualScope
                || !hasTranslationEngine || !validBatchSize || !validTotal
                || !count || !quotaRemaining;
            hmiTranslateButton.title = activeManualScope === "text_lists"
                ? "Automatically choose the next eligible Text list. "
                    + "Manual XML review and confirmation are required."
                : "Prepare one XLSX batch for manual review.";
        }
        if (hmiScanButton) {
            hmiScanButton.disabled = busy || hmiReviewQueueActive || !scope || !selection;
        }
        if (hmiAuditExistingButton) {
            hmiAuditExistingButton.disabled = busy || !projectSelected || !isVerified
                || !selection?.view_path_root;
        }
        if (hmiExistingQaReportButton) {
            hmiExistingQaReportButton.disabled = busy || !projectSelected || !isVerified
                || !selection?.view_path_root;
        }
        if (hmiQualityReportButton) {
            hmiQualityReportButton.disabled = busy || !projectSelected || !hmiBatchJobId;
        }
        if (hmiUseScanTotalButton) {
            hmiUseScanTotalButton.disabled = busy || !scope
                || combinedMissingCount() < 1;
        }
        if (hmiImportReviewedButton) {
            const projectReviewReady = projectSelected && isVerified
                && preparedHmiReview?.selectionKey === reviewKey;
            const xmlReviewReady = listsSelected && hmiTextListReviewToken
                && hmiTextListPreparedKey === textListReviewKey();
            hmiImportReviewedButton.disabled = busy
                || !(projectReviewReady || xmlReviewReady)
                || (hmiReviewQueueActive && (!hmiReviewQueuePending
                    || Boolean(hmiReviewQueueOperation)
                    || hmiReviewQueuePaused
                    || hmiReviewQueueStopRequested));
            hmiImportReviewedButton.classList.toggle("hidden",
                !hmiReviewQueuePending);
            hmiImportReviewedButton.textContent = "Approve & import reviewed batch";
        }
        // XML imports use their own one-list-at-a-time validated protocol.
        if (hmiXmlAutoStart) {
            hmiXmlAutoStart.disabled = busy || !listsSelected
                || hmiScanKey(selection, "text_lists")
                    !== verifiedHmiTextListsScanKey
                || !hasTranslationEngine || !validBatchSize || !validTotal
                || !quotaRemaining || eligibleXmlEntries() < 1;
        }
        if (hmiXmlAutoPause) {
            hmiXmlAutoPause.disabled = !hmiXmlAutoRunning
                || hmiXmlAutoPauseRequested;
        }
        if (hmiBatchStartButton) {
            const projectReady = !projectSelected || (isVerified
                && (missingUnique === 0 || Boolean(selection?.view_path_root)));
            const xmlReady = !listsSelected || (
                hmiScanKey(selection, "text_lists") === verifiedHmiTextListsScanKey
            );
            const cannotStart = busy || !scope || !selection || !hasTranslationEngine
                || !validBatchSize || !validTotal || !quotaRemaining
                || combinedMissingCount() < 1 || !projectReady || !xmlReady;
            hmiBatchStartButton.disabled = cannotStart || hmiReviewQueueActive;
            if (hmiBatchReadiness) {
                let hint = "";
                if (!scope || !selection) {
                    hint = "Select a text type, HMI and distinct source/target languages.";
                } else if (hmiReviewQueueActive) {
                    if (hmiReviewQueueOperation === "awaiting confirmation") {
                        hint = "Confirmation required: approve the prepared "
                            + "TIA import in the dialog, or cancel it safely.";
                    } else if (hmiReviewQueueOperation === "importing / verifying") {
                        hint = "TIA import and independent verification in progress. "
                            + "The next batch will not start before verification.";
                    } else if (hmiReviewQueueOperation === "preparing") {
                        hint = "Ollama is preparing and validating the next batch. "
                            + "TIA has not been modified by this preparation.";
                    } else if (hmiReviewQueuePaused) {
                        hint = "Translation paused. Resume or stop the queue.";
                    } else if (hmiReviewQueuePending) {
                        hint = "Batch prepared. Review in Step 2, then approve "
                            + "or skip in Step 3.";
                    } else {
                        hint = "Reviewed translation queue is active.";
                    }
                } else if (busy) {
                    hint = "An HMI operation is in progress.";
                } else if (!projectReady || !xmlReady) {
                    hint = "Scan every checked text type before translating.";
                } else if (!hasTranslationEngine) {
                    hint = "Select an installed Ollama model.";
                } else if (!validBatchSize || !validTotal) {
                    hint = "Use a batch size 1–50 and a valid shared total.";
                } else if (!quotaRemaining || combinedMissingCount() < 1) {
                    hint = "No eligible missing targets remain under the shared limit.";
                } else {
                    const stages = projectSelected && listsSelected
                        ? "Project texts → Text lists"
                        : projectSelected ? "Project texts" : "Text lists";
                    hint = "Ready: " + combinedMissingCount()
                        + " missing texts. Queue: " + stages + ".";
                }
                hmiBatchReadiness.textContent = hint;
            }
        }
        if (hmiBatchResumeButton) {
            hmiBatchResumeButton.classList.toggle("hidden",
                !hmiReviewQueuePaused);
            // Resume preserves a prepared batch in either mode. An in-flight
            // operation retains the lock until it settles.
            hmiBatchResumeButton.disabled = !hmiReviewQueuePaused || busy
                || Boolean(hmiReviewQueueOperation)
                || hmiReviewQueueStopRequested;
            hmiBatchResumeButton.textContent = "Resume review queue";
        }
        if (hmiBatchPauseButton) {
            hmiBatchPauseButton.disabled = (!hmiUnifiedRunning
                || hmiUnifiedPauseRequested)
                && (!hmiReviewQueueActive || hmiReviewQueuePaused);
        }
        if (hmiBatchStopButton) {
            const activeRun = hmiReviewQueueActive || hmiUnifiedRunning;
            const stopping = hmiReviewQueueStopRequested || hmiUnifiedStopRequested;
            hmiBatchStopButton.classList.toggle("hidden", !activeRun);
            hmiBatchStopButton.disabled = !activeRun || stopping;
            hmiBatchStopButton.title = "Stop after any in-progress TIA operation "
                + "has finished and been verified. Then re-enable scope checkboxes.";
        }
        if (hmiSkipReviewedButton) {
            hmiSkipReviewedButton.classList.toggle("hidden",
                !hmiReviewQueuePending);
            hmiSkipReviewedButton.disabled = busy || !hmiReviewQueuePending
                || Boolean(hmiReviewQueueOperation)
                || hmiReviewQueueStopRequested;
        }
        if (hmiBatchSizeInput) hmiBatchSizeInput.disabled = busy
            || hmiReviewQueueActive;
        if (hmiBatchTotalInput) hmiBatchTotalInput.disabled = busy
            || hmiReviewQueueActive;
        for (const control of [hmiSourceLanguageSelect, hmiTargetLanguageSelect,
            hmiViewPathRootSelect, hmiOllamaModelSelect]) {
            if (control) control.disabled = hmiReviewQueueActive;
        }
        // State changes (including asynchronous verified-import completion)
        // must update the queue table, not just the buttons. The table was
        // previously re-rendered only by Scan/settings, leaving stale
        // "Awaiting approval" cells visible after a completed run.
        renderHmiBatchPlan();
        syncHmiReviewPreview();
    }

    async function refreshHmiOllamaModels() {
        if (!hmiOllamaModelSelect) {
            return;
        }
        const previous = hmiOllamaModelSelect.value;
        hmiOllamaModelSelect.disabled = true;
        if (hmiRefreshOllamaModels) {
            hmiRefreshOllamaModels.disabled = true;
        }
        if (hmiOllamaStatus) {
            hmiOllamaStatus.textContent = "Reading installed models from local Ollama...";
        }
        try {
            const response = await getJson(
                "/api/v1/tia/hmis/translation-models"
            );
            hmiOllamaModelSelect.replaceChildren();
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "Select an installed Ollama model";
            hmiOllamaModelSelect.appendChild(placeholder);
            for (const name of response.models || []) {
                const option = document.createElement("option");
                option.value = name;
                option.textContent = name;
                hmiOllamaModelSelect.appendChild(option);
            }
            const available = response.models || [];
            const selected = available.includes(previous)
                ? previous : response.selected_model;
            if (selected && available.includes(selected)) {
                hmiOllamaModelSelect.value = selected;
            }
            if (hmiOllamaStatus) {
                hmiOllamaStatus.textContent = available.length === 0
                    ? "No Ollama models installed. Run ollama list or pull a model."
                    : available.length + " Ollama model(s) available."
                        + " Each local API request processes up to "
                        + response.request_batch_size + " text(s)."
                        + " No OpenAI API key is needed."
                        + (!selected && available.length > 1
                            ? " Choose a model from the list." : "");
            }
        } catch (error) {
            hmiOllamaModelSelect.replaceChildren();
            const errorOption = document.createElement("option");
            errorOption.value = "";
            errorOption.textContent = "Ollama unavailable";
            hmiOllamaModelSelect.appendChild(errorOption);
            if (hmiOllamaStatus) {
                hmiOllamaStatus.textContent = error.message;
            }
        } finally {
            hmiOllamaModelSelect.disabled = false;
            if (hmiRefreshOllamaModels) {
                hmiRefreshOllamaModels.disabled = false;
            }
            if (hmiOllamaModelSelect.value !== previous) {
                // A new model invalidates prepared proposals, never the HMI scan.
                discardHmiReview();
            } else {
                updateHmiTranslateButtonState();
            }
        }
    }


    function hmiBatchStorageKey() {
        const selection = hmiTranslationSelection();
        if (!selection?.view_path_root) {
            return null;
        }
        return "tia-hmi-batch-v1:" + [
            selection.process_id, selection.device_name,
            selection.view_path_root, selection.source_culture,
            selection.target_culture,
        ].join(":");
    }

    function savedHmiBatchJobId() {
        const key = hmiBatchStorageKey();
        if (!key) {
            return null;
        }
        try {
            return window.localStorage.getItem(key);
        } catch (_error) {
            return null;
        }
    }

    function saveHmiBatchJobId(jobId) {
        const key = hmiBatchStorageKey();
        if (key) {
            try {
                window.localStorage.setItem(key, jobId);
            } catch (_error) {
                // Persistence on the server is authoritative; localStorage
                // is only used to discover a saved job after page reload.
            }
        }
    }

    function setHmiBatchStatus(message, isError = false) {
        if (!hmiBatchStatus) {
            return;
        }
        hmiBatchStatus.textContent = message;
        hmiBatchStatus.classList.toggle("error", isError);
        hmiBatchStatus.classList.toggle("success", !isError);
    }

    function renderUnifiedHmiProgress() {
        if (hmiUnifiedRunning) {
            renderHmiBatchProgress(
                hmiUnifiedCarryVerified + hmiUnifiedXlsxVerified + hmiXmlAutoVerified,
                hmiUnifiedQuota);
        }
    }

    function renderHmiBatchProgress(completed, total) {
        const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
        const done = Math.max(0, Math.min(Number(completed) || 0, safeTotal));
        const percent = safeTotal ? 100 * done / safeTotal : 0;
        // A stopped or cleared run has no meaningful denominator. Its final
        // verified count is shown in the status and report; do not present
        // a misleading "0 / —" progress bar underneath it.
        hmiBatchProgressPanel?.classList.toggle("hidden", !safeTotal);
        if (hmiBatchProgress) {
            hmiBatchProgress.value = percent;
            hmiBatchProgress.setAttribute("aria-valuenow", String(Math.round(percent)));
        }
        if (hmiBatchProgressText) {
            hmiBatchProgressText.textContent = done + " / "
                + (safeTotal || "—") + " (" + Math.round(percent) + "%)";
        }
    }

    function renderHmiTranslationQueue() {
        if (!hmiTranslationQueue) return;
        hmiTranslationQueue.replaceChildren();
        const selection = hmiTranslationSelection();
        let position = 0;
        const append = (type, label, count, ready) => {
            const tr = document.createElement("tr");
            tr.className = "hmi-queue-row";
            addHmiTextCell(tr, ++position);
            const typeCell = document.createElement("td");
            if (type) {
                const icon = document.createElement("span");
                icon.className = "hmi-file-icon " + (
                    type === "project" ? "hmi-file-xlsx" : "hmi-file-xml"
                );
                icon.textContent = type === "project" ? "X" : "XML";
                icon.setAttribute("aria-hidden", "true");
                typeCell.append(icon, document.createTextNode(
                    type === "project" ? " Project texts" : " Text list"
                ));
            } else {
                typeCell.textContent = "—";
            }
            tr.appendChild(typeCell);
            addHmiTextCell(tr, label);
            addHmiTextCell(tr, String(count));
            const stateCell = document.createElement("td");
            const state = document.createElement("span");
            // During XML review, only the currently selected Text list owns
            // the review token; other rows must not all say "Awaiting approval".
            const currentItem = type === "project"
                || label === (hmiTextListSelect?.value || "");
            const running = hmiReviewQueueActive && currentItem
                && hmiReviewQueueCurrentScope === type;
            const reviewing = running && hmiReviewQueuePending;
            const operation = running ? hmiReviewQueueOperation : null;
            const importing = running && operation === "importing / verifying";
            const confirming = reviewing && operation === "awaiting confirmation";
            const awaiting = reviewing && !operation && !hmiReviewQueuePaused;
            const preparing = running && operation === "preparing";
            const paused = running && hmiReviewQueuePaused && !operation;
            const automatic = !hmiReviewQueueActive && (
                type === "project" ? hmiUnifiedRunning
                    && !hmiXmlAutoRunning : hmiXmlAutoRunning
            );
            const requested = Number(hmiBatchTotalInput?.value);
            const quotaReached = ready && requested > 0
                && hmiCombinedApprovedCount >= requested;
            const empty = ready && count === 0;
            const active = importing || confirming || awaiting
                || preparing || paused || automatic;
            state.className = "hmi-queue-status "
                + (awaiting || confirming ? "hmi-queue-reviewing"
                    : active ? "hmi-queue-running"
                    : empty || quotaReached ? "hmi-queue-done" : "hmi-queue-ready");
            state.textContent = importing ? "Importing / verifying in TIA"
                : confirming ? "Confirm import"
                : awaiting ? "Ready for approval"
                : preparing ? "Translating / preparing"
                : paused ? "Paused"
                : automatic ? "Automatic translation / import"
                : quotaReached ? "Limit reached — run complete"
                : empty ? "No missing targets"
                : ready ? "Ready to translate" : "Scan required";
            stateCell.appendChild(state);
            tr.appendChild(stateCell);
            hmiTranslationQueue.appendChild(tr);
        };
        // Project texts always precede individual XML Text lists.
        if (hmiScopeEnabled("project")) {
            const scanned = Boolean(selection && verifiedHmiScanKey
                && hmiScanKey(selection) === verifiedHmiScanKey);
            append("project", "HMI project texts",
                scanned ? (latestHmiScan?.missingUnique ?? 0) : "—", scanned);
        }
        if (hmiScopeEnabled("text_lists")) {
            const scanned = Boolean(selection && verifiedHmiTextListsScanKey
                && hmiScanKey(selection, "text_lists")
                    === verifiedHmiTextListsScanKey);
            if (!scanned) {
                append("text_lists", "Text lists", "—", false);
            } else {
                const lists = (hmiTextListsData?.lists || []).filter(item =>
                    Number.isInteger(item.eligible_missing_entries)
                    && item.eligible_missing_entries > 0);
                if (!lists.length) {
                    append("text_lists", "Text lists", 0, true);
                } else {
                    for (const list of lists) {
                        append("text_lists", list.name,
                            list.eligible_missing_entries, true);
                    }
                }
            }
        }
        if (!position) append(null, "Select text types to scan", "—", false);
    }

    function renderHmiBatchPlan() {
        renderHmiTranslationQueue();
        if (!hmiBatchPlan) return;
        const batch = Number(hmiBatchSizeInput?.value);
        const raw = hmiBatchTotalInput?.value?.trim() || "";
        const requested = raw ? Number(raw) : null;
        const eligible = combinedMissingCount();
        if (!Number.isInteger(batch) || batch < 1 || batch > 50
            || (requested !== null && (!Number.isInteger(requested)
                || requested < 1 || requested > 100000))) {
            hmiBatchPlan.textContent = "Batch size must be 1–50; total positive or blank.";
            return;
        }
        if (requested !== null && requested > eligible + hmiCombinedApprovedCount
            && eligible > 0) {
            hmiBatchPlan.textContent = "Requested total exceeds available readable "
                + "missing targets in the selected scopes (" + eligible
                + " remaining). Unsupported XML texts are excluded.";
            return;
        }
        const selectedTotal = requested ?? (eligible + hmiCombinedApprovedCount);
        const remaining = requested === null ? eligible
            : Math.min(eligible, Math.max(0, requested - hmiCombinedApprovedCount));
        // A shared quota can be complete while many HMI targets remain
        // untranslated. Report that explicitly instead of "No remaining
        // translations", which misleadingly sounds like the entire HMI is done.
        if (requested !== null && remaining === 0 && eligible > 0) {
            hmiBatchPlan.textContent = "Selected limit reached: "
                + Math.min(requested, hmiCombinedApprovedCount) + " / "
                + requested + " translations verified in TIA. "
                + eligible + " missing targets remain in the selected scopes. "
                + (hmiReviewQueueActive || hmiUnifiedRunning
                    ? "Finishing the current operation before closing the run."
                    : "Increase Total to translate, or scan again for a new run.");
            return;
        }
        const project = hmiScopeEnabled("project")
            && hmiScanKey(hmiTranslationSelection()) === verifiedHmiScanKey
                ? latestHmiScan?.missingUnique || 0 : 0;
        const xml = eligibleXmlEntries();
        const plannedScopes = [];
        if (hmiScopeEnabled("project"))
            plannedScopes.push(project + " Project texts translations (XLSX)");
        if (hmiScopeEnabled("text_lists"))
            plannedScopes.push(xml + " Text list entries (XML)");
        hmiBatchPlan.textContent = "Selected: "
            + (plannedScopes.length ? plannedScopes.join(" + ") : "no text types")
            + ". Batch size " + batch + " (max. entries per review); total "
            + (requested ?? selectedTotal) + "; remaining " + remaining
            + ". " + (remaining ? "About " + Math.ceil(remaining / batch)
                + " translation preparation(s)." : "No remaining translations.")
            + (hmiScopeEnabled("text_lists")
                ? " Each XML import sends one full Text list at a time."
                : "")
            + (hmiScopeEnabled("project") && hmiScopeEnabled("text_lists")
                ? " Order: Project texts then Text lists." : "");
    }

    function showHmiBatchJob(job) {
        hmiBatchJobId = job.job_id;
        // The unified workflow owns a shared counter (reviewed + XLSX + XML).
        // A per-job render here briefly replaced e.g. 5/10 with 0/5 during
        // review -> automatic continuation. Never mix the two denominators.
        if (hmiUnifiedRunning) {
            hmiUnifiedXlsxVerified = Number(job.completed_unique) || 0;
            renderUnifiedHmiProgress();
        } else {
            renderHmiBatchProgress(job.completed_unique, job.total_unique);
        }
        hmiSkippedManager.updateJob(job);
        const last = job.last_verified_batch;
        let message = "Job: " + job.status + " — "
            + "processed " + (job.processed_unique ?? job.completed_unique)
            + " / " + job.total_unique + " unique texts; "
            + "verified " + job.completed_unique + "; skipped "
            + (job.skipped_unique ?? 0) + "; "
            + job.completed_rows + " TIA rows verified. "
            + "Batch " + Math.min(job.batch_index, job.total_batches)
            + " / " + job.total_batches + ".";
        if (job.last_batch) {
            message += " Last batch: " + job.last_batch.verified_unique
                + " verified, " + job.last_batch.skipped_unique + " skipped, "
                + (job.last_batch.auto_repaired_unique ?? 0)
                + " auto-repaired.";
        } else if (last) {
            message += " Last verified batch: " + last.verified_unique
                + " unique texts, " + last.verified_rows + " HMI rows.";
        }
        if (job.skipped_unique && job.skipped_examples?.length) {
            const recent = job.skipped_examples[job.skipped_examples.length - 1];
            message += " Last skipped: " + recent.source.slice(0, 80)
                + " (" + recent.reason + ").";
        }
        if (job.error) {
            message += " ERROR: " + job.error;
        }
        if (job.note) {
            message += " " + job.note;
        }
        setHmiBatchStatus(message, Boolean(job.error)
            || job.status === "interrupted");
    }

    async function pollHmiBatchProgress(jobId) {
        try {
            const progress = await getJson(
                "/api/v1/tia/hmis/translation-progress/" + jobId
            );
            if (!hmiBatchRunning || hmiBatchJobId !== jobId) {
                return;
            }
            const labels = {
                exporting_project_texts: "TIA: exporting current texts",
                translating: "Ollama: translating",
                importing_to_tia: "TIA: importing and verifying this batch",
                verified: "TIA: batch verified",
                skipped: "Unsafe translations skipped (no TIA import)",
            };
            const label = labels[progress.stage] || progress.stage;
            setHmiBatchStatus(label + " — " + progress.completed
                + " / " + progress.total
                + " unique texts (" + (progress.percent ?? 0)
                + "%). Completed TIA batches are saved on disk.");
        } catch (_error) {
            // Polling can begin before the first recorded progress event.
        }
    }

    async function runHmiBatchLoop(jobId, retryFirst = false, forceAll = false) {
        if (hmiBatchRunning) {
            return;
        }
        hmiBatchRunning = true;
        hmiBatchPauseRequested = false;
        hmiBatchJobId = jobId;
        if (hmiUnifiedRunning) hmiRunBatchJobId = jobId;
        updateHmiTranslateButtonState();
        const timer = window.setInterval(
            () => { void pollHmiBatchProgress(jobId); }, 1800
        );
        let lastJob = null;
        try {
            let retry = retryFirst;
            while (!hmiBatchPauseRequested && !hmiUnifiedPauseRequested) {
                const job = await postJson(
                    "/api/v1/tia/hmis/batch-translations/" + jobId + "/next",
                    {retry_failed_batch: retry}
                );
                retry = false;
                lastJob = job;
                showHmiBatchJob(job);
                // Review can be enabled while this automatic batch is being
                // written. Do not interrupt that write. A "ready" response
                // is already a safe verified boundary, so stop this client
                // loop before it requests the next batch and hand the
                // remaining quota to the reviewed queue.
                if (hmiUnifiedReviewHandoffRequested) {
                    break;
                }
                if (job.status === "completed" || job.status === "paused") {
                    break;
                }
                if (job.status !== "ready" || (!forceAll && !hmiBatchAutoRepeat?.checked)) {
                    if (job.status === "ready") {
                        setHmiBatchStatus(
                            "Batch processed. Auto-continue is OFF. "
                            + "Click Resume saved job for the next batch."
                        );
                    }
                    break;
                }
            }
        } catch (error) {
            setHmiBatchStatus(
                "Batch stopped: " + error.message
                + ". Verified earlier batches remain recorded. "
                + "Check TIA before retrying an interrupted import.",
                true
            );
            return null;
        } finally {
            window.clearInterval(timer);
            hmiBatchRunning = false;
            updateHmiTranslateButtonState();
        }
        return lastJob;
    }

    // A single user confirmation starts the selected safe TIA import pipelines.
    // When both checkboxes are on, finish XLSX before importing the first XML list.
    async function translateAllSelectedHmi() {
        const options = arguments[0] || {};
        const confirmed = options.confirmed === true;
        const preserveRunReport = options.preserveRunReport === true;
        const carriedVerified = confirmed && preserveRunReport
            ? Math.max(0, Number(options.carriedVerified) || 0) : 0;
        let reviewHandoff = false;
        const selection = hmiTranslationSelection();
        const useProject = hmiScopeEnabled("project");
        const useXml = hmiScopeEnabled("text_lists");
        const projectCount = useProject ? (latestHmiScan?.missingUnique || 0) : 0;
        const xmlCount = useXml ? eligibleXmlEntries() : 0;
        const projectVerified = !useProject || (
            hmiScanKey(selection) === verifiedHmiScanKey
            && (projectCount === 0 || Boolean(selection?.view_path_root))
        );
        const xmlVerified = !useXml || (
            hmiScanKey(selection, "text_lists") === verifiedHmiTextListsScanKey
        );
        const size = Number(hmiBatchSizeInput?.value);
        const raw = hmiBatchTotalInput?.value?.trim() || "";
        const total = raw ? Number(raw) : null;
        const eligible = projectCount + xmlCount;
        const quota = total === null ? eligible
            : Math.min(eligible, Math.max(0, total - hmiCombinedApprovedCount));
        const valid = selection?.ollama_model && (useProject || useXml)
            && projectVerified && xmlVerified
            && Number.isInteger(size) && size >= 1 && size <= 50
            && (total === null || (Number.isInteger(total)
                && total >= 1 && total <= 100000
                && total <= eligible + hmiCombinedApprovedCount))
            && quota > 0;
        if (!valid || hmiUnifiedRunning || hmiBatchRunning || hmiBatchStarting
            || hmiXmlAutoRunning || hmiTextListBusy || hmiReviewInProgress
            || hmiPreviewInProgress || hmiAuditInProgress) {
            if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                "Scan all checked types and select a valid Ollama model, "
                + "batch size and shared total before translating.";
            return;
        }
        if (hmiReviewEachBatch?.checked && !confirmed) {
            await startReviewedHmiQueue({useProject, useXml, quota});
            return;
        }
        const order = [useProject && "Project texts (XLSX)",
            useXml && "Text lists (XML)"].filter(Boolean).join(" → ");
        if (!confirmed && !confirm(
            "TRANSLATE SELECTED HMI TEXTS?\n\n"
            + "Order: " + order + "\n"
            + "Ollama: " + selection.ollama_model + "\n"
            + "Batch size: " + size + "; remaining shared limit: " + quota
            + " texts.\n\n"
            + "Each batch is validated, imported and VERIFIED in TIA. "
            + "Unsafe entries are skipped. XML lists are processed one at a time. "
            + "No blind retry after an uncertain import. "
            + "Use a BACKUP/COPY of the TIA project."
        )) return;

        // A new run starts with normal progress styling.  A prior stopped
        // reviewed queue may have left this shared status box red.
        hmiUnifiedStatus?.classList.remove("error");
        if (!preserveRunReport) startHmiRunReport();
        hmiUnifiedRunning = true;
        hmiUnifiedStopRequested = false;
        hmiUnifiedPauseRequested = false;
        hmiUnifiedReviewHandoffRequested = false;
        // Switching from a reviewed queue keeps the original 10-text goal:
        // 5 verified + 5 remaining must be displayed as 5/10, not 0/5.
        hmiUnifiedCarryVerified = carriedVerified;
        hmiUnifiedQuota = quota + carriedVerified;
        hmiUnifiedXlsxVerified = 0;
        hmiXmlAutoVerified = 0;
        renderUnifiedHmiProgress();
        discardHmiTextListReview();
        discardHmiReview();
        updateHmiTranslateButtonState();
        try {
            if (useProject && projectCount > 0) {
                if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                    "Stage 1 — translating Project texts (XLSX)...";
                const job = await startHmiBatchImport(
                    {confirmed: true, forceAll: true}
                );
                if (hmiUnifiedReviewHandoffRequested
                    && Number(job?.completed_unique) > 0) {
                    reviewHandoff = true;
                    return;
                }
                if (!job || job.status !== "completed" || hmiUnifiedPauseRequested) {
                    if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                        "Stopped after XLSX: "
                        + (job?.status || "error / uncertain import")
                        + ". XML has NOT started. Inspect TIA before continuing.";
                    return;
                }
            }
            if (hmiUnifiedPauseRequested) {
                if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                    "Paused after XLSX. XML has not started.";
                return;
            }
            const quotaLeft = total === null ? eligibleXmlEntries()
                : Math.max(0, total - hmiCombinedApprovedCount);
            if (useXml && xmlCount > 0 && quotaLeft > 0) {
                if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                    "Stage " + (useProject ? "2" : "1")
                    + " — translating Text lists (XML) one list at a time...";
                // Re-scan XML after XLSX; no stale XML catalogues before writing.
                if (useProject && !(await scanHmiTextLists())) {
                    if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                        "XML re-scan failed after XLSX. No XML import started.";
                    return;
                }
                const result = await startAutomaticXmlBatches({confirmed: true});
                if (result !== "completed") {
                    if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                        "Stopped in XML (" + (result || "not started")
                        + "). Inspect TIA before attempting a retry.";
                    return;
                }
            }
            if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                "Finished: " + (hmiUnifiedCarryVerified
                    + hmiUnifiedXlsxVerified + hmiXmlAutoVerified)
                + " translations verified in TIA in this run ("
                + hmiUnifiedCarryVerified + " before automatic continuation, "
                + hmiUnifiedXlsxVerified + " automatic XLSX, "
                + hmiXmlAutoVerified + " automatic XML). "
                + "Skipped entries require manual review.";
        } catch (error) {
            if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                "Translation stopped: " + error.message
                + ". Check TIA before retrying an uncertain import.";
        } finally {
            if (useProject && hmiBatchJobId) await collectHmiXlsxRunSkips();
            hmiUnifiedRunning = false;
            const handoffToReview = reviewHandoff
                && !hmiUnifiedStopRequested;
            const verifiedForHandoff = hmiUnifiedCarryVerified
                + hmiUnifiedXlsxVerified + hmiXmlAutoVerified;
            const handoffQuota = hmiUnifiedQuota;
            if (handoffToReview && verifiedForHandoff < handoffQuota) {
                void startReviewedHmiQueue({
                    useProject,
                    useXml,
                    quota: handoffQuota,
                    initialVerified: verifiedForHandoff,
                    preserveRunReport: true,
                    skipConfirmation: true,
                });
            }
            hmiUnifiedReviewHandoffRequested = false;
            const wasStopped = hmiUnifiedStopRequested;
            hmiUnifiedStopRequested = false;
            hmiUnifiedPauseRequested = false;
            if (wasStopped) {
                // Clear only the finished run's visual progress. Confirmed
                // writes and the cumulative count remain intact in TIA.
                const verified = hmiUnifiedCarryVerified
                    + hmiUnifiedXlsxVerified + hmiXmlAutoVerified;
                if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                    "Translation stopped after current safe batch boundary. "
                    + verified + " translation(s) already verified in TIA. "
                    + "Progress cleared; scan again before a new run.";
                renderHmiBatchProgress(0, 0);
                // Cached scans are stale after a stopped write. Require a
                // fresh read-only scan before starting another run.
                verifiedHmiScanKey = null;
                verifiedHmiTextListsScanKey = null;
            }
            showHmiRunReport();
            renderHmiBatchPlan();
            updateHmiTranslateButtonState();
        }
    }

    function finishStoppedReviewedHmiQueue() {
        // Display the verified count in the final status and run report, not
        // in the progress bar for a run that has already been stopped.
        const verified = Math.max(0,
            hmiCombinedApprovedCount - hmiReviewQueueStartApproved);
        // Discard unimported proposals; the read-only preparation never
        // authorizes an implicit TIA write.
        discardHmiTextListReview();
        discardHmiReview();
        finishReviewedHmiQueue(
            "Translation stopped by user. " + verified
            + " translation(s) already verified in TIA. "
            + "Unimported proposals discarded. "
            + "Progress cleared; scan again before a new run."
        );
        renderHmiBatchProgress(0, 0);
        // A subsequent run must not use counts from a pre-Stop export.
        verifiedHmiScanKey = null;
        verifiedHmiTextListsScanKey = null;
        updateHmiTranslateButtonState();
    }

    function stopUnifiedHmiTranslation() {
        const reviewed = hmiReviewQueueActive;
        const automatic = hmiUnifiedRunning;
        if ((!reviewed && !automatic) || hmiReviewQueueStopRequested
            || hmiUnifiedStopRequested) return;
        if (!confirm(
            "STOP HMI TRANSLATION?\n\n"
            + "Prepared but unimported translations will be discarded. "
            + "Any operation already writing to TIA must finish and be verified "
            + "before the queue unlocks. Nothing will be retried automatically.\n"
            + "After stopping, you can change the Project texts/Text lists checkboxes."
        )) return;
        if (reviewed) {
            hmiReviewQueueStopRequested = true;
            hmiReviewQueuePaused = true;
            if (hmiReviewQueueOperation) {
                if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                    "Stop requested. Finishing current "
                    + hmiReviewQueueOperation + " operation safely; "
                    + "no next batch will start.";
                updateHmiTranslateButtonState();
                return;
            }
            finishStoppedReviewedHmiQueue();
            return;
        }
        // Automatic XLSX/XML have their own verified import boundaries.
        // They cannot be safely force-terminated during a TIA write.
        hmiUnifiedStopRequested = true;
        hmiUnifiedPauseRequested = true;
        if (hmiBatchRunning) void pauseHmiBatchImport();
        if (hmiXmlAutoRunning) pauseAutomaticXmlBatches();
        if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
            "Stop requested. Current TIA operation will finish verification; "
            + "the following batches will not start.";
        updateHmiTranslateButtonState();
    }

    function pauseUnifiedHmiTranslation() {
        if (hmiReviewQueueActive) {
            hmiReviewQueuePaused = true;
            if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                hmiReviewQueueOperation
                    ? "Pause requested. Finishing current "
                        + hmiReviewQueueOperation + " safely; no new import until Resume."
                    : "Queue paused. Prepared proposals are preserved; "
                        + "click Resume review queue to continue.";
            updateHmiTranslateButtonState();
            return;
        }
        if (!hmiUnifiedRunning || hmiUnifiedPauseRequested) return;
        hmiUnifiedPauseRequested = true;
        if (hmiBatchRunning) void pauseHmiBatchImport();
        if (hmiXmlAutoRunning) pauseAutomaticXmlBatches();
        if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
            "Pause requested. Current TIA batch will finish verification first.";
        updateHmiTranslateButtonState();
    }

    function startHmiRunReport() {
        hmiRunReport = [];
        hmiRunReportStartCount = hmiCombinedApprovedCount;
        hmiRunReportVerifiedCount = null;
        hmiRunBatchJobId = null;
        hmiRunStartedAt = new Date().toISOString();
        hmiRunReportSelection = hmiTranslationSelection();
        if (hmiRunReportButton) {
            hmiRunReportButton.disabled = true;
            hmiRunReportButton.classList.add("hidden");
        }
        if (hmiRunReportSummary) hmiRunReportSummary.textContent = "";
    }

    function appendHmiRunIssue(scope, name, source, proposal, reason, status = "Skipped") {
        const entry = {scope, name, source: source || "", proposal: proposal || "",
            reason: String(reason || "Not eligible"), status};
        if (!hmiRunReport.some(row => row.scope === entry.scope
            && row.name === entry.name && row.source === entry.source
            && row.proposal === entry.proposal && row.reason === entry.reason
            && row.status === entry.status)) hmiRunReport.push(entry);
    }

    function showHmiRunReport() {
        // Snapshot the final verified count before a later Scan resets the
        // session counter. A downloaded report must never become negative.
        hmiRunReportVerifiedCount = Math.max(0,
            hmiCombinedApprovedCount - hmiRunReportStartCount);
        if (hmiRunReportButton) {
            hmiRunReportButton.disabled = false;
            hmiRunReportButton.classList.remove("hidden");
        }
        if (hmiRunReportSummary) hmiRunReportSummary.textContent =
            hmiRunReport.length + " skipped/error detail(s). One combined report.";
    }


    // Read-only support snapshot. Intentionally excludes actual source texts,
    // target strings, review proposals and authentication material.
    function buildHmiDiagnostics() {
        const selection = hmiTranslationSelection();
        const requested = hmiBatchTotalInput?.value?.trim() || "";
        const runVerified = hmiRunReportVerifiedCount ?? Math.max(0,
            hmiCombinedApprovedCount - hmiRunReportStartCount);
        return {
            schema_version: 1,
            generated_at_utc: new Date().toISOString(),
            project_name: currentProjectName || null,
            hmi_name: selection?.hmi_name || null,
            source_culture: selection?.source_culture || null,
            target_culture: selection?.target_culture || null,
            scopes: {
                project_texts: hmiScopeEnabled("project"),
                text_lists: hmiScopeEnabled("text_lists"),
            },
            settings: {
                batch_size: Number(hmiBatchSizeInput?.value) || null,
                total_requested: requested ? Number(requested) : null,
                review_each_batch: Boolean(hmiReviewEachBatch?.checked),
            },
            scan: {
                project_current: Boolean(selection && verifiedHmiScanKey
                    && hmiScanKey(selection) === verifiedHmiScanKey),
                text_lists_current: Boolean(selection && verifiedHmiTextListsScanKey
                    && hmiScanKey(selection, "text_lists")
                        === verifiedHmiTextListsScanKey),
                project_missing_unique: latestHmiScan?.missingUnique ?? null,
                text_lists_eligible_missing: eligibleXmlEntries(),
            },
            counters: {
                verified_since_scan: hmiCombinedApprovedCount,
                current_run_verified: runVerified,
                current_run_error_count: hmiRunReport.length,
            },
            reviewed_queue: {
                active: hmiReviewQueueActive,
                pending: hmiReviewQueuePending,
                paused: hmiReviewQueuePaused,
                automatic_continuation_requested: hmiReviewQueueAutoContinue,
                stop_requested: hmiReviewQueueStopRequested,
                current_scope: hmiReviewQueueCurrentScope,
                operation: hmiReviewQueueOperation,
                quota: hmiReviewQueueQuota,
                verified_at_start: hmiReviewQueueStartApproved,
            },
            automatic_run: {
                running: hmiUnifiedRunning,
                pause_requested: hmiUnifiedPauseRequested,
                stop_requested: hmiUnifiedStopRequested,
                quota: hmiUnifiedQuota,
                carried_verified: hmiUnifiedCarryVerified,
                xlsx_verified: hmiUnifiedXlsxVerified,
                xml_verified: hmiXmlAutoVerified,
            },
            xlsx_job: {
                active: hmiBatchRunning,
                starting: hmiBatchStarting,
                paused_requested: hmiBatchPauseRequested,
                job_id: hmiBatchJobId || null,
            },
            xml_import: {
                active: hmiXmlAutoRunning,
                pause_requested: hmiXmlAutoPauseRequested,
                busy: hmiTextListBusy,
                selected_list_name: hmiTextListSelect?.value || null,
            },
            run_report_started_at_utc: hmiRunStartedAt,
            notice: "GUI state only. No TIA operations or source/target text "
                + "are included. Verified counters come from prior import confirmations.",
        };
    }

    function downloadHmiDiagnostics() {
        const snapshot = buildHmiDiagnostics();
        const blob = new Blob([JSON.stringify(snapshot, null, 2) + "\n"],
            {type: "application/json;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "TIA_HMI_diagnostics_"
            + snapshot.generated_at_utc.replace(/[:.]/g, "-") + ".json";
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    function downloadHmiRunReport() {
        if (!hmiRunStartedAt) return;
        const selection = hmiRunReportSelection || {};
        const verified = hmiRunReportVerifiedCount
            ?? Math.max(0, hmiCombinedApprovedCount - hmiRunReportStartCount);
        const rows = [["Type", "List / batch", "Source text", "Proposed text",
            "Reason", "Result", "HMI", "Started at (UTC)"]];
        rows.push(["SUMMARY", "Full selected XLSX + XML run", "", "",
            "Verified in TIA: " + verified + "; skipped/errors: "
            + hmiRunReport.length, "Report",
            selection.hmi_name || "", hmiRunStartedAt]);
        for (const issue of hmiRunReport) {
            rows.push([issue.scope, issue.name, issue.source, issue.proposal,
                issue.reason, issue.status, selection.hmi_name || "",
                hmiRunStartedAt]);
        }
        const safeCell = value => {
            let v = String(value ?? "");
            if (/^[=+@\-\t\r]/.test(v)) v = "'" + v;
            return '"' + v.replace(/"/g, '""') + '"';
        };
        const csv = "\ufeff" + rows.map(row => row.map(safeCell).join(";"))
            .join("\r\n");
        const url = URL.createObjectURL(new Blob(
            [csv], {type: "text/csv;charset=utf-8"}
        ));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "TIA_HMI_run_" + hmiRunStartedAt.replace(/[:.]/g, "-")
            + ".csv";
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    async function collectHmiXlsxRunSkips() {
        if (!hmiRunBatchJobId) return;
        try {
            const data = await getJson(
                "/api/v1/tia/hmis/batch-translations/"
                + encodeURIComponent(hmiRunBatchJobId) + "/skipped"
            );
            for (const item of data.items || []) {
                if (!item.resolved) appendHmiRunIssue("XLSX", "Project texts",
                    item.source, item.rejected_proposal, item.reason);
            }
        } catch (error) {
            appendHmiRunIssue("XLSX", "Quality report", "", "",
                "Skipped details unavailable: " + error.message, "Report error");
        }
    }

    function finishReviewedHmiQueue(message, isError = false) {
        hmiReviewQueueActive = false;
        hmiReviewQueuePaused = false;
        hmiReviewQueueStopRequested = false;
        hmiReviewQueueOperation = null;
        hmiReviewQueuePending = false;
        hmiReviewQueueAutoContinue = false;
        hmiReviewQueueCurrentScope = null;
        hmiReviewQueuePendingSkippedList = null;
        // A terminal queue cannot retain an editable, single-use import token.
        discardHmiReview();
        discardHmiTextListReview();
        if (isError) {
            verifiedHmiScanKey = null;
            verifiedHmiTextListsScanKey = null;
        }
        showHmiRunReport();
        if (hmiUnifiedStatus) {
            hmiUnifiedStatus.textContent = message;
            hmiUnifiedStatus.classList.toggle("error", isError);
        }
        updateHmiTranslateButtonState();
    }

    async function startReviewedHmiQueue({
        useProject, useXml, quota, initialVerified = 0,
        preserveRunReport = false, skipConfirmation = false,
    }) {
        // No writes here: each step uses prepare-translations or text-lists/prepare.
        if (hmiReviewQueueActive || !quota) return;
        if (!skipConfirmation && !confirm(
            "PREPARE REVIEWED HMI TRANSLATION QUEUE?\n\n"
            + "Review/edit each batch in Step 2; approve its import in Step 3.\n"
            + "After every verified import the next batch will be prepared.\n"
            + "Use a BACKUP/COPY of the TIA project."
        )) return;
        hmiReviewQueueActive = true;
        hmiReviewQueueStopRequested = false;
        hmiReviewQueueOperation = null;
        // This is a new queue, so an error style from a previous stopped
        // queue must not make normal Ollama progress look like a failure.
        hmiUnifiedStatus?.classList.remove("error");
        setHmiTranslationStatus("", "normal");
        hmiReviewQueuePending = false;
        hmiReviewQueueAutoContinue = false;
        hmiReviewQueuePaused = false;
        hmiReviewQueueQuota = quota;
        hmiReviewQueueStartApproved = hmiCombinedApprovedCount - initialVerified;
        hmiReviewQueueTypes = {project: useProject, text_lists: useXml};
        hmiReviewQueueProjectExhausted = false;
        hmiReviewQueueExcludedProject.clear();
        hmiReviewQueuePendingSkippedList = null;
        hmiReviewQueueBlockedLists.clear();
        hmiReviewQueueExcludedXml.clear();
        if (!preserveRunReport) startHmiRunReport();
        if (hmiEditDetails) hmiEditDetails.open = true;
        renderHmiBatchProgress(initialVerified, quota);
        updateHmiTranslateButtonState();
        await prepareNextReviewedHmiBatch();
    }

    async function prepareNextReviewedHmiBatch() {
        if (!hmiReviewQueueActive || hmiReviewQueuePending
            || hmiReviewQueueOperation) return;
        if (hmiReviewQueueStopRequested) {
            finishStoppedReviewedHmiQueue();
            return;
        }
        if (hmiReviewQueuePaused) {
            if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                "Queue paused between batches. Click Resume review queue "
                + "to prepare the next batch.";
            updateHmiTranslateButtonState();
            return;
        }
        const verified = hmiCombinedApprovedCount - hmiReviewQueueStartApproved;
        renderHmiBatchProgress(verified, hmiReviewQueueQuota);
        if (verified >= hmiReviewQueueQuota) {
            finishReviewedHmiQueue("Reviewed queue complete — "
                + verified + " translations verified in TIA.");
            return;
        }
        const remaining = hmiReviewQueueQuota - verified;
        const project = hmiReviewQueueTypes.project
            && !hmiReviewQueueProjectExhausted
            && hmiScopeEnabled("project") && (latestHmiScan?.missingUnique || 0) > 0;
        const xml = hmiReviewQueueTypes.text_lists
            && hmiScopeEnabled("text_lists") && Boolean(nextEligibleTextList());
        if (!project && !xml) {
            finishReviewedHmiQueue("Reviewed queue finished — "
                + verified + " verified in TIA. No more eligible targets.");
            return;
        }
        hmiReviewQueueCurrentScope = project ? "project" : "text_lists";
        const pendingListName = project ? null : nextEligibleTextList()?.name || null;
        if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
            "Preparing " + (project ? "Project texts" : "the next Text list")
            + " batch — maximum " + Math.min(Number(hmiBatchSizeInput?.value), remaining)
            + " translations. TIA is unchanged until you approve.";
        // A QA-only rejection does not exhaust all Project texts. The
        // preparation endpoint can exclude rejected sources and continue
        // with later eligible texts without attempting a TIA write.
        const excludedProjectBefore = hmiReviewQueueExcludedProject.size;
        let prepared = false;
        hmiReviewQueueOperation = "preparing";
        updateHmiTranslateButtonState();
        try {
            // Read-only preparation; never call an import endpoint here.
            prepared = project
                ? await translateSelectedHmi()
                : await prepareHmiTextList();
        } catch (error) {
            if (hmiReviewQueueStopRequested) {
                finishStoppedReviewedHmiQueue();
            } else {
                finishReviewedHmiQueue("Prepare failed: " + error.message, true);
            }
            return;
        } finally {
            hmiReviewQueueOperation = null;
        }
        if (hmiReviewQueueStopRequested) {
            finishStoppedReviewedHmiQueue();
            return;
        }
        if (!hmiReviewQueueActive) return;
        if (!prepared) {
            // All proposals in this Project texts batch may have failed QA.
            // Previously the whole XLSX scope was marked exhausted here,
            // even though later source texts had never been prepared.
            if (project && hmiReviewQueueExcludedProject.size > excludedProjectBefore) {
                if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                    "No safe XLSX proposals in this batch. "
                    + (hmiReviewQueueExcludedProject.size - excludedProjectBefore)
                    + " rejected by QA; checking later eligible Project texts. "
                    + "Nothing was written to TIA.";
                await prepareNextReviewedHmiBatch();
                return;
            }
            // No import occurred and no new sources were excluded: the
            // review cannot make further progress in this scope.
            if (project) hmiReviewQueueProjectExhausted = true;
            else if (pendingListName) {
                // No valid entries remaining for this specific list.
                hmiReviewQueueBlockedLists.add(pendingListName);
            }
            if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                "No safe proposal — skipped. Continuing with next queue item.";
            await prepareNextReviewedHmiBatch();
            return;
        }
        hmiReviewQueuePending = true;
        if (hmiEditDetails) hmiEditDetails.open = true;
        if (hmiEditCaption) hmiEditCaption.textContent =
            "Review " + (project ? "Project texts" : "Text list")
            + " batch — edit before approval";
        await continueReviewedQueueAutomatically();
    }

    async function approveReviewedHmiQueueBatch() {
        const automatic = arguments[0]?.automatic === true;
        if (!hmiReviewQueueActive || !hmiReviewQueuePending
            || hmiReviewQueueOperation || hmiReviewQueuePaused
            || hmiReviewQueueStopRequested) return;
        // A pending review keeps its manual boundary even when the checkbox
        // changed.  After an explicit approval, the latest checkbox value
        // controls continuation to the following batch.
        if (!automatic) {
            hmiReviewQueueAutoContinue = !hmiReviewEachBatch?.checked;
        }
        const before = hmiCombinedApprovedCount;
        const reviewListName = hmiReviewQueueCurrentScope === "text_lists"
            ? hmiTextListSelect?.value || "Text list" : "Project texts";
        hmiReviewQueueOperation = automatic
            ? "importing / verifying" : "awaiting confirmation";
        if (hmiUnifiedStatus) hmiUnifiedStatus.textContent = automatic
            ? "Automatic import approved — " + reviewListName
                + ". Validating the prepared batch before TIA write and verification."
            : "Confirmation required — " + reviewListName
                + ". Approve the import in the confirmation dialog. "
                + "Nothing is written until confirmed.";
        updateHmiTranslateButtonState();
        let completed;
        try {
            completed = await importSelectedHmiBatch({automatic});
        } catch (error) {
            completed = {state: "uncertain", detail: String(error.message || error)};
        } finally {
            hmiReviewQueueOperation = null;
        }
        // Stop must never hide uncertain TIA write status. A verified write is
        // allowed to finish, but the next batch must not start.
        if (hmiReviewQueueStopRequested
            && (completed === true || completed === "edit_invalid"
                || completed === "cancelled"
                || completed?.state === "verified_refresh_failed"
                || completed?.state === "prewrite_rejected")) {
            finishStoppedReviewedHmiQueue();
            return;
        }
        if (completed === "edit_invalid" || completed === "cancelled") {
            if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                completed === "edit_invalid"
                    ? "Validation rejected an edit before TIA import. Correct it in "
                        + "Step 2, then Approve & import in Step 3; queue is waiting."
                    : "Approval cancelled. Review remains editable and no import ran.";
            updateHmiTranslateButtonState();
            return;
        }
        const importType = hmiReviewQueueCurrentScope === "project"
            ? "XLSX" : "XML";
        if (completed?.state === "verified_refresh_failed") {
            renderHmiBatchProgress(
                hmiCombinedApprovedCount - hmiReviewQueueStartApproved,
                hmiReviewQueueQuota
            );
            appendHmiRunIssue(importType, reviewListName, "", "",
                completed.detail, "Verified in TIA — re-scan required");
            finishReviewedHmiQueue(
                importType + " import VERIFIED in TIA. "
                + "Follow-up read-only scan failed; no next batch imported. "
                + "Run a fresh scan before continuing. " + completed.detail, true);
            return;
        }
        if (completed?.state === "prewrite_rejected") {
            // Safely reject only this prepared item before any TIA write.
            // Other independent targets may proceed after a fresh scan.
            appendHmiRunIssue(importType, reviewListName, "", "",
                completed.detail, "Skipped — no import attempted");
            hmiReviewQueuePending = false;
            if (importType === "XML") {
                hmiReviewQueueBlockedLists.add(reviewListName);
                // The read-only rescan owns the operation until it settles.
                // Checkbox/Resume must not start another prepare concurrently.
                let refreshed = false;
                hmiReviewQueueOperation = "preparing";
                updateHmiTranslateButtonState();
                try {
                    refreshed = await scanHmiTextLists();
                } catch (error) {
                    appendHmiRunIssue(importType, reviewListName, "", "",
                        "Follow-up scan failed: " + String(error.message || error));
                } finally {
                    hmiReviewQueueOperation = null;
                }
                if (hmiReviewQueueStopRequested) {
                    finishStoppedReviewedHmiQueue();
                    return;
                }
                if (!refreshed) {
                    finishReviewedHmiQueue(
                        "XML skipped before import, but the next catalog scan "
                        + "failed. No further imports attempted.", true);
                    return;
                }
                await continueReviewedQueueAutomatically();
            } else {
                // Do not skip all XLSX texts because of one preflight issue.
                // Require a new scan rather than retrying a stale review.
                finishReviewedHmiQueue(
                    "XLSX was rejected BEFORE import: " + completed.detail
                    + ". Scan Project texts again before continuing.", true);
            }
            return;
        }
        // Unknown TIA write outcome MUST NEVER be treated as an ordinary skip.
        if (!completed || completed?.state === "uncertain"
            || hmiCombinedApprovedCount <= before) {
            const reason = completed?.detail
                || "No TIA import verification returned from the backend.";
            appendHmiRunIssue(importType,
                reviewListName, "", "", reason, "Interrupted — inspect TIA");
            finishReviewedHmiQueue(
                "Stopped: " + importType
                + "/TIA import status uncertain — " + reason
                + " Inspect TIA before retrying.", true
            );
            return;
        }
        hmiReviewQueuePending = false;
        // The prepared batch was already explicitly approved (manually or by
        // the mode latched before it was prepared).  Only now may a checkbox
        // change choose the mode for the following batch.
        hmiReviewQueueAutoContinue = !hmiReviewEachBatch?.checked;
        renderHmiBatchProgress(
            hmiCombinedApprovedCount - hmiReviewQueueStartApproved,
            hmiReviewQueueQuota
        );
        if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
            "Verified in TIA. Preparing next batch in queue...";
        await continueReviewedQueueAutomatically();
    }

    async function continueReviewedQueueAutomatically() {
        // One boundary for preparation, import completion, checkbox and Resume.
        // Keep this queue's quota, exclusions and latest mode for its lifetime;
        // handing it to the legacy automatic pipeline loses those invariants.
        if (!hmiReviewQueueActive || hmiReviewQueueOperation) return;
        if (hmiReviewQueueStopRequested) {
            finishStoppedReviewedHmiQueue();
            return;
        }
        if (hmiReviewQueuePaused) {
            if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                "Queue PAUSED. The prepared batch is preserved. Resume to continue.";
            updateHmiTranslateButtonState();
            return;
        }
        if (hmiReviewQueuePending) {
            if (hmiReviewQueueAutoContinue) {
                await approveReviewedHmiQueueBatch({automatic: true});
            } else {
                if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                    "Awaiting approval. Edit the proposals in Step 2, then click "
                    + "Approve & import reviewed batch in Step 3. No automatic import will occur.";
                updateHmiTranslateButtonState();
                hmiEditDetails?.scrollIntoView({behavior:"smooth", block:"nearest"});
            }
            return;
        }
        await prepareNextReviewedHmiBatch();
    }

    async function skipReviewedHmiQueueBatch() {
        if (!hmiReviewQueueActive || !hmiReviewQueuePending
            || hmiReviewQueueOperation || hmiReviewQueueStopRequested) return;
        if (!confirm("Skip THIS prepared batch WITHOUT importing it into TIA? "
            + "All skipped entries will appear in the combined run report. "
            + "Continue with the next eligible queue item?")) return;
        const project = hmiReviewQueueCurrentScope === "project";
        const name = project ? "Project texts" : hmiTextListSelect?.value || "Text list";
        if (project) {
            const editors = [...(hmiReviewRows?.querySelectorAll(
                "textarea.hmi-project-review-editor[data-source-text]") || [])];
            for (const element of editors) {
                appendHmiRunIssue("XLSX", name, element.dataset.sourceText,
                    element.value, "Reviewer skipped this prepared batch");
            }
            // Skip just the current candidate sources; proceed to later
            // eligible XLSX texts in following batches.
            for (const element of editors) {
                hmiReviewQueueExcludedProject.add(element.dataset.sourceText);
            }
            discardHmiReview();
        } else {
            for (const element of hmiTextListReviewRows?.querySelectorAll(
                "textarea[data-entry-index]") || []) {
                const row = element.closest("tr");
                appendHmiRunIssue("XML", name,
                    row?.cells?.[0]?.textContent || "", element.value,
                    "Reviewer skipped this prepared batch");
            }
            hmiReviewQueueBlockedLists.add(name);
            discardHmiTextListReview();
        }
        hmiReviewQueuePending = false;
        hmiReviewQueuePendingSkippedList = null;
        await prepareNextReviewedHmiBatch();
    }

    async function startHmiBatchImport({confirmed = false, forceAll = false} = {}) {
        const selection = hmiTranslationSelection();
        const scanKey = hmiScanKey(selection);
        if (!hmiScopeEnabled("project") || !selection || scanKey !== verifiedHmiScanKey
            || !selection.view_path_root
            || !selection.ollama_model) {
            setHmiBatchStatus(
                "Select an explicit HMI ViewPath root and click Scan HMI / Count texts first.",
                true
            );
            return;
        }
        const size = Number(hmiBatchSizeInput?.value);
        const totalString = hmiBatchTotalInput?.value?.trim() || "";
        const total = totalString ? Number(totalString) : null;
        if (!Number.isInteger(size) || size < 1 || size > HMI_PROJECT_BATCH_MAX
            || (total !== null &&
                (!Number.isInteger(total) || total < 1 || total > 100000))
            || (total !== null
                && total > combinedMissingCount() + hmiCombinedApprovedCount)) {
            setHmiBatchStatus(
                "Batch size must be 1–50; total must be empty or "
                + "between 1 and the missing-target unique-text count from the scan.",
                true
            );
            return;
        }
        const xlsxLimit = total === null ? null
            : Math.min(Math.max(0, total - hmiCombinedApprovedCount),
                latestHmiScan?.missingUnique || 0);
        if (xlsxLimit === 0) {
            setHmiBatchStatus("Shared Total to translate has already been reached.", true);
            return;
        }
        if (!confirmed && !confirm(
            "START AUTOMATIC XLSX-ONLY TIA IMPORT?\n\n"
            + "Translation via selected Ollama model: "
            + selection.ollama_model
            + "\nBatch size: " + size + " unique texts. Total: "
            + (xlsxLimit ?? latestHmiScan?.missingUnique ?? "all eligible")
            + ". Final batch will be smaller when needed."
            + "\nAutomatic continuation: "
            + (hmiBatchAutoRepeat?.checked ? "ON" : "OFF (one batch only)")
            + "\nText lists (XML) are EXCLUDED; use the separate XML workflow. "
            + "\n\nOnly missing or 'Text' XLSX targets are filled. "
            + "Each batch is imported and VERIFIED in TIA before the next. "
            + "Back up the project and do not edit it during import."
        )) {
            return;
        }
        hmiBatchStarting = true;
        updateHmiTranslateButtonState();
        setHmiBatchStatus("Initializing batch job from TIA project texts...");
        // Do not reset the shared progress after a reviewed batch has already
        // verified entries. The job-specific counter is displayed only alone.
        if (!hmiUnifiedRunning) {
            renderHmiBatchProgress(0, xlsxLimit ?? latestHmiScan?.missingUnique ?? 0);
        }
        try {
            const job = await postJson(
                "/api/v1/tia/hmis/batch-translations/start",
                {...selection, batch_size: size, total_to_translate: xlsxLimit}
            );
            hmiBatchJobId = job.job_id;
            saveHmiBatchJobId(job.job_id);
            showHmiBatchJob(job);
            const finished = await runHmiBatchLoop(job.job_id, false, forceAll);
            hmiCombinedApprovedCount += Number(finished?.completed_unique) || 0;
            return finished;
        } catch (error) {
            setHmiBatchStatus(error.message, true);
            return null;
        } finally {
            hmiBatchStarting = false;
            updateHmiTranslateButtonState();
        }
    }

    async function resumeHmiBatchImport() {
        if (!hmiScopeEnabled("project")) return;
        const jobId = savedHmiBatchJobId();
        if (!jobId) {
            setHmiBatchStatus("No saved job for this HMI.", true);
            return;
        }
        try {
            const job = await getJson(
                "/api/v1/tia/hmis/batch-translations/" + jobId
            );
            showHmiBatchJob(job);
            if (job.status === "completed") {
                return;
            }
            const selectedModel = hmiTranslationSelection()?.ollama_model;
            if (job.model !== selectedModel) {
                setHmiBatchStatus(
                    "Saved job uses model " + job.model
                    + ", while current selection is " + (selectedModel || "none")
                    + ". Select the original model to resume, or start a NEW job "
                    + "after checking TIA. Model changes never alter a saved job.",
                    true
                );
                return;
            }
            if (job.status === "processing") {
                setHmiBatchStatus(
                    "The batch is running in another request. Do not launch another import.",
                    true
                );
                return;
            }
            const uncertain = job.status === "error"
                || job.status === "interrupted";
            if (uncertain && !confirm(
                "Previous import may have partially modified TIA. "
                + "After checking the actual TIA text values, retry the "
                + "unfinished batch? Earlier verified batches will not be replayed."
            )) {
                return;
            }
            await runHmiBatchLoop(jobId, uncertain, true);
        } catch (error) {
            setHmiBatchStatus(error.message, true);
        }
    }

    async function pauseHmiBatchImport() {
        if (!hmiScopeEnabled("project")) return;
        if (!hmiBatchJobId || !hmiBatchRunning) {
            return;
        }
        hmiBatchPauseRequested = true;
        updateHmiTranslateButtonState();
        setHmiBatchStatus(
            "Pause requested. The current TIA import will finish and "
            + "be verified before the job stops."
        );
        try {
            await postJson(
                "/api/v1/tia/hmis/batch-translations/"
                + hmiBatchJobId + "/pause", {}
            );
        } catch (error) {
            setHmiBatchStatus(
                "Pause request could not be saved: " + error.message,
                true
            );
        }
    }



    async function downloadHmiReport(url, filename, requestBody = null) {
        const response = await fetch(url, requestBody
            ? {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(requestBody),
                cache: "no-store",
            }
            : {cache: "no-store"});
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || ("XLSX export failed ("
                + response.status + ")."));
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        try {
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
        } finally {
            // Revoke on the next event-loop turn, after click processing.
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        }
    }

    async function downloadHmiBatchQualityReport() {
        if (!hmiScopeEnabled("project") || !hmiBatchJobId || hmiBatchRunning) return;
        hmiQualityReportButton.disabled = true;
        setHmiBatchStatus("Downloading checkpoint quality XLSX...");
        try {
            await downloadHmiReport(
                "/api/v1/tia/hmis/batch-translations/"
                    + hmiBatchJobId + "/quality-report.xlsx",
                "HMI_batch_" + hmiBatchJobId.slice(0, 12) + "_quality.xlsx"
            );
            setHmiBatchStatus(
                "Batch quality XLSX downloaded from saved checkpoint. "
                + "TIA was not modified."
            );
        } catch (error) {
            setHmiBatchStatus("Quality XLSX: " + error.message, true);
        } finally {
            updateHmiTranslateButtonState();
        }
    }

    async function downloadHmiExistingQaReport() {
        const selection = hmiTranslationSelection();
        if (!hmiScopeEnabled("project") || !selection?.view_path_root
            || hmiScanKey(selection) !== verifiedHmiScanKey
            || hmiAuditInProgress || hmiBatchRunning) return;
        hmiAuditInProgress = true;
        updateHmiTranslateButtonState();
        if (hmiExistingQaStatus) {
            hmiExistingQaStatus.textContent =
                "Exporting all suspicious existing HMI targets to XLSX...";
        }
        try {
            await downloadHmiReport(
                "/api/v1/tia/hmis/audit-existing-translations/quality-report.xlsx",
                "HMI_existing_QA_quality.xlsx",
                selection
            );
            if (hmiExistingQaStatus) {
                hmiExistingQaStatus.textContent =
                    "Existing target QA XLSX downloaded. "
                    + "This audit did not modify TIA.";
            }
        } catch (error) {
            if (hmiExistingQaStatus) {
                hmiExistingQaStatus.textContent =
                    "QA XLSX export failed: " + error.message;
            }
        } finally {
            hmiAuditInProgress = false;
            updateHmiTranslateButtonState();
        }
    }



    function textListReviewKey() {
        const selection = hmiTranslationSelection();
        return hmiScanKey(selection, "text_lists") + ":"
            + (hmiTextListSelect?.value || "") + ":"
            + (selection?.ollama_model || "");
    }

    function hasTextListSelection() {
        const selection = hmiTranslationSelection();
        const list = (hmiTextListsData?.lists || [])
            .find(item => item.name === hmiTextListSelect?.value);
        const hasEligibleRows =
            Number.isInteger(list?.eligible_missing_entries)
                ? list.eligible_missing_entries > 0
                : Boolean(list?.preview_rows?.some(
                    entry => entry.supported && entry.source_text?.trim()
                        && (!entry.target_text?.trim()
                            || entry.target_text?.trim() === "Text")
                ) || (list?.entry_count_known
                    && list.entry_count > (list.preview_rows || []).length));
        return Boolean(hmiScopeEnabled("text_lists")
            && hmiScanKey(selection, "text_lists") === verifiedHmiTextListsScanKey
            && selection && hmiTextListsData?.lists?.length
            && hmiTextListSelect?.value && selection.ollama_model
            && hasEligibleRows && !hmiBatchRunning);
    }

    function discardHmiTextListReview() {
        hmiTextListReviewToken = null;
        hmiTextListPreparedKey = null;
        hmiTextListReview?.classList.add("hidden");
        hmiTextListReviewRows?.replaceChildren();
        if (hmiImportReviewedButton) hmiImportReviewedButton.disabled = true;
    }

    async function postTextListWithProgress(path, payload, listName, statusElement) {
        const progressId = crypto.randomUUID().replace(/-/g, "");
        let active = true;
        let polling = false;
        const labels = {
            exporting_text_list: "Exporting current XML (read-only)",
            translating: "Ollama translation",
            preparing_review: "Validating proposals / one repair attempt if needed",
            ready: "Review prepared — awaiting approval",
            validating_review: "Validating reviewed edits (no write yet)",
            importing_text_list: "Importing approved XML into TIA",
            verifying_text_list: "Re-exporting XML to verify actual TIA texts",
            verified: "XML translations verified in TIA",
            failed: "XML operation failed — see final diagnostic",
        };
        const poll = async () => {
            if (!active || polling) return;
            polling = true;
            try {
                const progress = await getJson(
                    "/api/v1/tia/hmis/translation-progress/" + progressId
                );
                if (!active) return;
                const text = listName + ": "
                    + (labels[progress.stage] || progress.stage)
                    + (progress.total ? " — " + progress.completed
                        + " / " + progress.total : "")
                    + ". Elapsed: " + progress.elapsed_seconds + " s.";
                if (statusElement) statusElement.textContent = text;
                if (hmiReviewQueueActive && hmiUnifiedStatus)
                    hmiUnifiedStatus.textContent = text;
                // Preparation/QA progress must never increment verified totals.
            } catch (_error) {
                // Polling may race the first event. The main POST owns errors.
            } finally {
                polling = false;
            }
        };
        const timer = window.setInterval(() => { void poll(); }, 1000);
        try {
            return await postJson(path, {...payload, progress_id: progressId});
        } finally {
            active = false;
            window.clearInterval(timer);
        }
    }

    async function prepareHmiTextList() {
        if (!hasTextListSelection() || hmiTextListBusy) return;
        const maxRows = textListBatchCount();
        if (!maxRows) return;
        // The queued caller already selected the intended Text list. Do not
        // reselect a different list here: it changes the review identity and
        // makes the prepared XML review impossible to import.
        const selection = hmiTranslationSelection();
        const identity = textListReviewKey();
        discardHmiTextListReview();
        hmiTextListBusy = true;
        updateHmiTranslateButtonState();
        if (hmiTextListStatus) {
            hmiTextListStatus.textContent = "Preparing missing targets in "
                + hmiTextListSelect.value + " — no import yet...";
        }
        try {
            const listName = hmiTextListSelect.value;
            const excluded = hmiReviewQueueExcludedXml.get(listName) || new Set();
            const result = await postTextListWithProgress(
                "/api/v1/tia/hmis/text-lists/prepare",
                {...selection, text_list_name: listName, max_rows: maxRows,
                    exclude_entry_indices: hmiReviewQueueActive
                        ? [...excluded] : []}, listName, hmiTextListStatus
            );
            if (identity !== textListReviewKey()) {
                if (hmiTextListStatus) hmiTextListStatus.textContent =
                    "XML batch prepared but HMI/TextList selection changed. "
                    + "The review was discarded without any TIA import.";
                return false;
            }
            hmiTextListReviewToken = result.review_id;
            hmiTextListPreparedKey = identity;
            if (hmiReviewQueueActive) {
                for (const item of result.skipped || []) {
                    appendHmiRunIssue("XML", listName,
                        item.source, item.proposal, item.reason);
                    excluded.add(item.entry_index);
                }
                hmiReviewQueueExcludedXml.set(listName, excluded);
            }
            if (hmiTextListReviewRows) {
                hmiTextListReviewRows.replaceChildren();
                for (const item of result.rows || []) {
                    const tr = document.createElement("tr");
                    addHmiTextCell(tr, item.source);
                    addHmiTextCell(tr, item.current_target || "—");
                    const td = document.createElement("td");
                    const textarea = document.createElement("textarea");
                    textarea.value = item.proposal;
                    textarea.dataset.entryIndex = String(item.entry_index);
                    textarea.setAttribute("aria-label",
                        "Proposed translation for entry " + item.entry_index);
                    td.appendChild(textarea);
                    tr.appendChild(td);
                    hmiTextListReviewRows.appendChild(tr);
                }
            }
            if (hmiTextListStatus) {
                const reasons = (result.skipped || [])
                    .slice(0, 3).map(x => x.source + ": " + x.reason).join("; ");
                hmiTextListStatus.textContent =
                    "Prepared " + result.approved_count
                    + " editable XML translations; "
                    + (result.skipped?.length || 0)
                    + " skipped by QA."
                    + (reasons ? " Examples: " + reasons : "")
                    + " Edit them here in Step 2, then select "
                    + "Approve & import reviewed batch in Step 3. No TIA write occurred yet.";
            }
            if (result.review_id) {
                hmiTextListReview?.classList.remove("hidden");
                setHmiTranslationStatus("", "normal");
            }
            return Boolean(result.review_id && result.approved_count);
        } catch (error) {
            if (hmiTextListStatus)
                hmiTextListStatus.textContent = "Prepare failed: " + error.message;
            if (hmiReviewQueueActive) {
                appendHmiRunIssue("XML", hmiTextListSelect?.value || "Text list",
                    "", "", "Read-only preparation failed: " + error.message,
                    "Skipped list");
            }
            return false;
        } finally {
            hmiTextListBusy = false;
            updateHmiTranslateButtonState();
        }
    }

    async function importReviewedHmiTextList() {
        const automatic = arguments[0]?.automatic === true;
        if (hmiTextListBusy) {
            return {state: "prewrite_rejected",
                detail: "TextList operation is already in progress. "
                    + "No second import was attempted."};
        }
        if (!hmiTextListReviewToken) {
            return {state: "prewrite_rejected",
                detail: "No prepared XML review token. "
                    + "Prepare a batch before importing; no write attempted."};
        }
        if (hmiTextListPreparedKey !== textListReviewKey()) {
            return {state: "prewrite_rejected",
                detail: "Selected HMI/TextList/model changed since XML preparation. "
                    + "No import attempted. Prepare a fresh review."};
        }
        const listName = hmiTextListSelect.value;
        const selected = [...(hmiTextListReviewRows
            ?.querySelectorAll("textarea[data-entry-index]") || [])]
            .map(element => ({
                entry_index: Number(element.dataset.entryIndex),
                proposal: element.value,
            }));
        if (!selected.length) return "edit_invalid";
        if (!automatic && !confirm(
            "Import reviewed translations into TIA?\n\n"
            + "ONLY Text list: " + listName + "\n"
            + "Entries: " + selected.length + "\n\n"
            + "This overrides the selected list XML, preserves the other "
            + "lists, and verifies every entry by re-export.\n"
            + "Use a BACKUP/COPY of the TIA project for the first import."
        )) {
            if (hmiUnifiedStatus && hmiReviewQueueActive) {
                hmiUnifiedStatus.textContent =
                    "XML approval cancelled. Nothing imported. Edit in Step 2 "
                    + "or click Approve & import again in Step 3.";
            }
            return "cancelled";
        }
        const token = hmiTextListReviewToken;
        const batchIdentity = textListBatchIdentity();
        if (hmiReviewQueueActive) {
            hmiReviewQueueOperation = "importing / verifying";
        }
        // Keep editable proposals visible during server-side QA; only the
        // server consumes the review token once all pre-write checks pass.
        hmiTextListBusy = true;
        if (hmiUnifiedStatus && hmiReviewQueueActive) {
            hmiUnifiedStatus.textContent =
                "Sending reviewed XML import for " + listName + " ("
                + selected.length + " entries). Validating, writing into "
                + "TIA and verifying by independent re-export.";
        }
        updateHmiTranslateButtonState();
        if (hmiTextListStatus)
            hmiTextListStatus.textContent = "Importing and verifying " + listName + "...";
        try {
            const result = await postTextListWithProgress(
                "/api/v1/tia/hmis/text-lists/import",
                {review_id: token, proposals: selected}, listName, hmiTextListStatus
            );
            // Only the backend's confirmed re-export is evidence of a TIA write.
            if (result.status !== "verified"
                || !Number.isInteger(result.verified_entries)
                || result.verified_entries !== selected.length) {
                throw new Error("TIA returned an unexpected XML verification result. "
                    + "Inspect TIA; no automatic retry.");
            }
            if (hmiTextListProgressKey !== batchIdentity) {
                hmiTextListImportedCount = 0;
                hmiTextListProgressKey = batchIdentity;
            }
            hmiTextListImportedCount += result.verified_entries;
            hmiCombinedApprovedCount += result.verified_entries;
            if (hmiReviewQueueActive && hmiUnifiedStatus) {
                hmiUnifiedStatus.textContent = "TIA VERIFIED "
                    + result.verified_entries + " Text list entries in "
                    + listName + ". Refreshing the read-only XML scan.";
            }
            discardHmiTextListReview();
            // Refresh the selected list after a confirmed import to prepare
            // the next manual batch from currently empty targets only.
            let refreshed;
            try {
                refreshed = await scanHmiTextLists();
            } catch (error) {
                return {state: "verified_refresh_failed",
                    detail: "XML import verified in TIA, but follow-up scan failed: "
                        + String(error.message || error)};
            }
            if (hmiTextListStatus)
                hmiTextListStatus.textContent =
                    "Verified " + result.verified_entries + " entries in "
                    + result.text_list_name + ". Graphic lists untouched. "
                    + (refreshed
                        ? "XML preview refreshed. Prepare the next reviewed batch if needed."
                        : "Scan Text lists again before preparing another batch.");
            if (!refreshed) {
                // The backend has ALREADY independently re-exported and verified
                // this import. Failure of the following GUI catalog scan must
                // never be mistaken for uncertain write confirmation.
                return {state: "verified_refresh_failed",
                    detail: "XML import verified in TIA, but follow-up catalog scan failed. "
                        + "No further imports until a fresh scan succeeds."};
            }
            return true;
        } catch (error) {
            if (error.message?.includes("TEXT_LIST_REVIEW_EDIT_INVALID:")) {
                if (hmiTextListStatus) hmiTextListStatus.textContent =
                    "Manual XML edit rejected BEFORE import: " + error.message
                    + ". Correct the editable proposal and approve again.";
                return "edit_invalid";
            }
            const reason = String(error.message || error);
            // These messages originate before run_adapter(import-hmi-text-list).
            // They confirm that no TIA write was attempted: safely record and
            // skip rather than stopping every other list.
            const safePreflight = [
                "TextList changed since preparation. Nothing imported.",
                "No import was attempted.",
                "Cannot safely replace the list through XML.",
                "Prepared target was already populated.",
                "TextList entry changed since review.",
                "Review proposals do not match prepared TextList rows.",
            ].some(marker => reason.includes(marker));
            discardHmiTextListReview();
            if (hmiTextListStatus) {
                hmiTextListStatus.textContent = (safePreflight
                    ? "XML not imported (safe preflight rejection): "
                    : "XML import or verification uncertain: ")
                    + reason + (safePreflight
                        ? ". This list can be skipped and reported."
                        : ". Inspect TIA before retrying.");
            }
            return {state: safePreflight ? "prewrite_rejected" : "uncertain",
                detail: reason};
        } finally {
            hmiTextListBusy = false;
            updateHmiTranslateButtonState();
        }
    }

    // One explicit confirmation enables unattended XML imports for this run.
    // Every individual list is validated and verified by the EXISTING backend
    // endpoints. A failure or uncertain write stops the loop: no blind retries.
    async function startAutomaticXmlBatches({confirmed = false} = {}) {
        const selection = hmiTranslationSelection();
        const identity = hmiScanKey(selection, "text_lists");
        if (hmiXmlAutoRunning || hmiTextListBusy || hmiBatchRunning
            || !hmiScopeEnabled("text_lists") || !selection?.ollama_model
            || identity !== verifiedHmiTextListsScanKey) {
            if (hmiXmlAutoStatus)
                hmiXmlAutoStatus.textContent =
                    "Scan Text lists and choose an Ollama model first.";
            return;
        }
        const batchSize = Number(hmiBatchSizeInput?.value);
        const rawLimit = hmiBatchTotalInput?.value?.trim() || "";
        const total = rawLimit ? Number(rawLimit) : null;
        const remaining = total === null ? eligibleXmlEntries()
            : Math.max(0, total - hmiCombinedApprovedCount);
        if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50
            || (total !== null && (!Number.isInteger(total) || total < 1))
            || remaining <= 0 || eligibleXmlEntries() <= 0) {
            if (hmiXmlAutoStatus)
                hmiXmlAutoStatus.textContent =
                    "No eligible XML targets or invalid batch size/total.";
            return;
        }
        if (!confirmed && !confirm(
            "START UNATTENDED XML TEXT LIST IMPORT?\\n\\n"
            + "Project: " + currentProjectName + "\\n"
            + "HMI: " + selection.hmi_name + "\\n"
            + "Ollama: " + selection.ollama_model + "\\n"
            + "Max per batch: " + batchSize + "\\n"
            + "Remaining shared quota: " + remaining + "\\n\\n"
            + "All accepted plain-text proposals will be imported WITHOUT "
            + "individual manual approval. Each list is verified by re-export. "
            + "Unsupported/unsafe proposals are skipped.\\n"
            + "No automatic retry or resume after errors.\\n\\n"
            + "Continue ONLY with a backup/test copy of the TIA project?"
        )) return;

        hmiXmlAutoRunning = true;
        hmiXmlAutoPauseRequested = false;
        hmiXmlAutoVerified = 0;
        if (hmiXmlAutoProgress)
            hmiXmlAutoProgress.textContent = "Verified in TIA: 0";
        hmiTextListBusy = true;
        discardHmiTextListReview();
        discardHmiReview();
        const blockedLists = new Set();
        const rejectedIndicesByList = new Map();
        let completedBatches = 0;
        let xmlResult = "completed";
        updateHmiTranslateButtonState();
        try {
            while (!hmiXmlAutoPauseRequested && !hmiUnifiedPauseRequested) {
                if (hmiScanKey(hmiTranslationSelection(), "text_lists")
                    !== identity || !hmiScopeEnabled("text_lists")) {
                    throw new Error("HMI selection changed. Stop XML import.");
                }
                const quota = total === null ? eligibleXmlEntries()
                    : Math.max(0, total - hmiCombinedApprovedCount);
                const list = (hmiTextListsData?.lists || []).find(item =>
                    !blockedLists.has(item.name)
                    && Number.isInteger(item.eligible_missing_entries)
                    && item.eligible_missing_entries >
                        (rejectedIndicesByList.get(item.name)?.size || 0));
                if (!list || quota <= 0) break;
                const count = Math.min(
                    batchSize, quota, list.eligible_missing_entries, 50
                );
                completedBatches++;
                if (completedBatches > 500) {
                    throw new Error("XML safety cap (500 batches) reached. Rescan manually.");
                }
                if (hmiXmlAutoStatus)
                    hmiXmlAutoStatus.textContent = "XML batch "
                        + completedBatches + ": preparing " + count
                        + " entry/entries from " + list.name + "...";
                let prepared;
                try {
                    prepared = await postTextListWithProgress(
                        "/api/v1/tia/hmis/text-lists/prepare",
                        {...selection, text_list_name: list.name, max_rows: count,
                            exclude_entry_indices: [
                                ...(rejectedIndicesByList.get(list.name) || [])
                            ]}, list.name, hmiXmlAutoStatus
                    );
                } catch (error) {
                    // Prepare is read-only: an isolated failed list can be
                    // skipped without risking any unverified TIA writes.
                    appendHmiRunIssue("XML", list.name, "", "",
                        "Preparation failed before import: " + error.message,
                        "Skipped list");
                    blockedLists.add(list.name);
                    continue;
                }
                const excluded = rejectedIndicesByList.get(list.name) || new Set();
                for (const item of prepared.skipped || []) {
                    appendHmiRunIssue("XML", list.name,
                        item.source, item.proposal, item.reason);
                    excluded.add(item.entry_index);
                }
                rejectedIndicesByList.set(list.name, excluded);
                if (!prepared.review_id || !prepared.approved_count) {
                    // Read-only preparation rejected all selected entries.
                    // Their indices are excluded; other entries remain eligible.
                    if (!(prepared.skipped || []).length) blockedLists.add(list.name);
                    continue;
                }
                const proposals = (prepared.rows || []).map(row => ({
                    entry_index: row.entry_index,
                    proposal: row.proposal,
                }));
                if (proposals.length !== prepared.approved_count) {
                    appendHmiRunIssue("XML", list.name, "", "",
                        "Prepared XML row count mismatch; no import attempted",
                        "Skipped list");
                    blockedLists.add(list.name);
                    continue;
                }
                // Prepare is read-only and may take time (Ollama). Stop/Pause
                // requested while awaiting it must prevent a NEW TIA write.
                // A preexisting import is never aborted in the middle of write.
                if (hmiXmlAutoPauseRequested || hmiUnifiedPauseRequested
                    || hmiUnifiedStopRequested) {
                    xmlResult = "paused";
                    if (hmiXmlAutoStatus) hmiXmlAutoStatus.textContent =
                        "XML preparation finished after Stop/Pause. "
                        + "No new TIA import started.";
                    break;
                }
                if (hmiXmlAutoStatus)
                    hmiXmlAutoStatus.textContent = "XML batch "
                        + completedBatches + ": importing and verifying "
                        + proposals.length + " entries in " + list.name + "...";
                // One-shot review token; the server validates each proposal,
                // checks a fresh XML fingerprint, and re-exports after import.
                const result = await postTextListWithProgress(
                    "/api/v1/tia/hmis/text-lists/import",
                    {review_id: prepared.review_id, proposals}, list.name, hmiXmlAutoStatus
                );
                if (result.status !== "verified"
                    || result.verified_entries !== proposals.length) {
                    throw new Error("XML verification mismatch in " + list.name);
                }
                hmiXmlAutoVerified += result.verified_entries;
                hmiCombinedApprovedCount += result.verified_entries;
                renderUnifiedHmiProgress();
                hmiTextListImportedCount += result.verified_entries;
                if (hmiXmlAutoProgress)
                    hmiXmlAutoProgress.textContent = "Verified in TIA: "
                        + hmiXmlAutoVerified + " entries / "
                        + completedBatches + " batch(es)";
                // This is a fresh real XML export, not a cached count.
                const refreshed = await scanHmiTextLists();
                if (!refreshed) {
                    throw new Error("XML re-scan failed after verified import. "
                        + "Inspect TIA before continuing.");
                }
                // Individual unsafe XML indices remain excluded; continue
                // importing other valid entries from this same list.
            }
            if (hmiXmlAutoPauseRequested || hmiUnifiedPauseRequested)
                xmlResult = "paused";
            if (hmiXmlAutoStatus)
                hmiXmlAutoStatus.textContent =
                    (xmlResult === "paused" ? "PAUSED" : "COMPLETE")
                    + " — " + hmiXmlAutoVerified + " XML entries verified in TIA. "
                    + (blockedLists.size ? blockedLists.size
                        + " list(s) with skipped entries; inspect manually. " : "")
                    + "No XLSX Project texts changed by this operation.";
        } catch (error) {
            xmlResult = "error";
            if (hmiXmlAutoStatus)
                hmiXmlAutoStatus.textContent = "XML AUTOMATION STOPPED — "
                    + error.message + " Inspect the TIA project; do not "
                    + "automatically retry an uncertain XML import.";
        } finally {
            hmiXmlAutoRunning = false;
            hmiXmlAutoPauseRequested = false;
            hmiTextListBusy = false;
            updateHmiTranslateButtonState();
        }
        return xmlResult;
    }

    function pauseAutomaticXmlBatches() {
        if (!hmiXmlAutoRunning) return;
        hmiXmlAutoPauseRequested = true;
        if (hmiXmlAutoStatus)
            hmiXmlAutoStatus.textContent =
                "Pause requested — finishing the current XML batch safely...";
        updateHmiTranslateButtonState();
    }

    async function auditExistingHmiTranslations() {
        const selection = hmiTranslationSelection();
        if (!hmiScopeEnabled("project") || !selection?.view_path_root
            || hmiScanKey(selection) !== verifiedHmiScanKey
            || hmiAuditInProgress || hmiBatchRunning || hmiReviewInProgress) {
            if (hmiExistingQaStatus) {
                hmiExistingQaStatus.textContent =
                    "Choose the HMI ViewPath root and run Scan HMI first.";
            }
            return;
        }
        const scanKey = hmiScanKey(selection);
        hmiAuditInProgress = true;
        updateHmiTranslateButtonState();
        hmiExistingQaResults?.classList.add("hidden");
        hmiExistingQaRows?.replaceChildren();
        if (hmiExistingQaStatus) {
            hmiExistingQaStatus.textContent =
                "Read-only audit of all existing HMI target texts...";
        }
        try {
            const result = await postJson(
                "/api/v1/tia/hmis/audit-existing-translations", selection
            );
            if (hmiScanKey(hmiTranslationSelection()) !== scanKey) return;
            for (const finding of result.findings || []) {
                const row = document.createElement("tr");
                addHmiTextCell(row, finding.source_text);
                addHmiTextCell(row, finding.target_text);
                addHmiTextCell(row, (finding.reasons || []).join("; "));
                addHmiDetailsCell(
                    row, finding.view_path, "", finding.sheet, finding.row
                );
                hmiExistingQaRows?.appendChild(row);
            }
            hmiExistingQaResults?.classList.remove("hidden");
            if (hmiExistingQaStatus) {
                hmiExistingQaStatus.textContent =
                    "Audited " + result.scanned_rows + " HMI rows ("
                    + result.filled_target_rows + " filled targets). Found "
                    + result.suspicious_rows + " suspicious row(s). Showing "
                    + result.shown_rows + " of them. This is a heuristic "
                    + "review list, not proof of incorrect translation. "
                    + "No changes were made to TIA.";
            }
        } catch (error) {
            if (hmiExistingQaStatus) {
                hmiExistingQaStatus.textContent =
                    "Audit failed: " + error.message;
            }
        } finally {
            hmiAuditInProgress = false;
            updateHmiTranslateButtonState();
        }
    }



    function renderSelectedTextListPreview() {
        // Catalogue rows and their diagnostic content are rendered on Scan.
        // No separate selected-list preview or dropdown is needed.
        if (hmiTextListSelect)
            hmiTextListSelect.value = nextEligibleTextList()?.name || "";
        updateHmiTranslateButtonState();
    }

    async function scanHmiTextLists() {
        const selection = hmiTranslationSelection();
        if (!hmiScopeEnabled("text_lists") || !selection) return false;
        hmiPreviewInProgress = true;
        updateHmiTranslateButtonState();
        const scanKey = hmiScanKey(selection, "text_lists");
        if (hmiScanSummary) {
            hmiScanSummary.textContent =
                "Scanning only Classic Text lists (read-only XML export)...";
        }
        try {
            const data = await postJson(
                "/api/v1/tia/hmis/inspect-text-lists", selection
            );
            if (!hmiScopeEnabled("text_lists")
                || hmiScanKey(hmiTranslationSelection(), "text_lists") !== scanKey) return false;
            // TIA may move a replaced list to the end of its collection.
            // Keep the scanned queue order so all batches of that list finish
            // before either automatic or reviewed mode selects another list.
            const previousOrder = new Map((hmiTextListsData?.lists || [])
                .map((item, index) => [item.name, index]));
            data.lists?.sort((a, b) =>
                (previousOrder.get(a.name) ?? previousOrder.size)
                - (previousOrder.get(b.name) ?? previousOrder.size));
            hmiTextListsData = data;
            if (hmiTextListSelect)
                hmiTextListSelect.value = nextEligibleTextList()?.name || "";
            if (hmiTextListCatalog) {
                hmiTextListCatalog.replaceChildren();
                for (const item of data.lists || []) {
                    const detail = document.createElement("details");
                    detail.className = "hmi-text-list-catalog-item";
                    const summary = document.createElement("summary");
                    const eligible = Number.isInteger(item.eligible_missing_entries)
                        ? item.eligible_missing_entries : "unknown";
                    summary.textContent = item.name + " · "
                        + (item.entry_count_known
                            ? item.entry_count + " entries" : "count unknown")
                        + " · " + eligible + " eligible";
                    detail.appendChild(summary);
                    if (item.preview_warning) {
                        const warning = document.createElement("p");
                        warning.textContent = item.preview_warning;
                        detail.appendChild(warning);
                    }
                    const table = document.createElement("table");
                    table.className = "hmi-text-table";
                    const thead = document.createElement("thead");
                    const headRow = document.createElement("tr");
                    for (const heading of ["Entry", "Source / read-only diagnostic",
                            "Current target", "Translation eligibility"]) {
                        const th = document.createElement("th");
                        th.textContent = heading;
                        headRow.appendChild(th);
                    }
                    thead.appendChild(headRow);
                    table.appendChild(thead);
                    const tbody = document.createElement("tbody");
                    for (const entry of item.preview_rows || []) {
                        const row = document.createElement("tr");
                        addHmiTextCell(row, (entry.entry_index ?? 0) + 1);
                        addHmiTextCell(row,
                            entry.source_text || entry.preview_source || "—");
                        addHmiTextCell(row,
                            entry.target_text || entry.preview_target || "—");
                        addHmiTextCell(row, entry.supported
                            ? "Readable" : entry.reason || "Unsupported XML");
                        tbody.appendChild(row);
                    }
                    table.appendChild(tbody);
                    detail.appendChild(table);
                    hmiTextListCatalog.appendChild(detail);
                }
            }
            const entries = data.entry_count_known
                ? data.entry_count : "unknown";
            if (hmiDedicatedTextLists) {
                setHmiScanDetailLabel(
                    hmiDedicatedTextLists,
                    "Text lists",
                    data.text_list_count + " lists · " + entries
                        + " entries · Details"
                );
            }
            if (hmiScanInstruction) {
                hmiScanInstruction.textContent =
                    "Text lists scanned. See Details to inspect individual lists.";
            }
            if (hmiScanSummary) {
                hmiScanSummary.textContent =
                    data.text_list_count + " lists · " + entries
                    + " total entries · "
                    + (data.eligible_missing_known
                        ? data.eligible_missing_entries
                            + " readable entries with missing targets"
                        : "missing-target count unavailable")
                    + ". Graphic lists excluded; see Text lists Details.";
            }
            verifiedHmiTextListsScanKey = scanKey;
            renderSelectedTextListPreview();
            if (hmiBatchTotalInput)
                hmiBatchTotalInput.placeholder =
                    "Eligible selected scopes: " + combinedMissingCount();
            renderHmiBatchPlan();
            // Scan status belongs to Step 1. The Step 2 editor is hidden
            // until a real review is prepared; do not show obsolete hints
            // about separate manual and automatic XML workflows.
            setHmiTranslationStatus("", "normal");
            return true;
        } catch (error) {
            if (hmiScanSummary) {
                hmiScanSummary.textContent =
                    "Text lists scan failed: " + error.message;
            }
            if (hmiDedicatedTextLists) {
                setHmiScanDetailLabel(
                    hmiDedicatedTextLists, "Text lists",
                    "scan failed · Details"
                );
            }
            setHmiTranslationStatus(error.message, "error");
            return false;
        } finally {
            hmiTextListsScanMessage = hmiScanSummary?.textContent || null;
            renderHmiScanSummary();
            hmiPreviewInProgress = false;
            updateHmiTranslateButtonState();
        }
    }


    async function previewSelectedHmi(preserveQuota = false) {
        const scanProject = hmiScopeEnabled("project");
        const scanLists = hmiScopeEnabled("text_lists");
        if (!scanProject && !scanLists) return false;
        invalidateHmiPreview(!preserveQuota);
        // Serialize the Openness exports; keep XLSX and XML scan identities separate.
        let projectOk = true;
        let listsOk = true;
        if (scanProject) projectOk = await scanProjectHmiTexts();
        if (scanLists) listsOk = await scanHmiTextLists();
        return projectOk && listsOk;
    }

    async function scanProjectHmiTexts() {
        if (!hmiScopeEnabled("project")) return false;
        const selection = hmiTranslationSelection();
        if (!selection) {
            setHmiTranslationStatus("Select HMI, source slot and target language.", "error");
            return false;
        }

        hmiPreviewInProgress = true;
        updateHmiTranslateButtonState();
        if (hmiScanSummary) {
            hmiScanSummary.textContent =
                "Scanning TIA project texts for the selected HMI...";
        }
        if (hmiScanInstruction) {
            hmiScanInstruction.textContent =
                "Export in progress — TIA is read-only during this scan.";
        }
        setHmiTranslationStatus("Exporting Project texts for read-only preview...");
        const previewKey = hmiScanKey(selection);
        try {
            const result = await postJson("/api/v1/tia/hmis/preview-texts", selection);
            if (hmiScanKey(hmiTranslationSelection()) !== previewKey) {
                return false;
            }
            lastHmiPreviewRows = result.sample_rows || [];
            setHmiScanDetailLabel(
                hmiDedicatedProjectTexts, "Project texts",
                (result.matched_text_rows ?? 0) + " XLSX rows · "
                    + (result.matched_missing_target_unique_texts ?? 0)
                    + " missing targets · Details"
            );
            latestHmiScan = {
                rows: result.matched_text_rows ?? 0,
                unique: result.matched_unique_texts ?? 0,
                eligible: result.matched_eligible_unique_texts ?? 0,
                missingRows: result.matched_missing_target_rows ?? 0,
                missingUnique: result.matched_missing_target_unique_texts ?? 0,
                textListRows: result.matched_text_list_rows ?? 0,
                missingTextListRows: result.matched_missing_text_list_rows ?? 0,
                excludedGraphics: result.excluded_graphic_list_rows ?? 0,
            };
            if (hmiScanSummary) {
                hmiScanSummary.textContent =
                    latestHmiScan.rows + " XLSX rows · "
                    + latestHmiScan.unique + " unique source texts · "
                    + latestHmiScan.missingUnique
                    + " unique texts with missing or placeholder targets "
                    + "(" + latestHmiScan.missingRows + " rows). "
                    + "Project texts ONLY: excludes Text lists and Graphic lists. "
                    + "Missing counts are estimates.";
            }
            if (hmiBatchTotalInput) {
                hmiBatchTotalInput.placeholder =
                    "Eligible selected scopes: " + combinedMissingCount();
            }
            if (hmiScanInstruction) {
                hmiScanInstruction.textContent =
                    "Read-only scan finished. Use missing-target count to fill the field, "
                    + "or enter a smaller limit.";
            }
            renderHmiBatchPlan();
            renderHmiPreviewRows();

            if (hmiPreviewSummary) {
                hmiPreviewSummary.textContent =
                    `Source column: ${result.source_column_header || "unknown"}; `
                    + `target column: ${result.target_column_header || "unknown"}. `
                    + `${result.matched_text_rows} matched of ${result.total_text_rows} text rows `
                    + `across ${result.worksheets_found} sheet(s). `
                    + "Text and Graphic lists are excluded from Project texts. "
                    + "Rows below are samples, not the entire export.";
            }
            if (hmiViewPathRootSelect) {
                const currentRoot = hmiViewPathRootSelect.value;
                hmiViewPathRootSelect.replaceChildren();
                const automatic = document.createElement("option");
                automatic.value = "";
                automatic.textContent = "Automatic match (inventory device/HMI name)";
                hmiViewPathRootSelect.appendChild(automatic);
                for (const candidate of result.view_path_roots || []) {
                    const option = document.createElement("option");
                    option.value = candidate.root;
                    option.textContent = candidate.root + " (" + candidate.rows + " HMI row(s))";
                    hmiViewPathRootSelect.appendChild(option);
                }
                if ([...hmiViewPathRootSelect.options].some(option => option.value === currentRoot)) {
                    hmiViewPathRootSelect.value = currentRoot;
                }
                // Automatic matching is sufficient for a read-only scan but
                // batch import requires a specific HMI root. Promote the
                // result only if EVERY matched row has the same exact root.
                const matchedRoots = result.matched_view_path_roots || [];
                if (!currentRoot && matchedRoots.length === 1
                    && matchedRoots[0].rows === result.matched_text_rows) {
                    const root = matchedRoots[0].root;
                    if (![...hmiViewPathRootSelect.options].some(
                        option => option.value === root
                    )) {
                        const explicit = document.createElement("option");
                        explicit.value = root;
                        explicit.textContent = root + " (matched HMI root)";
                        hmiViewPathRootSelect.appendChild(explicit);
                    }
                    hmiViewPathRootSelect.value = root;
                    if (hmiScanInstruction) {
                        hmiScanInstruction.textContent =
                            "Read-only scan finished. Verified root "
                            + root + " selected automatically; batch import "
                            + "can now use this HMI only.";
                    }
                }
            }
            if (hmiPreviewReferences) {
                const sheets = (result.sheet_diagnostics || [])
                    .map(sheet => "Sheet " + sheet.sheet_name + "\n"
                        + sheet.sample_rows.join("\n"));
                const references = (result.reference_examples || []);
                hmiPreviewReferences.textContent =
                    "Raw sheet samples:\n" + sheets.join("\n\n")
                    + "\n\nFirst 50 ViewPaths:\n" + references.join("\n");
            }
            hmiPreviewResults?.classList.remove("hidden");
            if (result.matched_text_rows > 0) {
                // The dropdown may have been promoted from Automatic match
                // to its uniquely scanned root. Trust the result only if
                // the remaining selection is identical to the scanned one.
                const confirmed = hmiTranslationSelection();
                if (confirmed?.view_path_root !== selection.view_path_root) {
                    const roots = result.matched_view_path_roots || [];
                    const exact = roots.length === 1
                        && roots[0].root === confirmed?.view_path_root
                        && roots[0].rows === result.matched_text_rows;
                    if (!exact) {
                        setHmiTranslationStatus(
                            "The selected HMI root changed during scan. "
                            + "Scan HMI / Count texts again before importing.", "error"
                        );
                        return false;
                    }
                }
                verifiedHmiScanKey = hmiScanKey(confirmed);
                setHmiTranslationStatus(
                    `Preview found ${result.matched_text_rows} matching text row(s). `
                    + "Check the sample references before translating.", "success"
                );
                return true;
            } else {
                setHmiScanDetailLabel(
                    hmiDedicatedProjectTexts, "Project texts",
                    "no matching texts · Details"
                );
                if (hmiScanSummary) {
                    hmiScanSummary.textContent =
                        "Scan returned 0 texts for the current ViewPath root. "
                        + "Choose the correct root above (e.g. HMI_00_Main) "
                        + "and click Scan HMI / Count texts again.";
                }
                setHmiTranslationStatus(
                    "No matching HMI rows. Select the correct exported ViewPath root "
                    + "above, then click Scan HMI / Count texts again.", "error"
                );
                return false;
            }
        } catch (error) {
            setHmiScanDetailLabel(
                hmiDedicatedProjectTexts, "Project texts",
                "scan failed · Details"
            );
            if (hmiScanSummary) {
                hmiScanSummary.textContent =
                    "Scan failed: " + error.message;
            }
            setHmiTranslationStatus(error.message, "error");
            return false;
        } finally {
            hmiProjectScanMessage = hmiScanSummary?.textContent || null;
            renderHmiScanSummary();
            hmiPreviewInProgress = false;
            renderHmiBatchPlan();
            updateHmiTranslateButtonState();
        }
    }


    function populateHmiTranslationLanguages(preserveQuota = false) {
        if (
            !selectedHmiForTranslation
            ||
            !hmiSourceLanguageSelect
            ||
            !hmiTargetLanguageSelect
        ) {
            return;
        }

        const previousSource =
            hmiSourceLanguageSelect.value;

        const previousTarget =
            hmiTargetLanguageSelect.value;

        const activeLanguages =
            projectLanguages.filter(
                language =>
                    language.is_active
            );

        hmiSourceLanguageSelect.replaceChildren();

        const sourcePlaceholder =
            document.createElement(
                "option"
            );

        sourcePlaceholder.value = "";
        sourcePlaceholder.textContent =
            "Select TIA source slot";

        hmiSourceLanguageSelect.appendChild(
            sourcePlaceholder
        );

        for (
            const language
            of activeLanguages
        ) {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                language.culture;

            option.textContent =
                projectLanguageLabel(
                    language
                );

            hmiSourceLanguageSelect.appendChild(
                option
            );
        }

        const referenceLanguage =
            activeLanguages.find(
                language =>
                    language.is_reference
            );

        if (
            previousSource
            &&
            activeLanguages.some(
                language =>
                    language.culture
                    ===
                    previousSource
            )
        ) {
            hmiSourceLanguageSelect.value =
                previousSource;

        } else if (referenceLanguage) {
            hmiSourceLanguageSelect.value =
                referenceLanguage.culture;
        }

        const sourceCulture =
            hmiSourceLanguageSelect.value;

        hmiTargetLanguageSelect.replaceChildren();

        const targetPlaceholder =
            document.createElement(
                "option"
            );

        targetPlaceholder.value = "";
        targetPlaceholder.textContent =
            "Select target language";

        hmiTargetLanguageSelect.appendChild(
            targetPlaceholder
        );

        for (
            const language
            of projectLanguages
        ) {
            if (
                language.culture
                ===
                sourceCulture
            ) {
                continue;
            }

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                language.culture;

            option.textContent =
                projectLanguageLabel(
                    language
                )
                +
                (
                    language.is_active
                        ? ""
                        : " · will be added"
                );

            hmiTargetLanguageSelect.appendChild(
                option
            );
        }

        if (
            previousTarget
            &&
            previousTarget !== sourceCulture
            &&
            projectLanguages.some(
                language =>
                    language.culture
                    ===
                    previousTarget
            )
        ) {
            hmiTargetLanguageSelect.value =
                previousTarget;
        }

        invalidateHmiPreview(!preserveQuota);
    }


    function openHmiTranslation(
        hmi
    ) {
        selectedHmiForTranslation =
            hmi;
        if (hmiViewPathRootSelect) {
            hmiViewPathRootSelect.replaceChildren();
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "Automatic match (inventory device/HMI name)";
            hmiViewPathRootSelect.appendChild(option);
        }
        invalidateHmiPreview();

        if (hmiTranslationPanel) {
            hmiTranslationPanel.classList.remove(
                "hidden"
            );
        }

        if (hmiTranslationTitle) {
            hmiTranslationTitle.textContent =
                hmi.hmi_name
                ||
                hmi.device_name
                ||
                "HMI";
        }

        populateHmiTranslationLanguages();
        void refreshHmiOllamaModels();
        updateHmiTranslateButtonState();

        setHmiTranslationStatus(
            "Choose the TIA source slot containing the current texts and the target language. "
            +
            "The actual source language is detected from each text, so Polish text stored in an English slot is handled correctly."
        );

        hmiTranslationPanel
            ?.scrollIntoView(
                {
                    behavior: "smooth",
                    block: "nearest",
                }
            );
    }


    function resetHmiTranslation() {
        selectedHmiForTranslation =
            null;
        invalidateHmiPreview();

        if (hmiTranslationPanel) {
            hmiTranslationPanel.classList.add(
                "hidden"
            );
        }

        if (hmiSourceLanguageSelect) {
            hmiSourceLanguageSelect.replaceChildren();
        }

        if (hmiTargetLanguageSelect) {
            hmiTargetLanguageSelect.replaceChildren();
        }

        updateHmiTranslateButtonState();
    }


    function renderPreparedHmiReview(result, key, keepSkippedOpen = false) {
        const safeCount = result.selected_rows || 0;
        const skipped = result.skipped || [];
        preparedHmiRepairId = result.prepare_id || null;
        preparedHmiReview = result.review_id && safeCount
            ? {
                reviewId: result.review_id,
                selectionKey: key,
                rowCount: safeCount,
            }
            : null;

        // A skipped-text repair refreshes the entire review; preserve any
        // manually edited SAFE proposals already entered in its textareas.
        const draftEdits = new Map(
            [...(hmiReviewRows?.querySelectorAll(
                "textarea.hmi-project-review-editor[data-source-text]") || [])]
                .map(input => [input.dataset.sourceText, input.value])
        );
        hmiReviewRows?.replaceChildren();
        for (const item of result.examples || []) {
            const row = document.createElement("tr");
            addHmiTextCell(row, item.source_text);
            addHmiTextCell(row, item.current_target || "— (empty)");
            const valueCell = document.createElement("td");
            const editor = document.createElement("textarea");
            editor.className = "hmi-project-review-editor";
            editor.rows = 2;
            editor.maxLength = 50000;
            editor.value = draftEdits.has(item.source_text)
                ? draftEdits.get(item.source_text)
                : item.proposed_target || "";
            // Source identity is unique within the 1–50-text review.
            // The backend revalidates every edited proposal before TIA writes.
            editor.dataset.sourceText = item.source_text;
            editor.setAttribute("aria-label",
                "Editable Project text translation for " + item.source_text);
            const useSource = document.createElement("button");
            useSource.type = "button";
            useSource.className = "secondary-button";
            useSource.textContent = "Use source";
            useSource.addEventListener("click", () => {
                editor.value = item.source_text;
                editor.dispatchEvent(new Event("input", {bubbles: true}));
            });
            valueCell.append(editor, useSource);
            row.appendChild(valueCell);
            addHmiDetailsCell(row, item.view_path, "", item.sheet, null);
            hmiReviewRows?.appendChild(row);
        }
        hmiReviewSkippedList?.replaceChildren();
        if (hmiReviewSkipped) {
            hmiReviewSkipped.classList.toggle("hidden", !skipped.length);
            // Avoid a giant error panel when safe rows are already available.
            hmiReviewSkipped.open = Boolean(
                skipped.length && (keepSkippedOpen || safeCount === 0)
            );
        }
        if (hmiReviewSkippedSummary) {
            hmiReviewSkippedSummary.textContent = skipped.length
                + " rejected translation(s) — correct individually to include";
        }
        for (const item of skipped) {
            const card = document.createElement("div");
            card.className = "hmi-review-skipped-item";
            const title = document.createElement("strong");
            title.textContent = "Source";
            const source = document.createElement("pre");
            source.textContent = item.source_text;
            const reason = document.createElement("p");
            reason.className = "hmi-review-skipped-reason";
            reason.textContent = item.reason;
            const proposedLabel = document.createElement("label");
            proposedLabel.textContent = "Corrected target translation";
            const editor = document.createElement("textarea");
            editor.rows = 3;
            editor.maxLength = 50000;
            editor.value = item.proposed_target || item.source_text;
            proposedLabel.appendChild(editor);
            const actions = document.createElement("div");
            actions.className = "action-row";
            const sourceButton = document.createElement("button");
            sourceButton.type = "button";
            sourceButton.textContent = "Use source text";
            const validateButton = document.createElement("button");
            validateButton.type = "button";
            validateButton.textContent = "Validate & add to review";
            const feedback = document.createElement("p");
            feedback.className = "hmi-review-repair-status";
            feedback.setAttribute("role", "status");
            sourceButton.addEventListener("click", () => {
                editor.value = item.source_text;
                feedback.textContent =
                    "Source copied. Check it, then validate before import.";
            });
            validateButton.addEventListener("click", async () => {
                if (hmiReviewInProgress || !preparedHmiRepairId) return;
                const current = hmiTranslationSelection();
                if (hmiTranslationKey(current) !== key
                    || hmiScanKey(current) !== verifiedHmiScanKey) {
                    feedback.textContent =
                        "Selection changed. Prepare the selected HMI again.";
                    return;
                }
                hmiReviewInProgress = true;
                updateHmiTranslateButtonState();
                sourceButton.disabled = true;
                editor.disabled = true;
                validateButton.disabled = true;
                feedback.textContent = "Validating corrected translation...";
                try {
                    const repaired = await postJson(
                        "/api/v1/tia/hmis/repair-prepared-translation",
                        {
                            prepare_id: preparedHmiRepairId,
                            source_text: item.source_text,
                            proposal: editor.value,
                        }
                    );
                    if (hmiTranslationKey(hmiTranslationSelection()) !== key
                        || hmiScanKey(hmiTranslationSelection())
                            !== verifiedHmiScanKey) {
                        return;
                    }
                    renderPreparedHmiReview(repaired, key, true);
                } catch (error) {
                    feedback.textContent = "Validation failed: "
                        + error.message + ". Fix the proposal and retry.";
                } finally {
                    hmiReviewInProgress = false;
                    sourceButton.disabled = false;
                    editor.disabled = false;
                    validateButton.disabled = false;
                    updateHmiTranslateButtonState();
                }
            });
            actions.append(sourceButton, validateButton);
            card.append(title, source, reason, proposedLabel, actions, feedback);
            hmiReviewSkippedList?.appendChild(card);
        }
        if (hmiReviewSummary) {
            hmiReviewSummary.textContent =
                "Prepare: " + safeCount + " validated text(s), "
                + (result.auto_repaired_unique || 0) + " auto-repaired, "
                + skipped.length + " rejected. "
                + (safeCount
                    ? "Only validated proposals can be imported after approval."
                    : "Import disabled until at least one proposal is corrected.")
                + (safeCount > (result.examples || []).length
                    ? " Showing first " + result.examples.length
                        + " of " + safeCount + " validated texts." : "");
        }
        hmiReviewResults?.classList.remove("hidden");
        hmiReviewResults?.scrollIntoView({
            behavior: "smooth", block: "nearest",
        });
        setHmiTranslationStatus(
            safeCount + " ready for review ("
            + (result.auto_repaired_unique || 0)
            + " auto-repaired), " + skipped.length
            + " rejected. Edit rejected text and click Validate & add, "
            + "or approve only the validated translations. TIA unchanged.",
            safeCount ? "success" : "error"
        );
        updateHmiTranslateButtonState();
    }


    async function prepareSelectedHmiBatch() {
        if (hmiBatchRunning || hmiTextListBusy || hmiReviewInProgress) return;
        const scope = nextHmiManualScope();
        if (scope === "text_lists") {
            return await prepareHmiTextList();
        } else if (scope === "project") {
            return await translateSelectedHmi();
        } else {
            setHmiTranslationStatus(
                "Scan selected texts. No readable missing-target entries "
                + "are available for review.", "error"
            );
        }
    }

    async function importSelectedHmiBatch() {
        const automatic = arguments[0]?.automatic === true;
        // An active reviewed queue determines the format explicitly.
        // Never silently fall through to XLSX or return false for a stale XML
        // review: the XML import handler returns a meaningful prewrite reason.
        if (hmiReviewQueueActive) {
            if (hmiReviewQueueCurrentScope === "text_lists") {
                return await importReviewedHmiTextList({automatic});
            }
            if (hmiReviewQueueCurrentScope === "project") {
                return await importReviewedHmiTexts({automatic});
            }
            return {state: "prewrite_rejected",
                detail: "No selected format in current review queue; "
                    + "nothing was imported."};
        }
        if (hmiTextListReviewToken
            && hmiTextListPreparedKey === textListReviewKey()) {
            return await importReviewedHmiTextList();
        }
        if (preparedHmiReview) return await importReviewedHmiTexts();
        return false;
    }

    async function translateSelectedHmi() {
        const selection = hmiTranslationSelection();
        const key = hmiTranslationKey(selection);
        if (!hmiScopeEnabled("project") || !selection || !selection.ollama_model
            || hmiScanKey(selection) !== verifiedHmiScanKey) {
            setHmiTranslationStatus(
                "Scan this HMI and ViewPath root before preparing translations.",
                "error"
            );
            return;
        }

        // Manual Prepare always uses one bounded fragment. A specified total
        // also caps the fragment (e.g. batch=15, total=1 prepares one text).
        const prepareCount = manualHmiPrepareCount();
        if (!prepareCount || prepareCount > 50) {
            setHmiTranslationStatus(
                "Enter valid Batch size/Total to translate. "
                + "Manual review supports 1–50 unique texts per preparation.",
                "error"
            );
            return;
        }

        discardHmiReview();
        hmiReviewInProgress = true;
        updateHmiTranslateButtonState();
        const progressId = crypto.randomUUID().replace(/-/g, "");
        let activeProgress = true;
        let progressPolling = false;
        let lastProgressLabel = "";
        const pollTranslationProgress = async () => {
            if (!activeProgress || progressPolling) {
                return;
            }
            progressPolling = true;
            try {
                const status = await getJson(
                    "/api/v1/tia/hmis/translation-progress/" + progressId
                );
                if (!activeProgress) {
                    return;
                }
                let text = "Preparing local Ollama translations...";
                if (status.stage === "exporting_project_texts") {
                    text = "Exporting TIA project texts...";
                } else if (status.stage === "translating") {
                    text = "Ollama: " + status.completed + " / "
                        + status.total + " unique texts"
                        + (status.percent !== null
                            ? " (" + status.percent + "%)" : "")
                        + ". Elapsed: " + status.elapsed_seconds + " s.";
                } else if (status.stage === "preparing_review") {
                    text = "Finalizing proposed translations...";
                } else if (status.stage === "ready") {
                    text = "Translations prepared. Loading review table...";
                }
                if (text !== lastProgressLabel) {
                    lastProgressLabel = text;
                    setHmiTranslationStatus(text);
                }
            } catch (_error) {
                // Initial polling can race with the first progress update.
                // The main POST still reports any real error to the user.
            } finally {
                progressPolling = false;
            }
        };
        const progressTimer = window.setInterval(
            pollTranslationProgress, 1500
        );
        setHmiTranslationStatus(
            "Preparing at most " + prepareCount
            + " unique texts for review. Nothing will be imported to TIA..."
        );

        try {
            const result = await postJson(
                "/api/v1/tia/hmis/prepare-translations",
                {
                    ...selection,
                    max_rows: prepareCount,
                    exclude_source_texts: hmiReviewQueueActive
                        ? [...hmiReviewQueueExcludedProject] : [],
                    progress_id: progressId,
                }
            );
            if (hmiTranslationKey(hmiTranslationSelection()) !== key
                || hmiScanKey(hmiTranslationSelection()) !== verifiedHmiScanKey) {
                return;
            }

            if (hmiReviewQueueActive) {
                for (const item of result.skipped || []) {
                    appendHmiRunIssue("XLSX", "Project texts",
                        item.source_text, item.proposed_target, item.reason);
                    hmiReviewQueueExcludedProject.add(item.source_text);
                }
            }
            renderPreparedHmiReview(result, key);
            return Boolean(preparedHmiReview);
        } catch (error) {
            setHmiTranslationStatus(error.message, "error");
            if (hmiReviewQueueActive) {
                appendHmiRunIssue("XLSX", "Project texts", "", "",
                    "Read-only preparation failed: " + error.message,
                    "Skipped batch");
            }
            return false;
        } finally {
            activeProgress = false;
            window.clearInterval(progressTimer);
            hmiReviewInProgress = false;
            updateHmiTranslateButtonState();
        }
    }

    // The project-language refresh rebuilds both select elements.
    // Preserve the selected HMI/source/target/model after an import, so that
    // the next Preview/Prepare does not require a browser reload.
    function restoreHmiTranslationAfterImport(selection) {
        if (!selection || !selectedHmiForTranslation
            || selectedProcessId() !== selection.process_id
            || selectedHmiForTranslation.device_name !== selection.device_name
            || selectedHmiForTranslation.hmi_name !== selection.hmi_name) {
            return false;
        }

        const restoreOption = (select, value, label) => {
            if (!select || !value) {
                return;
            }
            if (![...select.options].some(option => option.value === value)) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = label || value;
                select.appendChild(option);
            }
            select.value = value;
        };

        restoreOption(
            hmiSourceLanguageSelect, selection.source_culture,
            selection.source_culture
        );
        // Rebuild the target list for the restored source culture without
        // discarding writes that TIA already verified before this UI refresh.
        populateHmiTranslationLanguages(true);
        restoreOption(
            hmiTargetLanguageSelect, selection.target_culture,
            selection.target_culture
        );
        restoreOption(
            hmiViewPathRootSelect, selection.view_path_root,
            selection.view_path_root
        );
        restoreOption(
            hmiOllamaModelSelect, selection.ollama_model,
            selection.ollama_model
        );
        updateHmiTranslateButtonState();
        return hmiTranslationKey(hmiTranslationSelection())
            === hmiTranslationKey(selection);
    }


    async function importReviewedHmiTexts() {
        const automatic = arguments[0]?.automatic === true;
        const review = preparedHmiReview;
        const selectionBeforeImport = hmiTranslationSelection();
        const key = hmiTranslationKey(selectionBeforeImport);
        if (!hmiScopeEnabled("project") || !review || review.selectionKey !== key
            || hmiScanKey(selectionBeforeImport) !== verifiedHmiScanKey) {
            const reason = "XLSX review is missing or does not match the "
                + "selected HMI/project scan. No TIA import was attempted.";
            setHmiTranslationStatus(reason, "error");
            return {state: "prewrite_rejected", detail: reason};
        }

        const proposals = [...(hmiReviewRows?.querySelectorAll(
            "textarea.hmi-project-review-editor[data-source-text]") || [])]
            .map(element => ({
                source_text: element.dataset.sourceText,
                proposal: element.value,
            }));
        if (proposals.length !== review.rowCount) {
            const reason = "Not all prepared XLSX Project texts are "
                + "visible/editable. No TIA import was attempted; prepare "
                + "the review again.";
            setHmiTranslationStatus(reason, "error");
            return {state: "prewrite_rejected", detail: reason};
        }
        if (proposals.some(item => !item.proposal.trim())) {
            setHmiTranslationStatus(
                "Every reviewed Project text needs a non-empty target. "
                + "Enter a translation manually or choose Use source.", "error"
            );
            return "edit_invalid";
        }
        if (!automatic && !confirm(
            "Import " + review.rowCount
            + " REVIEWED text row(s) into the selected TIA project? "
            + "The project will be saved and each imported value verified."
        )) {
            return "cancelled";
        }

        if (hmiReviewQueueActive) {
            hmiReviewQueueOperation = "importing / verifying";
            if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                "Importing Project texts (XLSX) into TIA and verifying by "
                + "independent re-export. Please do not interrupt the operation.";
        }
        hmiReviewInProgress = true;
        updateHmiTranslateButtonState();
        setHmiTranslationStatus(
            "Importing approved texts into TIA, then verifying by re-export..."
        );

        // Keep backend-confirmed writes separate from optional UI re-scans.
        // This review token is single-use once a write may have started.
        preparedHmiReview = null;
        try {
            let result;
            try {
                result = await postJson(
                    "/api/v1/tia/hmis/import-reviewed-translations",
                    {review_id: review.reviewId, proposals}
                );
            } catch (error) {
                if (error.message?.includes("PROJECT_TEXT_REVIEW_EDIT_INVALID:")) {
                    // Backend confirmed a prewrite QA rejection: token can be reused.
                    preparedHmiReview = review;
                    setHmiTranslationStatus(
                        "Project text edit rejected BEFORE import: "
                        + error.message + ". Correct the text and approve again.",
                        "error"
                    );
                    return "edit_invalid";
                }
                const reason = String(error.message || error);
                setHmiTranslationStatus(
                    "XLSX/TIA import not confirmed: " + reason
                    + ". Inspect TIA and do not retry automatically.", "error"
                );
                return {state: "uncertain", detail: reason};
            }

            // The backend verifies each changed XLSX cell via an independent
            // TIA export. UI refresh status is NOT a second import verification.
            const count = Number(result?.verified_rows);
            const imported = Number(result?.imported_rows);
            if (result?.status !== "verified"
                || !Number.isInteger(count) || count <= 0
                || count !== imported || count !== review.rowCount) {
                const reason = "Unexpected XLSX/TIA backend verification: "
                    + JSON.stringify({status: result?.status,
                        verified_rows: result?.verified_rows,
                        imported_rows: result?.imported_rows,
                        prepared_unique: review.rowCount});
                setHmiTranslationStatus(reason + ". Inspect TIA.", "error");
                return {state: "uncertain", detail: reason};
            }

            // Count unique, verified translations once and preserve the quota
            // even if the later UI scan cannot refresh project languages.
            hmiCombinedApprovedCount += review.rowCount;
            const verifiedText = "TIA VERIFIED " + count
                + " Project text(s) (XLSX).";
            setHmiTranslationStatus(
                verifiedText + (result.import_log
                    ? " Import log: " + result.import_log : ""),
                "success"
            );
            if (hmiReviewQueueActive && hmiUnifiedStatus) {
                hmiUnifiedStatus.textContent = verifiedText
                    + " Backend verification complete. Refreshing the "
                    + "read-only HMI scan before continuing.";
            }

            try {
                await refreshProjectLanguages(true);
                const restored = restoreHmiTranslationAfterImport(
                    selectionBeforeImport
                );
                if (!restored) {
                    invalidateHmiPreview(false);
                    const detail = verifiedText
                        + " HMI selection could not be restored; fresh Scan "
                        + "is required before any further batch.";
                    setHmiTranslationStatus(detail, "error");
                    return {state: "verified_refresh_failed", detail};
                }
                const refreshed = await previewSelectedHmi(true);
                if (!refreshed) {
                    const detail = verifiedText
                        + " Follow-up read-only scan failed. "
                        + "Do not import the next batch until a fresh Scan succeeds.";
                    setHmiTranslationStatus(detail, "error");
                    return {state: "verified_refresh_failed", detail};
                }
            } catch (error) {
                const detail = verifiedText
                    + " Post-import UI refresh failed: "
                    + String(error.message || error)
                    + ". Scan again before continuing; do not reimport.";
                setHmiTranslationStatus(detail, "error");
                return {state: "verified_refresh_failed", detail};
            }
            setHmiTranslationStatus(
                verifiedText + " Follow-up project texts scan completed.", "success"
            );
            return true;
        } finally {
            hmiReviewInProgress = false;
            updateHmiTranslateButtonState();
        }
    }


    async function refreshProjectLanguages(preserveQuota = false) {
        const processId = selectedProcessId();
        if (!processId) {
            projectLanguages = [];
            populateHmiTranslationLanguages(preserveQuota);
            return;
        }
        try {
            projectLanguages = await getJson(
                "/api/v1/tia/languages?process_id=" + encodeURIComponent(processId)
            );
        } catch (error) {
            projectLanguages = [];
            // This is still relevant to HMI translation; its selectors need
            // the current project languages even though the separate language
            // management panel has been removed.
            setHmiTranslationStatus(
                "Cannot read TIA project languages: " + error.message,
                "error"
            );
        }
        populateHmiTranslationLanguages(preserveQuota);
    }


    function renderEmptyPlcs(
        message
    ) {
        existingPlcsBody.replaceChildren();


        const row =
            document.createElement(
                "tr"
            );

        const cell =
            document.createElement(
                "td"
            );

        cell.colSpan = 6;

        cell.className =
            "empty-table-cell";

        cell.textContent =
            message;


        row.appendChild(
            cell
        );

        existingPlcsBody.appendChild(
            row
        );
    }


    function createActionButton(
        text,
        handler,
        className = ""
    ) {
        const button =
            document.createElement(
                "button"
            );

        button.type = "button";

        button.textContent =
            text;

        if (className) {
            button.className =
                className;
        }

        button.addEventListener(
            "click",
            handler
        );

        return button;
    }


    function formatMemoryBytes(
        value
    ) {
        const number =
            Number(
                value
            );


        if (
            !Number.isFinite(
                number
            )
        ) {
            return "—";
        }


        return (
            number.toLocaleString()
            +
            " B"
        );
    }


    function normalizeResourceAttributeName(
        value
    ) {
        return String(
            value
            ??
            ""
        )
        .toLowerCase()
        .replace(
            /[^a-z0-9]/g,
            ""
        );
    }


    function resourceAttributeNumber(
        attributes,
        requiredTokens,
        mode = "total"
    ) {
        const matches = [];


        for (
            const attribute
            of attributes
        ) {
            const name =
                normalizeResourceAttributeName(
                    attribute.name
                );

            const hasAllTokens =
                requiredTokens.every(
                    token =>
                        name.includes(
                            token
                        )
                );


            if (!hasAllTokens) {
                continue;
            }


            const isUsedAttribute =
                name.includes(
                    "used"
                )
                ||
                name.includes(
                    "usage"
                )
                ||
                name.includes(
                    "occupied"
                );


            if (
                mode === "used"
                &&
                !isUsedAttribute
            ) {
                continue;
            }


            if (
                mode === "total"
                &&
                isUsedAttribute
            ) {
                continue;
            }


            const raw =
                String(
                    attribute.value
                    ??
                    ""
                );

            const digits =
                raw.replace(
                    /[^0-9-]/g,
                    ""
                );


            if (!digits) {
                continue;
            }


            const number =
                Number(
                    digits
                );


            if (
                !Number.isFinite(
                    number
                )
                ||
                number < 0
            ) {
                continue;
            }


            matches.push(
                number
            );
        }


        if (matches.length === 0) {
            return null;
        }


        return Math.max(
            ...matches
        );
    }


    function formatResourcePercent(
        used,
        total,
        free = false
    ) {
        if (
            used == null
            ||
            total == null
            ||
            total <= 0
        ) {
            return "—";
        }


        const usedPercent =
            Math.max(
                0,
                Math.min(
                    100,
                    used
                    /
                    total
                    *
                    100
                )
            );

        const value =
            free
                ? 100 - usedPercent
                : usedPercent;


        return (
            value.toLocaleString(
                undefined,
                {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 1,
                }
            )
            +
            " %"
        );
    }


    function freeResourceBytes(
        used,
        total
    ) {
        if (
            used == null
            ||
            total == null
        ) {
            return null;
        }


        return Math.max(
            0,
            total - used
        );
    }


    function renderExistingPlcs() {
        existingPlcsBody.replaceChildren();


        if (
            existingPlcs.length === 0
        ) {
            renderEmptyPlcs(
                "No PLC found in the open TIA project."
            );

            return;
        }


        for (
            const plc
            of existingPlcs
        ) {
            const row =
                document.createElement(
                    "tr"
                );


            if (
                sameTarget(
                    plc,
                    projectConfig.tia_target
                )
            ) {
                row.classList.add(
                    "selected-row"
                );
            }


            const deviceCell =
                document.createElement(
                    "td"
                );

            deviceCell.textContent =
                plc.device_name;


            const plcCell =
                document.createElement(
                    "td"
                );

            plcCell.textContent =
                plc.plc_name;


            const typeCell =
                document.createElement(
                    "td"
                );

            typeCell.className =
                "type-cell";

            typeCell.textContent =
                plc.plc_type_identifier
                ||
                plc.device_type_identifier
                ||
                "—";


            const stateCell =
                document.createElement(
                    "td"
                );

            const stateBadge =
                document.createElement(
                    "span"
                );

            stateBadge.className =
                "plc-state-badge";

            stateBadge.textContent =
                plc.online_state
                ||
                "Unavailable";

            stateBadge.dataset.state =
                (
                    plc.online_state
                    ||
                    "Unavailable"
                )
                .toLowerCase();

            stateCell.appendChild(
                stateBadge
            );


            const resourcesCell =
                document.createElement(
                    "td"
                );

            resourcesCell.className =
                "plc-resources-cell";


            const resourcesDetails =
                document.createElement(
                    "details"
                );

            resourcesDetails.className =
                "plc-resource-details";


            const resourcesSummary =
                document.createElement(
                    "summary"
                );

            resourcesSummary.textContent =
                "View resources";


            const resourceRows =
                plc.resource_rows
                ??
                [];

            const resourceAttributes =
                plc.resource_attributes
                ??
                [];


            const counters =
                document.createElement(
                    "div"
                );

            counters.className =
                "plc-resource-counters";


            for (
                const [
                    label,
                    value,
                ]
                of [
                    [
                        "Blocks",
                        plc.block_count
                        ??
                        0,
                    ],
                    [
                        "DB",
                        plc.data_block_count
                        ??
                        0,
                    ],
                    [
                        "UDT",
                        plc.udt_count
                        ??
                        0,
                    ],
                    [
                        "Tags",
                        plc.tag_count
                        ??
                        0,
                    ],
                ]
            ) {
                const counter =
                    document.createElement(
                        "div"
                    );

                counter.className =
                    "plc-resource-counter";


                const labelElement =
                    document.createElement(
                        "span"
                    );

                labelElement.textContent =
                    label;


                const valueElement =
                    document.createElement(
                        "strong"
                    );

                valueElement.textContent =
                    String(
                        value
                    );


                counter.append(
                    labelElement,
                    valueElement
                );

                counters.appendChild(
                    counter
                );
            }


            resourcesDetails.append(
                resourcesSummary,
                counters
            );


            const wrapper =
                document.createElement(
                    "div"
                );

            wrapper.className =
                "plc-resource-table-wrapper";


            const table =
                document.createElement(
                    "table"
                );

            table.className =
                "plc-resource-table";


            const head =
                document.createElement(
                    "thead"
                );

            const headRow =
                document.createElement(
                    "tr"
                );


            for (
                const label
                of [
                    "Objects",
                    "Load memory",
                    "Code work-memory",
                    "Data work-memory",
                    "Retain memory",
                ]
            ) {
                const cell =
                    document.createElement(
                        "th"
                    );

                cell.textContent =
                    label;

                headRow.appendChild(
                    cell
                );
            }


            head.appendChild(
                headRow
            );

            table.appendChild(
                head
            );


            const body =
                document.createElement(
                    "tbody"
                );


            const used =
                resourceRows.find(
                    resource =>
                        resource.object_type
                        ===
                        "Used"
                );


            const totalValues = {
                load:
                    resourceAttributeNumber(
                        resourceAttributes,
                        [
                            "load",
                            "memory",
                        ]
                    ),

                code:
                    resourceAttributeNumber(
                        resourceAttributes,
                        [
                            "code",
                            "work",
                            "memory",
                        ]
                    ),

                data:
                    resourceAttributeNumber(
                        resourceAttributes,
                        [
                            "data",
                            "work",
                            "memory",
                        ]
                    ),

                retain:
                    resourceAttributeNumber(
                        resourceAttributes,
                        [
                            "retain",
                            "memory",
                        ]
                    ),
            };


            const usedValues = {
                load:
                    used
                        ? used.load_memory_bytes
                        : null,

                code:
                    used
                        ? used.code_work_memory_bytes
                        : null,

                data:
                    used
                        ? used.data_work_memory_bytes
                        : null,

                retain:
                    (
                        used
                        &&
                        used.retain_memory_bytes
                        != null
                    )
                        ? used.retain_memory_bytes
                        : resourceAttributeNumber(
                            resourceAttributes,
                            [
                                "retain",
                                "memory",
                            ],
                            "used"
                        ),
            };


            const freeValues = {
                load:
                    freeResourceBytes(
                        usedValues.load,
                        totalValues.load
                    ),

                code:
                    freeResourceBytes(
                        usedValues.code,
                        totalValues.code
                    ),

                data:
                    freeResourceBytes(
                        usedValues.data,
                        totalValues.data
                    ),

                retain:
                    freeResourceBytes(
                        usedValues.retain,
                        totalValues.retain
                    ),
            };


            const memoryKeys = [
                "load",
                "code",
                "data",
                "retain",
            ];


            const appendResourceRow =
                (
                    label,
                    values,
                    className = ""
                ) => {
                    const row =
                        document.createElement(
                            "tr"
                        );


                    if (className) {
                        row.className =
                            className;
                    }


                    for (
                        const value
                        of [
                            label,
                            ...values,
                        ]
                    ) {
                        const cell =
                            document.createElement(
                                "td"
                            );

                        cell.textContent =
                            value;

                        row.appendChild(
                            cell
                        );
                    }


                    body.appendChild(
                        row
                    );
                };


            appendResourceRow(
                "Total:",
                memoryKeys.map(
                    key =>
                        totalValues[key]
                        == null
                            ? "—"
                            : formatMemoryBytes(
                                totalValues[key]
                            )
                ),
                "plc-resource-total-row"
            );


            appendResourceRow(
                "Used:",
                memoryKeys.map(
                    key =>
                        usedValues[key]
                        == null
                            ? "—"
                            : formatMemoryBytes(
                                usedValues[key]
                            )
                ),
                "plc-resource-used-row"
            );


            appendResourceRow(
                "Free:",
                memoryKeys.map(
                    key =>
                        freeValues[key]
                        == null
                            ? "—"
                            : formatMemoryBytes(
                                freeValues[key]
                            )
                ),
                "plc-resource-free-row"
            );


            appendResourceRow(
                "Used %:",
                memoryKeys.map(
                    key =>
                        formatResourcePercent(
                            usedValues[key],
                            totalValues[key]
                        )
                ),
                "plc-resource-percent-row"
            );


            appendResourceRow(
                "Free %:",
                memoryKeys.map(
                    key =>
                        formatResourcePercent(
                            usedValues[key],
                            totalValues[key],
                            true
                        )
                ),
                "plc-resource-free-percent-row"
            );


            const detailsRow =
                document.createElement(
                    "tr"
                );

            detailsRow.className =
                "plc-resource-details-row";


            const detailsCell =
                document.createElement(
                    "td"
                );

            detailsCell.colSpan =
                5;

            detailsCell.textContent =
                "Details";


            detailsRow.appendChild(
                detailsCell
            );

            body.appendChild(
                detailsRow
            );


            for (
                const kind
                of [
                    "OB",
                    "FC",
                    "FB",
                    "DB",
                    "Other",
                ]
            ) {
                const resource =
                    resourceRows.find(
                        item =>
                            item.object_type
                            ===
                            kind
                    );


                if (!resource) {
                    continue;
                }


                appendResourceRow(
                    kind,
                    [
                        formatMemoryBytes(
                            resource.load_memory_bytes
                        ),
                        formatMemoryBytes(
                            resource.code_work_memory_bytes
                        ),
                        formatMemoryBytes(
                            resource.data_work_memory_bytes
                        ),
                        (
                            resource.retain_memory_bytes
                            == null
                                ? "—"
                                : formatMemoryBytes(
                                    resource.retain_memory_bytes
                                )
                        ),
                    ]
                );
            }


            table.appendChild(
                body
            );

            wrapper.appendChild(
                table
            );

            resourcesDetails.appendChild(
                wrapper
            );


            if (resourceRows.length === 0) {
                const empty =
                    document.createElement(
                        "p"
                    );

                empty.className =
                    "plc-resource-note";

                empty.textContent =
                    "No PLC memory rows were returned by the running Openness adapter. Restart the launcher after pulling so the C# adapter is rebuilt.";

                resourcesDetails.appendChild(
                    empty
                );
            }


            if (resourceAttributes.length > 0) {
                const attributesDetails =
                    document.createElement(
                        "details"
                    );

                attributesDetails.className =
                    "plc-resource-attributes";


                const attributesSummary =
                    document.createElement(
                        "summary"
                    );

                attributesSummary.textContent =
                    `Detected CPU resource attributes (${resourceAttributes.length})`;


                const attributesTable =
                    document.createElement(
                        "table"
                    );

                attributesTable.className =
                    "plc-resource-attribute-table";


                const attributesHead =
                    document.createElement(
                        "thead"
                    );

                const attributesHeadRow =
                    document.createElement(
                        "tr"
                    );


                for (
                    const label
                    of [
                        "Source",
                        "Attribute",
                        "Value",
                    ]
                ) {
                    const cell =
                        document.createElement(
                            "th"
                        );

                    cell.textContent =
                        label;

                    attributesHeadRow.appendChild(
                        cell
                    );
                }


                attributesHead.appendChild(
                    attributesHeadRow
                );

                attributesTable.appendChild(
                    attributesHead
                );


                const attributesBody =
                    document.createElement(
                        "tbody"
                    );


                for (
                    const attribute
                    of resourceAttributes
                ) {
                    const row =
                        document.createElement(
                            "tr"
                        );


                    for (
                        const value
                        of [
                            attribute.source,
                            attribute.name,
                            attribute.value,
                        ]
                    ) {
                        const cell =
                            document.createElement(
                                "td"
                            );

                        cell.textContent =
                            value
                            ||
                            "—";

                        row.appendChild(
                            cell
                        );
                    }


                    attributesBody.appendChild(
                        row
                    );
                }


                attributesTable.appendChild(
                    attributesBody
                );

                attributesDetails.append(
                    attributesSummary,
                    attributesTable
                );

                resourcesDetails.appendChild(
                    attributesDetails
                );
            }


            const resourcesNote =
                document.createElement(
                    "p"
                );

            resourcesNote.className =
                "plc-resource-note";

            resourcesNote.textContent =
                "Used/detail memory comes from compiled PlcBlock LoadMemoryLength and WorkMemoryLength. Total and retain values stay unavailable until the CPU exposes matching public Openness attributes.";

            resourcesDetails.appendChild(
                resourcesNote
            );

            resourcesCell.appendChild(
                resourcesDetails
            );

            const actionsCell =
                document.createElement(
                    "td"
                );

            actionsCell.className =
                "actions-cell";


            actionsCell.appendChild(
                createActionButton(
                    sameTarget(
                        plc,
                        projectConfig.tia_target
                    )
                        ? "Selected"
                        : "Use",
                    () =>
                        selectTarget(
                            plc
                        )
                )
            );


            actionsCell.appendChild(
                createActionButton(
                    "Rename",
                    () =>
                        renamePlc(
                            plc
                        )
                )
            );


            actionsCell.appendChild(
                createActionButton(
                    "Delete",
                    () =>
                        deletePlc(
                            plc
                        ),
                    "danger-button"
                )
            );


            row.appendChild(
                deviceCell
            );

            row.appendChild(
                plcCell
            );

            row.appendChild(
                typeCell
            );

            row.appendChild(
                stateCell
            );

            row.appendChild(
                resourcesCell
            );

            row.appendChild(
                actionsCell
            );


            existingPlcsBody.appendChild(
                row
            );
        }
    }


    const naturalCollator =
        new Intl.Collator(
            undefined,
            {
                numeric: true,
                sensitivity: "base",
            }
        );


    function compareText(
        left,
        right
    ) {
        return naturalCollator.compare(
            String(
                left
                ??
                ""
            ),
            String(
                right
                ??
                ""
            )
        );
    }


    function resetPlcTagFilters() {
        if (plcTagsCategoryFilter) {
            plcTagsCategoryFilter.value = "";
        }


        if (plcTagsTableFilter) {
            plcTagsTableFilter.replaceChildren();

            const option =
                document.createElement(
                    "option"
                );

            option.value = "";
            option.textContent =
                "All tag tables";

            plcTagsTableFilter.appendChild(
                option
            );
        }


        if (plcTagsTypeFilter) {
            plcTagsTypeFilter.replaceChildren();

            const option =
                document.createElement(
                    "option"
                );

            option.value = "";
            option.textContent =
                "All data types";

            plcTagsTypeFilter.appendChild(
                option
            );
        }
    }


    function fillPlcTagFilter(
        select,
        values,
        allLabel
    ) {
        if (!select) {
            return;
        }


        const previousValue =
            select.value;


        select.replaceChildren();


        const allOption =
            document.createElement(
                "option"
            );

        allOption.value = "";
        allOption.textContent =
            allLabel;

        select.appendChild(
            allOption
        );


        for (
            const value
            of values
        ) {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                value;

            option.textContent =
                value;

            select.appendChild(
                option
            );
        }


        if (
            previousValue
            &&
            values.includes(
                previousValue
            )
        ) {
            select.value =
                previousValue;
        }
    }


    function populatePlcTagFilters(
        tags
    ) {
        const tables =
            [
                ...new Set(
                    tags
                        .map(
                            (tag) =>
                                tag.table_path
                                ||
                                "(root)"
                        )
                ),
            ]
            .sort(
                compareText
            );

        const dataTypes =
            [
                ...new Set(
                    tags
                        .map(
                            (tag) =>
                                tag.data_type
                                ||
                                "(unknown)"
                        )
                ),
            ]
            .sort(
                compareText
            );


        fillPlcTagFilter(
            plcTagsTableFilter,
            tables,
            "All tag tables"
        );

        fillPlcTagFilter(
            plcTagsTypeFilter,
            dataTypes,
            "All data types"
        );
    }


    function filteredPlcTags(
        tags
    ) {
        const selectedTable =
            plcTagsTableFilter?.value
            ??
            "";

        const selectedType =
            plcTagsTypeFilter?.value
            ??
            "";

        const selectedCategory =
            plcTagsCategoryFilter?.value
            ??
            "";


        return tags.filter(
            (tag) => {
                const table =
                    tag.table_path
                    ||
                    "(root)";

                const dataType =
                    tag.data_type
                    ||
                    "(unknown)";

                const category =
                    plcTagCategory(
                        tag
                    );


                return (
                    (
                        !selectedTable
                        ||
                        table
                        ===
                        selectedTable
                    )
                    &&
                    (
                        !selectedType
                        ||
                        dataType
                        ===
                        selectedType
                    )
                    &&
                    (
                        !selectedCategory
                        ||
                        (
                            selectedCategory
                            ===
                            "safety"
                                ? (
                                    category
                                    ===
                                    "fdi"
                                    ||
                                    category
                                    ===
                                    "fdq"
                                    ||
                                    category
                                    ===
                                    "safety-other"
                                )
                                : category
                                ===
                                selectedCategory
                        )
                    )
                );
            }
        );
    }

    function plcTagSortValue(
        tag,
        key
    ) {
        if (key === "table") {
            return (
                tag.table_path
                ||
                "(root)"
            );
        }

        if (key === "type") {
            return (
                tag.data_type
                ||
                "(unknown)"
            );
        }

        if (key === "address") {
            return (
                tag.logical_address
                ||
                ""
            );
        }


        return (
            tag.name
            ||
            ""
        );
    }


    function sortedPlcTags(
        tags
    ) {
        const result =
            [...tags];

        const direction =
            plcTagSortState.direction
            ===
            "desc"
                ? -1
                : 1;

        const key =
            plcTagSortState.key;


        result.sort(
            (left, right) => {
                const primary =
                    compareText(
                        plcTagSortValue(
                            left,
                            key
                        ),
                        plcTagSortValue(
                            right,
                            key
                        )
                    );


                if (primary !== 0) {
                    return (
                        primary
                        *
                        direction
                    );
                }


                return compareText(
                    left.name,
                    right.name
                );
            }
        );


        return result;
    }


    function renderPlcTagSortHeaders() {
        for (
            const button
            of plcTagSortButtons
        ) {
            const key =
                button.dataset
                    .plcTagSort;

            const isActive =
                key
                ===
                plcTagSortState.key;

            const labels = {
                table:
                    "Tag table / group",

                name:
                    "Name",

                type:
                    "Data type",

                address:
                    "Address",
            };


            button.classList.toggle(
                "active",
                isActive
            );

            button.textContent =
                labels[key]
                +
                (
                    isActive
                        ? (
                            plcTagSortState.direction
                            ===
                            "asc"
                                ? " ↑"
                                : " ↓"
                        )
                        : ""
                );
        }
    }


    function setPlcTagSort(
        key
    ) {
        if (
            plcTagSortState.key
            ===
            key
        ) {
            plcTagSortState.direction =
                plcTagSortState.direction
                ===
                "asc"
                    ? "desc"
                    : "asc";

        } else {
            plcTagSortState = {
                key:
                    key,

                direction:
                    "asc",
            };
        }


        renderPlcTagSortHeaders();

        renderPlcTags(
            loadedPlcTags
        );
    }

    function tagSafetyText(
        tag
    ) {
        return `${tag.table_path ?? ""} ${tag.name ?? ""}`;
    }


    function isFdiTag(
        tag
    ) {
        return /(^|[\s/_-])fdi(?=$|[\s/_-]|\d)/i.test(
            tagSafetyText(
                tag
            )
        );
    }


    function isFdqTag(
        tag
    ) {
        return /(^|[\s/_-])fdq(?=$|[\s/_-]|\d)/i.test(
            tagSafetyText(
                tag
            )
        );
    }


    function isSafetyTag(
        tag
    ) {
        const text =
            tagSafetyText(
                tag
            );


        return (
            isFdiTag(
                tag
            )
            ||
            isFdqTag(
                tag
            )
            ||
            /(^|[\s/_-])(safety|failsafe|safe)([\s/_-]|$)/i.test(
                text
            )
            ||
            /(^|[\s/_-])f[_-]/i.test(
                text
            )
        );
    }


    function plcTagCategory(
        tag
    ) {
        if (
            isFdiTag(
                tag
            )
        ) {
            return "fdi";
        }

        if (
            isFdqTag(
                tag
            )
        ) {
            return "fdq";
        }

        if (
            isSafetyTag(
                tag
            )
        ) {
            return "safety-other";
        }


        const address =
            String(
                tag.logical_address
                ??
                ""
            )
            .replace(
                /\s+/g,
                ""
            )
            .toUpperCase();


        if (/^%IW\d+$/.test(address)) {
            return "iw";
        }

        if (/^%QW\d+$/.test(address)) {
            return "qw";
        }

        if (
            /^%I(?:B)?\d+(?:\.\d+)?$/.test(
                address
            )
        ) {
            return "input";
        }

        if (
            /^%Q(?:B)?\d+(?:\.\d+)?$/.test(
                address
            )
        ) {
            return "output";
        }


        return "other";
    }

    function classifyPlcTags(
        tags
    ) {
        const counts = {
            total:
                tags.length,

            inputs:
                0,

            outputs:
                0,

            fdi:
                0,

            fdq:
                0,

            safety_other:
                0,

            iw:
                0,

            qw:
                0,

            other:
                0,
        };


        for (
            const tag
            of tags
        ) {
            const category =
                plcTagCategory(
                    tag
                );


            if (category === "input") {
                counts.inputs += 1;

            } else if (
                category === "output"
            ) {
                counts.outputs += 1;

            } else if (
                category === "fdi"
            ) {
                counts.fdi += 1;

            } else if (
                category === "fdq"
            ) {
                counts.fdq += 1;

            } else if (
                category === "safety-other"
            ) {
                counts.safety_other += 1;

            } else if (
                category === "iw"
            ) {
                counts.iw += 1;

            } else if (
                category === "qw"
            ) {
                counts.qw += 1;

            } else {
                counts.other += 1;
            }
        }


        return counts;
    }

    function renderPlcTagSummary(
        tags
    ) {
        if (!plcTagsBreakdown) {
            return;
        }


        const counts =
            classifyPlcTags(
                tags
            );


        for (
            const [
                key,
                element,
            ]
            of Object.entries(
                tagCountElements
            )
        ) {
            if (element) {
                element.textContent =
                    String(
                        counts[key]
                        ??
                        0
                    );
            }
        }


        plcTagsBreakdown.classList.remove(
            "hidden"
        );
    }


    function renderEmptyPlcTags(
        message
    ) {
        if (!plcTagsBody) {
            return;
        }


        if (plcTagsSummary) {
            plcTagsSummary.textContent =
                "PLC tags list";
        }

        if (plcTagsBreakdown) {
            plcTagsBreakdown.classList.add(
                "hidden"
            );
        }


        plcTagsBody.replaceChildren();


        const row =
            document.createElement(
                "tr"
            );

        const cell =
            document.createElement(
                "td"
            );

        cell.colSpan =
            4;

        cell.className =
            "empty-table-cell";

        cell.textContent =
            message;


        row.appendChild(
            cell
        );

        plcTagsBody.appendChild(
            row
        );
    }


    function renderPlcTags(
        tags
    ) {
        if (!plcTagsBody) {
            return;
        }


        const visibleTags =
            filteredPlcTags(
                tags
            );

        const orderedTags =
            sortedPlcTags(
                visibleTags
            );


        if (plcTagsSummary) {
            plcTagsSummary.textContent =
                visibleTags.length
                ===
                tags.length
                    ? `PLC tags list (${tags.length})`
                    : `PLC tags list (${visibleTags.length} / ${tags.length})`;
        }


        renderPlcTagSummary(
            visibleTags
        );

        plcTagsBody.replaceChildren();


        if (tags.length === 0) {
            renderEmptyPlcTags(
                "No PLC tags found in the Active PLC."
            );

            return;
        }


        if (visibleTags.length === 0) {
            const row =
                document.createElement(
                    "tr"
                );

            const cell =
                document.createElement(
                    "td"
                );

            cell.colSpan =
                4;

            cell.className =
                "empty-table-cell";

            cell.textContent =
                "No PLC tags match the selected filters.";

            row.appendChild(
                cell
            );

            plcTagsBody.appendChild(
                row
            );

            return;
        }


        for (
            const tag
            of orderedTags
        ) {
            const row =
                document.createElement(
                    "tr"
                );


            for (
                const value
                of [
                    tag.table_path
                    ||
                    "(root)",

                    tag.name,
                    tag.data_type,
                    tag.logical_address
                    ||
                    "—",
                ]
            ) {
                const cell =
                    document.createElement(
                        "td"
                    );

                cell.textContent =
                    value;

                row.appendChild(
                    cell
                );
            }


            plcTagsBody.appendChild(
                row
            );
        }
    }

    function setPlcTagsStatus(
        message,
        type = "normal"
    ) {
        if (!plcTagsStatus) {
            return;
        }


        plcTagsStatus.textContent =
            message;

        plcTagsStatus.classList.toggle(
            "error",
            type === "error"
        );

        plcTagsStatus.classList.toggle(
            "success",
            type === "success"
        );
    }


    async function readPlcTags() {
        const processId =
            selectedProcessId();

        const target =
            projectConfig.tia_target;


        if (!processId) {
            setPlcTagsStatus(
                "Select a TIA process first.",
                "error"
            );

            return;
        }


        if (!target) {
            setPlcTagsStatus(
                "Select an Active PLC first.",
                "error"
            );

            return;
        }


        readTagsButton.disabled =
            true;

        renderEmptyPlcTags(
            "Reading PLC tags from TIA Portal..."
        );

        setPlcTagsStatus(
            `Reading tags from ${target.plc_name}...`
        );


        try {
            const query =
                new URLSearchParams({
                    process_id:
                        String(
                            processId
                        ),

                    device_name:
                        target.device_name,

                    plc_name:
                        target.plc_name,
                });


            const tags =
                await getJson(
                    "/api/v1/tia/plc-tags?"
                    +
                    query.toString()
                );


            loadedPlcTags =
                tags;


            populatePlcTagFilters(
                loadedPlcTags
            );

            renderPlcTags(
                loadedPlcTags
            );

            setPlcTagsStatus(
                `${tags.length} PLC tag(s) read from ${target.plc_name}.`,
                "success"
            );

        } catch (error) {
            renderEmptyPlcTags(
                "PLC tag read failed."
            );

            setPlcTagsStatus(
                error.message,
                "error"
            );

        } finally {
            readTagsButton.disabled =
                !projectConfig.tia_target;
        }
    }


    function setPlcProgramBlocksStatus(
        message,
        type = "normal"
    ) {
        if (!plcProgramBlocksStatus) {
            return;
        }


        plcProgramBlocksStatus.textContent =
            message;

        plcProgramBlocksStatus.classList.toggle(
            "error",
            type === "error"
        );

        plcProgramBlocksStatus.classList.toggle(
            "success",
            type === "success"
        );
    }


    function renderEmptyProgramBlocks(
        message,
        body = plcProgramBlocksBody
    ) {
        if (!body) {
            return;
        }

        body.replaceChildren();


        const row =
            document.createElement(
                "tr"
            );

        const cell =
            document.createElement(
                "td"
            );

        cell.colSpan =
            9;

        cell.className =
            "empty-table-cell";

        cell.textContent =
            message;


        row.appendChild(
            cell
        );

        body.appendChild(row);
    }


    function resetPlcProgramBlocks(
        message =
            "No program block inventory loaded."
    ) {
        loadedPlcProgramBlocks = [];


        if (plcProgramBlocksSummary) {
            plcProgramBlocksSummary.textContent =
                "Program blocks (OB / FC / FB)";
        }


        if (plcProgramBlocksKindFilter) {
            plcProgramBlocksKindFilter.value =
                "";
        }


        renderEmptyProgramBlocks(message);

        resetPlcProgramBlockDetail();
    }


    function renderPlcBlockRows(blocks, body) {
        if (!body) {
            return;
        }
        body.replaceChildren();
        if (!blocks.length) {
            renderEmptyProgramBlocks("No matching blocks found.", body);
            return;
        }

        for (const block of blocks) {
            const row =
                document.createElement(
                    "tr"
                );


            const consistentText =
                block.is_consistent == null
                    ? "—"
                    : (
                        block.is_consistent
                            ? "Yes"
                            : "No"
                    );


            const values = [
                block.group_path
                ||
                "(root)",

                block.name
                ||
                "—",

                block.kind
                ||
                "—",

                block.number == null
                    ? "—"
                    : String(
                        block.number
                    ),

                block.programming_language
                ||
                "—",

                consistentText,

                formatMemoryBytes(
                    block.load_memory_bytes
                ),

                formatMemoryBytes(
                    block.work_memory_bytes
                ),
            ];


            for (
                const value
                of values
            ) {
                const cell =
                    document.createElement(
                        "td"
                    );

                cell.textContent =
                    value;

                row.appendChild(
                    cell
                );
            }


            const actionsCell =
                document.createElement(
                    "td"
                );

            actionsCell.className =
                "actions-cell";

            actionsCell.appendChild(
                createActionButton(
                    "Inspect",
                    () =>
                        readPlcProgramBlockDetail(
                            block
                        )
                )
            );

            row.appendChild(
                actionsCell
            );


            body.appendChild(row);
        }
    }



    function renderPlcProgramBlocks(blocks) {
        if (!plcProgramBlocksBody) {
            return;
        }
        const programBlocks = blocks.filter(
            block => ["OB", "FC", "FB"].includes(block.kind)
        );
        const kindFilter = plcProgramBlocksKindFilter?.value || "";
        const visible = programBlocks.filter(
            block => !kindFilter || block.kind === kindFilter
        );

        if (plcProgramBlocksSummary) {
            plcProgramBlocksSummary.textContent =
                "Program blocks (" + visible.length + " / "
                + programBlocks.length + ")";
        }
        renderPlcBlockRows(visible, plcProgramBlocksBody);
    }


    function setPlcProgramBlockDetailStatus(
        message,
        type = "normal"
    ) {
        if (!plcProgramBlockDetailStatus) {
            return;
        }


        plcProgramBlockDetailStatus.textContent =
            message;

        plcProgramBlockDetailStatus.classList.toggle(
            "error",
            type === "error"
        );

        plcProgramBlockDetailStatus.classList.toggle(
            "success",
            type === "success"
        );
    }


    function resetPlcProgramBlockDetail() {
        if (plcProgramBlockDetail) {
            plcProgramBlockDetail.classList.add(
                "hidden"
            );
        }

        if (plcProgramBlockDetailBody) {
            plcProgramBlockDetailBody.replaceChildren();
        }

        if (plcProgramBlockDetailMeta) {
            plcProgramBlockDetailMeta.replaceChildren();
        }

        setPlcProgramBlockDetailStatus(
            "Select a program block."
        );
    }


    // Shared read-only hierarchical member table for OB/FB/FC and DB/UDT.
    // Nested TIA XML members are flattened with level/path metadata.
    // Shared read-only inspector for OB/FB/FC and DB/UDT.
    function renderPlcMemberRows(body, members, context) {
        const tree = createPlcMemberTree(members);
        const rendered = [];
        const wrapper = body.closest(".tia-structure-member-table-wrapper");
        wrapper?.parentElement?.querySelector(".plc-member-toolbar")?.remove();

        const toolbar = document.createElement("div");
        toolbar.className = "plc-member-toolbar";
        const actionRow = document.createElement("div");
        actionRow.className = "plc-member-toolbar-actions";
        const searchInput = document.createElement("input");
        searchInput.type = "search";
        searchInput.className = "plc-member-search";
        searchInput.placeholder = "Search name, type, comment or path...";
        searchInput.setAttribute("aria-label", "Search PLC members");
        const expand = document.createElement("button");
        expand.type = "button";
        expand.textContent = "Expand all";
        const collapse = document.createElement("button");
        collapse.type = "button";
        collapse.textContent = "Collapse all";
        const blockRefs = document.createElement("button");
        blockRefs.type = "button";
        blockRefs.textContent = "Block references";
        const message = document.createElement("span");
        message.className = "plc-member-message";
        message.setAttribute("role", "status");
        const referenceResults = document.createElement("div");
        referenceResults.className = "plc-member-reference-results";
        referenceResults.setAttribute("aria-live", "polite");
        actionRow.append(searchInput, expand, collapse, blockRefs, message);
        toolbar.append(actionRow, referenceResults);
        wrapper?.parentElement?.insertBefore(toolbar, wrapper);

        const copyPath = async member => {
            const fullPath = [context.name, member.path || member.name]
                .filter(Boolean).join(".");
            try {
                await navigator.clipboard.writeText(fullPath);
                message.textContent = "Copied: " + fullPath;
            } catch (_error) {
                message.textContent = "Clipboard unavailable. Path: " + fullPath;
            }
        };

        let requestSequence = 0;
        async function showCrossReferences(member = null) {
            const requestId = ++requestSequence;
            referenceResults.replaceChildren();
            const heading = document.createElement("p");
            const label = member?.path || context.name;
            heading.textContent = "Reading TIA references for " + label + "...";
            referenceResults.appendChild(heading);
            const params = new URLSearchParams({
                process_id: String(selectedProcessId()),
                device_name: projectConfig.tia_target?.device_name || "",
                plc_name: projectConfig.tia_target?.plc_name || "",
                kind: context.kind,
                group_path: context.group_path || "",
                name: context.name,
                member_path: member?.path || "",
            });
            try {
                const result = await getJson(
                    "/api/v1/tia/plc-cross-references?" + params.toString()
                );
                if (requestId !== requestSequence || !toolbar.isConnected) {
                    return;
                }
                referenceResults.replaceChildren();
                const title = document.createElement("p");
                title.textContent = "Cross-references — " + label + ": "
                    + result.references.length + " result(s)"
                    + (result.truncated ? " (limited to 200)" : "");
                referenceResults.appendChild(title);
                if (!result.references.length) {
                    const empty = document.createElement("p");
                    empty.textContent = "No references reported by TIA for this object.";
                    referenceResults.appendChild(empty);
                    return;
                }
                const table = document.createElement("table");
                table.className = "management-table plc-xref-table";
                const head = document.createElement("thead");
                const header = document.createElement("tr");
                for (const column of ["Source", "Referenced in", "Location", "Access"]) {
                    const th = document.createElement("th");
                    th.textContent = column;
                    header.appendChild(th);
                }
                head.appendChild(header);
                const bodyRows = document.createElement("tbody");
                for (const item of result.references) {
                    const row = document.createElement("tr");
                    const values = [
                        item.source_path || item.source_name,
                        item.reference_path || item.reference_name,
                        [item.location_name, item.reference_location,
                            item.reference_type].filter(Boolean).join(" / "),
                        item.access,
                    ];
                    for (const value of values) {
                        const td = document.createElement("td");
                        td.textContent = value || "—";
                        row.appendChild(td);
                    }
                    bodyRows.appendChild(row);
                }
                table.append(head, bodyRows);
                const scroll = document.createElement("div");
                scroll.className = "table-wrapper";
                scroll.appendChild(table);
                referenceResults.appendChild(scroll);
            } catch (error) {
                if (requestId === requestSequence && toolbar.isConnected) {
                    heading.textContent = "Cross-reference lookup failed: " + error.message;
                }
            }
        }

        members.forEach((member, index) => {
            const row = document.createElement("tr");
            row.className = "plc-member-row";
            const section = document.createElement("td");
            section.textContent = member.section || "—";
            const nameCell = document.createElement("td");
            nameCell.title = member.path || member.name || "";
            const nameContainer = document.createElement("span");
            nameContainer.className = "plc-member-name";
            nameContainer.style.paddingLeft =
                `${12 + Math.min(12, Math.max(0, Number(member.level) || 0)) * 18}px`;
            let toggle = null;
            if (tree.hasChildren(index)) {
                row.classList.add("plc-member-parent-row");
                toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "plc-member-toggle";
                nameContainer.appendChild(toggle);
            } else {
                const spacer = document.createElement("span");
                spacer.className = "plc-member-leaf-spacer";
                spacer.setAttribute("aria-hidden", "true");
                nameContainer.appendChild(spacer);
            }
            const name = document.createElement("span");
            name.textContent = member.name || "—";
            nameContainer.appendChild(name);
            nameCell.appendChild(nameContainer);
            const dataType = document.createElement("td");
            dataType.textContent = member.data_type || "—";
            if (member.system_instance) {
                const marker = document.createElement("small");
                marker.className = "plc-system-instance";
                marker.textContent = "System instance — Read-only";
                dataType.append(document.createElement("br"), marker);
                row.classList.add("plc-system-instance-row");
            }
            const offset = document.createElement("td");
            offset.textContent = member.offset || "—";
            const comment = document.createElement("td");
            comment.textContent = member.comment || "—";
            const actions = document.createElement("td");
            actions.className = "plc-member-actions";
            const copy = document.createElement("button");
            copy.type = "button";
            copy.textContent = "Copy path";
            copy.addEventListener("click", () => { void copyPath(member); });
            const refs = document.createElement("button");
            refs.type = "button";
            refs.textContent = "Refs";
            refs.title = "Show Openness cross-references";
            refs.addEventListener("click", () => { void showCrossReferences(member); });
            actions.append(copy, refs);
            row.append(section, nameCell, dataType, offset, comment, actions);
            body.appendChild(row);
            rendered.push({row, toggle});
        });

        const updateVisibility = () => {
            const results = tree.search(members, searchInput.value);
            rendered.forEach(({row, toggle}, index) => {
                row.hidden = results ? !results.visible.has(index)
                    : !tree.isVisible(index);
                if (toggle) {
                    const expanded = results
                        ? results.expanded.has(index) : tree.isExpanded(index);
                    const path = members[index].path || members[index].name;
                    toggle.textContent = expanded ? "▾" : "▸";
                    toggle.setAttribute("aria-expanded", String(expanded));
                    toggle.setAttribute(
                        "aria-label", (expanded ? "Collapse " : "Expand ") + path
                    );
                }
            });
            message.textContent = results
                ? results.matches + " matching member(s)"
                : members.length + " member(s)";
        };
        rendered.forEach(({toggle}, index) => {
            toggle?.addEventListener("click", () => {
                tree.toggle(index);
                updateVisibility();
            });
        });
        searchInput.addEventListener("input", updateVisibility);
        expand.addEventListener("click", () => {
            searchInput.value = "";
            tree.expandAll();
            updateVisibility();
        });
        collapse.addEventListener("click", () => {
            searchInput.value = "";
            tree.collapseAll();
            updateVisibility();
        });
        blockRefs.addEventListener("click", () => {
            void showCrossReferences();
        });
        updateVisibility();
    }


    function renderPlcProgramBlockDetail(
        detail
    ) {
        if (
            !plcProgramBlockDetail
            ||
            !plcProgramBlockDetailBody
        ) {
            return;
        }


        plcProgramBlockDetail.classList.remove(
            "hidden"
        );

        plcProgramBlockDetailBody.replaceChildren();

        plcProgramBlockDetailTitle.textContent =
            `${detail.kind || "Block"} ${detail.name}`;


        if (plcProgramBlockDetailMeta) {
            plcProgramBlockDetailMeta.replaceChildren();

            for (
                const [
                    label,
                    value,
                ]
                of [
                    [
                        "Group",
                        detail.group_path
                        ||
                        "(root)",
                    ],
                    [
                        "Number",
                        detail.number == null
                            ? "—"
                            : detail.number,
                    ],
                    [
                        "Language",
                        detail.programming_language
                        ||
                        "—",
                    ],
                    [
                        "Consistent",
                        detail.is_consistent == null
                            ? "—"
                            : (
                                detail.is_consistent
                                    ? "Yes"
                                    : "No"
                            ),
                    ],
                    [
                        "Load memory",
                        formatMemoryBytes(
                            detail.load_memory_bytes
                        ),
                    ],
                    [
                        "Work memory",
                        formatMemoryBytes(
                            detail.work_memory_bytes
                        ),
                    ],
                ]
            ) {
                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "plc-block-detail-meta-item";

                const labelElement =
                    document.createElement(
                        "span"
                    );

                labelElement.textContent =
                    label;

                const valueElement =
                    document.createElement(
                        "strong"
                    );

                valueElement.textContent =
                    String(
                        value
                    );

                item.append(
                    labelElement,
                    valueElement
                );

                plcProgramBlockDetailMeta.appendChild(
                    item
                );
            }
        }


        const members =
            detail.members
            ??
            [];


        if (members.length === 0) {
            const row =
                document.createElement(
                    "tr"
                );

            const cell =
                document.createElement(
                    "td"
                );

            cell.colSpan =
                6;

            cell.className =
                "empty-table-cell";

            cell.textContent =
                "No exported interface members found.";

            row.appendChild(
                cell
            );

            plcProgramBlockDetailBody.appendChild(
                row
            );

        } else {
            renderPlcMemberRows(plcProgramBlockDetailBody, members, detail);
        }

        setPlcProgramBlockDetailStatus(
            `${members.length} interface member(s) loaded. Expand branches with ▸.`,
            "success"
        );
    }


    async function readPlcProgramBlockDetail(block) {
        const processId = selectedProcessId();
        const target = projectConfig.tia_target;
        if (!processId || !target || !plcProgramBlockDetail) {
            setPlcProgramBlocksStatus(
                "Select an Active PLC and a TIA process before inspecting blocks.",
                "error"
            );
            return;
        }

        // Detail appears ABOVE the potentially long program inventory.
        // Move to it immediately so Inspect always produces visible feedback.
        plcProgramBlockDetail.classList.remove("hidden");
        plcProgramBlockDetailTitle.textContent =
            (block.kind || "Block") + " " + block.name;
        plcProgramBlockDetailBody?.replaceChildren();
        plcProgramBlockDetailMeta?.replaceChildren();
        plcProgramBlockDetail.scrollIntoView({
            behavior: "smooth", block: "start"
        });
        setPlcProgramBlockDetailStatus(
            "Loading " + block.kind + " " + block.name
            + " interface via TIA Openness..."
        );

        const query = new URLSearchParams({
            process_id: String(processId),
            device_name: target.device_name,
            plc_name: target.plc_name,
            group_path: block.group_path || "",
            name: block.name,
        });
        try {
            const detail = await getJson(
                "/api/v1/tia/plc-program-block?" + query.toString()
            );
            renderPlcProgramBlockDetail(detail);
        } catch (error) {
            // Preserve the read-only inventory metadata even if TIA refuses
            // XML export (e.g. inconsistent blocks/UDTs). Never imply a
            // successful structure/interface read in that situation.
            renderPlcProgramBlockDetail({ ...block, members: [] });
            setPlcProgramBlockDetailStatus(
                "Cannot export " + block.kind + " " + block.name + ": "
                + error.message
                + (block.is_consistent === false
                    ? " The block is marked inconsistent in TIA. Compile/check"
                        + " the PLC blocks and UDTs in TIA before retrying."
                    : ""),
                "error"
            );
        }
    }


    async function readPlcProgramBlocks() {
        const processId =
            selectedProcessId();

        const target =
            projectConfig.tia_target;


        if (!processId) {
            setPlcProgramBlocksStatus(
                "Select a TIA process first.",
                "error"
            );

            return;
        }


        if (!target) {
            setPlcProgramBlocksStatus(
                "Select an Active PLC first.",
                "error"
            );

            return;
        }


        readProgramBlocksButton.disabled =
            true;

        renderEmptyProgramBlocks(
            "Reading program blocks from TIA Portal..."
        );

        setPlcProgramBlocksStatus(
            `Reading program blocks from ${target.plc_name}...`
        );


        try {
            const query =
                new URLSearchParams({
                    process_id:
                        String(
                            processId
                        ),

                    device_name:
                        target.device_name,

                    plc_name:
                        target.plc_name,
                    program_only: "true",
                });


            const blocks =
                await getJson(
                    "/api/v1/tia/plc-program-blocks?"
                    +
                    query.toString()
                );


            loadedPlcProgramBlocks =
                blocks;


            renderPlcProgramBlocks(
                loadedPlcProgramBlocks
            );


            const counts =
                blocks.reduce(
                    (result, block) => {
                        const kind =
                            block.kind
                            ||
                            "Other";

                        result[kind] =
                            (
                                result[kind]
                                ||
                                0
                            )
                            +
                            1;

                        return result;
                    },
                    {}
                );


            const breakdown =
                [
                    "OB",
                    "FC",
                    "FB",
                ]
                .filter(
                    kind =>
                        counts[kind]
                )
                .map(
                    kind =>
                        `${kind} ${counts[kind]}`
                )
                .join(
                    " · "
                );


            setPlcProgramBlocksStatus(
                `${blocks.length} program block(s) read from ${target.plc_name}`
                +
                (
                    breakdown
                        ? ` · ${breakdown}`
                        : ""
                ),
                "success"
            );

        } catch (error) {
            resetPlcProgramBlocks(
                "PLC program block read failed."
            );

            setPlcProgramBlocksStatus(
                error.message,
                "error"
            );

        } finally {
            readProgramBlocksButton.disabled =
                !projectConfig.tia_target;
        }
    }


    function setPlcStructuresStatus(
        message,
        type = "normal"
    ) {
        if (!plcStructuresStatus) {
            return;
        }


        plcStructuresStatus.textContent =
            message;

        plcStructuresStatus.classList.toggle(
            "error",
            type === "error"
        );

        plcStructuresStatus.classList.toggle(
            "success",
            type === "success"
        );
    }


    function renderEmptyStructureTable(
        body,
        message,
        columns
    ) {
        if (!body) {
            return;
        }


        body.replaceChildren();


        const row =
            document.createElement(
                "tr"
            );

        const cell =
            document.createElement(
                "td"
            );

        cell.colSpan =
            columns;

        cell.className =
            "empty-table-cell";

        cell.textContent =
            message;


        row.appendChild(
            cell
        );

        body.appendChild(
            row
        );
    }


    function sortedByName(
        items,
        mode
    ) {
        const direction =
            mode === "name-desc"
                ? -1
                : 1;


        return [...items].sort(
            (left, right) => {
                const nameResult =
                    compareText(
                        left.name,
                        right.name
                    );

                if (nameResult !== 0) {
                    return (
                        nameResult
                        *
                        direction
                    );
                }

                return compareText(
                    left.group_path,
                    right.group_path
                );
            }
        );
    }


    function setPlcStructureDetailStatus(
        message,
        type = "normal"
    ) {
        if (!plcStructureDetailStatus) {
            return;
        }


        plcStructureDetailStatus.textContent =
            message;

        plcStructureDetailStatus.classList.toggle(
            "error",
            type === "error"
        );

        plcStructureDetailStatus.classList.toggle(
            "success",
            type === "success"
        );
    }


    function resetPlcStructureDetail() {
        if (plcStructureDetail) {
            plcStructureDetail.classList.add(
                "hidden"
            );
        }

        if (plcStructureDetailTitle) {
            plcStructureDetailTitle.textContent =
                "Structure detail";
        }

        if (plcStructureDetailBody) {
            plcStructureDetailBody.replaceChildren();
        }

        setPlcStructureDetailStatus(
            "Select a DB or UDT."
        );
    }


    function renderPlcStructureDetail(
        detail
    ) {
        if (
            !plcStructureDetail
            ||
            !plcStructureDetailBody
        ) {
            return;
        }


        plcStructureDetail.classList.remove(
            "hidden"
        );

        plcStructureDetailBody.replaceChildren();


        const groupText =
            detail.group_path
                ? ` / ${detail.group_path}`
                : "";

        plcStructureDetailTitle.textContent =
            `${detail.kind.toUpperCase()} ${detail.name}${groupText}`;


        if (
            !detail.members
            ||
            detail.members.length === 0
        ) {
            const row =
                document.createElement(
                    "tr"
                );

            const cell =
                document.createElement(
                    "td"
                );

            cell.colSpan =
                6;

            cell.className =
                "empty-table-cell";

            cell.textContent =
                "No members found in exported structure.";

            row.appendChild(
                cell
            );

            plcStructureDetailBody.appendChild(
                row
            );

            setPlcStructureDetailStatus(
                "Structure exported, but no members were found."
            );

            return;
        }


        renderPlcMemberRows(plcStructureDetailBody, detail.members, detail);

        setPlcStructureDetailStatus(
            `${detail.members.length} member(s) loaded. Expand branches with ▸.`,
            "success"
        );
    }


    async function readPlcStructureDetail(
        kind,
        item
    ) {
        const processId =
            selectedProcessId();

        const target =
            projectConfig.tia_target;


        if (!processId) {
            setPlcStructuresStatus(
                "Select a TIA process first.",
                "error"
            );

            return;
        }


        if (!target) {
            setPlcStructuresStatus(
                "Select an Active PLC first.",
                "error"
            );

            return;
        }


        plcStructureDetail.classList.remove(
            "hidden"
        );

        plcStructureDetailTitle.textContent =
            `Loading ${kind.toUpperCase()} ${item.name}...`;

        plcStructureDetailBody.replaceChildren();

        setPlcStructureDetailStatus(
            "Exporting structure XML from TIA Portal..."
        );


        try {
            const query =
                new URLSearchParams({
                    process_id:
                        String(
                            processId
                        ),

                    device_name:
                        target.device_name,

                    plc_name:
                        target.plc_name,

                    kind:
                        kind,

                    group_path:
                        item.group_path
                        ||
                        "",

                    name:
                        item.name,
                });


            const detail =
                await getJson(
                    "/api/v1/tia/plc-structure?"
                    +
                    query.toString()
                );


            renderPlcStructureDetail(
                detail
            );

        } catch (error) {
            plcStructureDetailBody.replaceChildren();

            setPlcStructureDetailStatus(
                error.message,
                "error"
            );
        }
    }


    function renderPlcStructures(
        structures
    ) {
        const dataBlocks =
            structures.data_blocks
            ??
            [];

        const udts =
            structures.udts
            ??
            [];

        const orderedDataBlocks =
            sortedByName(
                dataBlocks,
                plcDbsSort?.value
                ??
                "name-asc"
            );

        const orderedUdts =
            sortedByName(
                udts,
                plcUdtsSort?.value
                ??
                "name-asc"
            );


        if (plcDbsSummary) {
            plcDbsSummary.textContent =
                `Data Blocks (${dataBlocks.length})`;
        }

        if (plcUdtsSummary) {
            plcUdtsSummary.textContent =
                `UDTs (${udts.length})`;
        }


        if (plcDbsBody) {
            plcDbsBody.replaceChildren();


            if (dataBlocks.length === 0) {
                renderEmptyStructureTable(
                    plcDbsBody,
                    "No Data Blocks found.",
                    6
                );

            } else {
                for (
                    const item
                    of orderedDataBlocks
                ) {
                    const row =
                        document.createElement(
                            "tr"
                        );


                    for (
                        const value
                        of [
                            item.group_path
                            || "(root)",

                            item.name,

                            String(
                                item.number
                            ),

                            item.block_kind,

                            item.is_consistent
                                ? "Yes"
                                : "No",
                        ]
                    ) {
                        const cell =
                            document.createElement(
                                "td"
                            );

                        cell.textContent =
                            value;

                        row.appendChild(
                            cell
                        );
                    }


                    const actionsCell =
                        document.createElement(
                            "td"
                        );

                    actionsCell.className =
                        "actions-cell";

                    actionsCell.appendChild(
                        createActionButton(
                            "Read structure",
                            () =>
                                readPlcStructureDetail(
                                    "db",
                                    item
                                )
                        )
                    );

                    row.appendChild(
                        actionsCell
                    );


                    plcDbsBody.appendChild(
                        row
                    );
                }
            }
        }


        if (plcUdtsBody) {
            plcUdtsBody.replaceChildren();


            if (udts.length === 0) {
                renderEmptyStructureTable(
                    plcUdtsBody,
                    "No UDTs found.",
                    5
                );

            } else {
                for (
                    const item
                    of orderedUdts
                ) {
                    const row =
                        document.createElement(
                            "tr"
                        );


                    for (
                        const value
                        of [
                            item.group_path
                            || "(root)",

                            item.name,

                            item.type_kind,

                            item.is_consistent
                                ? "Yes"
                                : "No",
                        ]
                    ) {
                        const cell =
                            document.createElement(
                                "td"
                            );

                        cell.textContent =
                            value;

                        row.appendChild(
                            cell
                        );
                    }


                    const actionsCell =
                        document.createElement(
                            "td"
                        );

                    actionsCell.className =
                        "actions-cell";

                    actionsCell.appendChild(
                        createActionButton(
                            "Read structure",
                            () =>
                                readPlcStructureDetail(
                                    "udt",
                                    item
                                )
                        )
                    );

                    row.appendChild(
                        actionsCell
                    );


                    plcUdtsBody.appendChild(
                        row
                    );
                }
            }
        }
    }


    function resetPlcStructures(
        message =
            "No DB / UDT inventory loaded."
    ) {
        if (plcDbsSummary) {
            plcDbsSummary.textContent =
                "Data Blocks";
        }

        if (plcUdtsSummary) {
            plcUdtsSummary.textContent =
                "UDTs";
        }


        renderEmptyStructureTable(
            plcDbsBody,
            message,
            6
        );

        renderEmptyStructureTable(
            plcUdtsBody,
            message,
            5
        );

        resetPlcStructureDetail();
    }


    async function readPlcStructures() {
        const processId =
            selectedProcessId();

        const target =
            projectConfig.tia_target;


        if (!processId) {
            setPlcStructuresStatus(
                "Select a TIA process first.",
                "error"
            );

            return;
        }


        if (!target) {
            setPlcStructuresStatus(
                "Select an Active PLC first.",
                "error"
            );

            return;
        }


        readStructuresButton.disabled =
            true;

        resetPlcStructures(
            "Reading DB / UDT inventory from TIA Portal..."
        );

        setPlcStructuresStatus(
            `Reading DBs and UDTs from ${target.plc_name}...`
        );


        try {
            const query =
                new URLSearchParams({
                    process_id:
                        String(
                            processId
                        ),

                    device_name:
                        target.device_name,

                    plc_name:
                        target.plc_name,
                });


            const structures =
                await getJson(
                    "/api/v1/tia/plc-structures?"
                    +
                    query.toString()
                );


            loadedPlcStructures =
                structures;


            renderPlcStructures(
                loadedPlcStructures
            );


            const dbCount =
                structures.data_blocks
                    ?.length
                ??
                0;

            const udtCount =
                structures.udts
                    ?.length
                ??
                0;


            setPlcStructuresStatus(
                `${dbCount} DB(s), ${udtCount} UDT(s) read from ${target.plc_name}.`,
                "success"
            );

        } catch (error) {
            resetPlcStructures(
                "PLC structure read failed."
            );

            setPlcStructuresStatus(
                error.message,
                "error"
            );

        } finally {
            readStructuresButton.disabled =
                !projectConfig.tia_target;
        }
    }


    async function refreshProcesses() {
        refreshButton.disabled = true;

        processSelect.disabled = true;
        syncHmiConnectionControls();

        refreshPlcsButton.disabled = true;

        loadModelsButton.disabled = true;

        createPlcButton.disabled = true;


        resetModels();


        processSelect.replaceChildren();


        const loadingOption =
            document.createElement(
                "option"
            );

        loadingOption.value = "";

        loadingOption.textContent =
            "Loading TIA processes...";


        processSelect.appendChild(
            loadingOption
        );


        renderEmptyPlcs(
            "Waiting for TIA process selection."
        );


        setStatus(
            "Looking for running TIA Portal V21 processes..."
        );
        setTiaConnectionStatus("Detecting TIA Portal processes through Openness...");


        try {
            const processes =
                await getJson(
                    "/api/v1/tia/processes"
                );
            if (!Array.isArray(processes)) {
                throw new Error(
                    "TIA processes API returned an invalid response "
                    + "(expected a list). Check the backend at "
                    + "/api/v1/tia/processes."
                );
            }

            setTiaConnectionStatus(
                processes.length
                    ? processes.length + " TIA process(es) detected."
                    : "No running TIA Portal process was detected.",
                processes.length ? "success" : "normal"
            );
            processSelect.replaceChildren();


            const defaultOption =
                document.createElement(
                    "option"
                );

            defaultOption.value = "";

            defaultOption.textContent =
                "Select TIA process";


            processSelect.appendChild(
                defaultOption
            );


            for (
                const process
                of processes
            ) {
                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    String(
                        process.process_id
                    );

                option.textContent =
                    `TIA Portal PID ${process.process_id}`;


                processSelect.appendChild(
                    option
                );
            }


            processSelect.disabled =
                processes.length === 0;


            if (
                processes.length === 1
            ) {
                processSelect.value =
                    String(
                        processes[0]
                            .process_id
                    );


                await refreshProjectPlcs();
            }


            if (
                processes.length === 0
            ) {
                setStatus(
                    "No running TIA Portal process found.",
                    "error"
                );

            } else if (
                processes.length > 1
            ) {
                setStatus(
                    `${processes.length} TIA processes found. `
                    +
                    "Select the process containing the target project."
                );
            }

        } catch (error) {
            processSelect.replaceChildren();


            const errorOption =
                document.createElement(
                    "option"
                );

            errorOption.value = "";

            errorOption.textContent =
                "TIA process load failed";


            processSelect.appendChild(
                errorOption
            );


            renderEmptyPlcs(
                "Cannot read TIA processes."
            );


            setStatus(
                error.message,
                "error"
            );
            setTiaConnectionStatus(
                "TIA process discovery failed: " + error.message
                + ". Verify that TIA Portal V21 is open, then click Refresh TIA. "
                + "For the backend error response open /api/v1/tia/processes.",
                "error"
            );

        } finally {
            refreshButton.disabled =
                false;

            refreshPlcsButton.disabled =
                false;

            loadModelsButton.disabled =
                false;

            createPlcButton.disabled =
                false;
            syncHmiConnectionControls();
        }
    }


    async function refreshProjectPlcs() {
        const processId =
            selectedProcessId();


        if (!processId) {
            clearTarget();
            existingPlcs = [];

            existingHmis = [];

            resetHmiTranslation();

            currentProjectName = "";

            updateTargetSummary();

            renderEmptyPlcs(
                "Select a TIA process first."
            );

            renderEmptyHmis(
                "Select a TIA process first."
            );

            await refreshProjectLanguages();

            return;
        }


        refreshPlcsButton.disabled = true;
        syncHmiConnectionControls();


        renderEmptyPlcs(
            "Loading PLCs from the open TIA project..."
        );

        renderEmptyHmis(
            "Loading HMIs from the open TIA project..."
        );


        try {
            const query =
                new URLSearchParams({
                    process_id:
                        String(
                            processId
                        ),
                });


            const context =
                await getJson(
                    "/api/v1/tia/project-context?"
                    +
                    query.toString()
                );


            currentProjectName =
                context.project_name
                ||
                "";

            existingPlcs =
                context.plcs
                ??
                [];

            existingHmis =
                context.hmis
                ??
                [];

            updateTargetSummary();


            const savedTarget =
                projectConfig.tia_target;


            if (
                savedTarget
                &&
                !existingPlcs.some(
                    (plc) =>
                        sameTarget(
                            plc,
                            savedTarget
                        )
                )
            ) {
                clearTarget();
            }


            renderExistingPlcs();

            renderExistingHmis();

            await refreshProjectLanguages();

            suggestCreateNames();


            setStatus(
                `${existingPlcs.length} PLC(s), ${existingHmis.length} HMI(s) found in the open TIA project.`,
                "success"
            );

        } catch (error) {
            clearTarget();
            existingPlcs = [];

            existingHmis = [];

            currentProjectName = "";

            updateTargetSummary();

            renderEmptyPlcs(
                "PLC discovery failed."
            );

            renderEmptyHmis(
                "HMI discovery failed."
            );


            setStatus(
                error.message,
                "error"
            );

        } finally {
            refreshPlcsButton.disabled =
                false;
            syncHmiConnectionControls();
        }
    }


    function nextIndexFor(
        values,
        prefix
    ) {
        const pattern =
            new RegExp(
                `^${prefix.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                )}(\\d+)$`,
                "i"
            );


        let highest = 0;


        for (
            const value
            of values
        ) {
            const match =
                value.match(
                    pattern
                );


            if (!match) {
                continue;
            }


            highest =
                Math.max(
                    highest,
                    Number(
                        match[1]
                    )
                );
        }


        return highest + 1;
    }


    function suggestCreateNames() {
        const plcNames =
            existingPlcs.map(
                (plc) =>
                    plc.plc_name
            );


        const nextPlcIndex =
            nextIndexFor(
                plcNames,
                "PLC_"
            );


        if (
            !plcNameInput.value.trim()
            ||
            /^PLC_\d+$/i.test(
                plcNameInput.value.trim()
            )
        ) {
            plcNameInput.value =
                `PLC_${nextPlcIndex}`;
        }


        const family =
            getPlcFamily();


        if (
            family
            &&
            (
                !deviceNameInput.value.trim()
                ||
                /^S7-[^ ]+ Station_\d+$/i.test(
                    deviceNameInput.value.trim()
                )
            )
        ) {
            const devicePrefix =
                `${family} Station_`;


            const nextDeviceIndex =
                nextIndexFor(
                    existingPlcs.map(
                        (plc) =>
                            plc.device_name
                    ),
                    devicePrefix
                );


            deviceNameInput.value =
                `${devicePrefix}${nextDeviceIndex}`;
        }
    }


    async function loadModels() {
        const processId =
            selectedProcessId();

        const family =
            getPlcFamily();


        if (!processId) {
            setStatus(
                "Select a TIA Portal process first.",
                "error"
            );

            return;
        }


        if (!family) {
            setStatus(
                "Select PLC family first.",
                "error"
            );

            return;
        }


        loadModelsButton.disabled = true;

        modelSelect.disabled = true;

        createPlcButton.disabled = true;


        resetModels(
            "Loading PLC models..."
        );


        setStatus(
            `Loading ${family} models from the local TIA V21 Hardware Catalog...`
        );


        try {
            const query =
                new URLSearchParams({
                    process_id:
                        String(
                            processId
                        ),

                    family:
                        family,
                });


            const models =
                await getJson(
                    "/api/v1/tia/plc-models?"
                    +
                    query.toString()
                );


            modelSelect.replaceChildren();


            const defaultOption =
                document.createElement(
                    "option"
                );

            defaultOption.value = "";

            defaultOption.textContent =
                "Select PLC model";


            modelSelect.appendChild(
                defaultOption
            );


            for (
                const model
                of models
            ) {
                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    model.type_identifier;

                option.textContent =
                    model.name;

                option.title =
                    [
                        model.article_number,
                        model.version,
                    ]
                        .filter(Boolean)
                        .join(" ");


                modelSelect.appendChild(
                    option
                );
            }


            const manualOption =
                document.createElement(
                    "option"
                );

            manualOption.value =
                MANUAL_SELECTION;

            manualOption.textContent =
                "Wybierz inny...";


            modelSelect.appendChild(
                manualOption
            );


            modelSelect.disabled =
                false;


            if (
                models.length === 0
            ) {
                modelSelect.value =
                    MANUAL_SELECTION;

                manualContainer.classList.remove(
                    "hidden"
                );

                manualCodeInput.focus();
            }


            setStatus(
                `${models.length} unique PLC model(s) loaded.`
            );

        } catch (error) {
            resetModels(
                "PLC model load failed"
            );


            setStatus(
                error.message,
                "error"
            );

        } finally {
            loadModelsButton.disabled =
                false;

            createPlcButton.disabled =
                false;
        }
    }


    function modelChanged() {
        const manual =
            modelSelect.value
            ===
            MANUAL_SELECTION;


        manualContainer.classList.toggle(
            "hidden",
            !manual
        );


        if (manual) {
            manualCodeInput.focus();
        }
    }


    function getCreateSelection() {
        if (
            modelSelect.value
            ===
            MANUAL_SELECTION
        ) {
            return manualCodeInput
                .value
                .trim();
        }


        return modelSelect
            .value
            .trim();
    }


    function nameExists(
        propertyName,
        value
    ) {
        return existingPlcs.some(
            (plc) =>
                plc[propertyName]
                    .toLowerCase()
                ===
                value.toLowerCase()
        );
    }


    async function createPlc() {
        const processId =
            selectedProcessId();

        const selection =
            getCreateSelection();

        const deviceName =
            deviceNameInput
                .value
                .trim();

        const plcName =
            plcNameInput
                .value
                .trim();


        if (!processId) {
            setStatus(
                "Select a TIA Portal process first.",
                "error"
            );

            return;
        }


        if (!getPlcFamily()) {
            setStatus(
                "Select PLC family first.",
                "error"
            );

            return;
        }


        if (!selection) {
            setStatus(
                modelSelect.value
                ===
                MANUAL_SELECTION
                    ? "Enter a catalog order number or full TypeIdentifier."
                    : "Select a PLC model.",
                "error"
            );

            return;
        }


        if (!deviceName) {
            setStatus(
                "Device name is required.",
                "error"
            );

            deviceNameInput.focus();

            return;
        }


        if (!plcName) {
            setStatus(
                "PLC name is required.",
                "error"
            );

            plcNameInput.focus();

            return;
        }


        if (
            nameExists(
                "device_name",
                deviceName
            )
        ) {
            setStatus(
                `Device name "${deviceName}" already exists.`,
                "error"
            );

            return;
        }


        if (
            nameExists(
                "plc_name",
                plcName
            )
        ) {
            setStatus(
                `PLC name "${plcName}" already exists.`,
                "error"
            );

            return;
        }


        createPlcButton.disabled = true;


        setStatus(
            "Creating PLC in TIA Portal..."
        );


        try {
            const result =
                await postJson(
                    "/api/v1/tia/plcs",
                    {
                        process_id:
                            processId,

                        selection:
                            selection,

                        plc_name:
                            plcName,

                        device_name:
                            deviceName,
                    }
                );


            await refreshProjectPlcs();


            const created =
                existingPlcs.find(
                    (plc) =>
                        plc.device_name
                            .toLowerCase()
                        ===
                        result.device_name
                            .toLowerCase()
                        &&
                        plc.plc_name
                            .toLowerCase()
                        ===
                        result.plc_name
                            .toLowerCase()
                );


            if (created) {
                selectTarget(
                    created
                );
            }


            setStatus(
                `PLC created: ${result.plc_name} `
                +
                `(${result.device_name}).`,
                "success"
            );

        } catch (error) {
            setStatus(
                error.message,
                "error"
            );

        } finally {
            createPlcButton.disabled =
                false;
        }
    }


    async function renamePlc(
        plc
    ) {
        const processId =
            selectedProcessId();


        if (!processId) {
            return;
        }


        const newDeviceName =
            prompt(
                "New device name:",
                plc.device_name
            );


        if (
            newDeviceName === null
        ) {
            return;
        }


        const trimmedDeviceName =
            newDeviceName.trim();


        if (!trimmedDeviceName) {
            setStatus(
                "Device name cannot be empty.",
                "error"
            );

            return;
        }


        const newPlcName =
            prompt(
                "New PLC name:",
                plc.plc_name
            );


        if (
            newPlcName === null
        ) {
            return;
        }


        const trimmedPlcName =
            newPlcName.trim();


        if (!trimmedPlcName) {
            setStatus(
                "PLC name cannot be empty.",
                "error"
            );

            return;
        }


        try {
            const result =
                await patchJson(
                    "/api/v1/tia/plcs",
                    {
                        process_id:
                            processId,

                        current_device_name:
                            plc.device_name,

                        current_plc_name:
                            plc.plc_name,

                        new_device_name:
                            trimmedDeviceName,

                        new_plc_name:
                            trimmedPlcName,
                    }
                );


            const wasActive =
                sameTarget(
                    plc,
                    projectConfig.tia_target
                );


            await refreshProjectPlcs();


            if (wasActive) {
                const renamed =
                    existingPlcs.find(
                        (item) =>
                            item.device_name
                                .toLowerCase()
                            ===
                            result.device_name
                                .toLowerCase()
                        &&
                            item.plc_name
                                .toLowerCase()
                            ===
                            result.plc_name
                                .toLowerCase()
                    );


                if (renamed) {
                    selectTarget(
                        renamed
                    );
                }
            }


            setStatus(
                `PLC renamed to ${result.plc_name} `
                +
                `(${result.device_name}).`,
                "success"
            );

        } catch (error) {
            setStatus(
                error.message,
                "error"
            );
        }
    }


    async function deletePlc(
        plc
    ) {
        const processId =
            selectedProcessId();


        if (!processId) {
            return;
        }


        const confirmed =
            confirm(
                `Delete PLC "${plc.plc_name}" and device `
                +
                `"${plc.device_name}" from the TIA project?\n\n`
                +
                "This deletes the complete device station."
            );


        if (!confirmed) {
            return;
        }


        try {
            await deleteJson(
                "/api/v1/tia/plcs",
                {
                    process_id:
                        processId,

                    device_name:
                        plc.device_name,

                    plc_name:
                        plc.plc_name,
                }
            );


            if (
                sameTarget(
                    plc,
                    projectConfig.tia_target
                )
            ) {
                clearTarget();
            }


            await refreshProjectPlcs();


            setStatus(
                `PLC ${plc.plc_name} deleted.`,
                "success"
            );

        } catch (error) {
            setStatus(
                error.message,
                "error"
            );
        }
    }


    refreshButton.addEventListener(
        "click",
        refreshProcesses
    );
    hmiRefreshButton?.addEventListener("click", refreshProcesses);
    hmiRefreshProjectButton?.addEventListener("click", refreshProjectPlcs);
    // Both tabs are views of the same running TIA process. The change event
    // follows the existing PLC handler and refreshes PLC/HMI inventory once.
    hmiProcessSelect?.addEventListener("change", () => {
        processSelect.value = hmiProcessSelect.value;
        processSelect.dispatchEvent(new Event("change"));
    });


    refreshPlcsButton.addEventListener(
        "click",
        refreshProjectPlcs
    );


    if (readTagsButton) {
        readTagsButton.addEventListener(
            "click",
            readPlcTags
        );
    }


    if (readProgramBlocksButton) {
        readProgramBlocksButton.addEventListener(
            "click",
            readPlcProgramBlocks
        );
    }


    if (readStructuresButton) {
        readStructuresButton.addEventListener(
            "click",
            readPlcStructures
        );
    }


    for (
        const button
        of plcTagSortButtons
    ) {
        button.addEventListener(
            "click",
            () =>
                setPlcTagSort(
                    button.dataset
                        .plcTagSort
                )
        );
    }


    if (plcTagsTableFilter) {
        plcTagsTableFilter.addEventListener(
            "change",
            () =>
                renderPlcTags(
                    loadedPlcTags
                )
        );
    }


    if (plcTagsTypeFilter) {
        plcTagsTypeFilter.addEventListener(
            "change",
            () =>
                renderPlcTags(
                    loadedPlcTags
                )
        );
    }


    if (plcTagsCategoryFilter) {
        plcTagsCategoryFilter.addEventListener(
            "change",
            () =>
                renderPlcTags(
                    loadedPlcTags
                )
        );
    }


    if (plcProgramBlocksKindFilter) {
        plcProgramBlocksKindFilter.addEventListener(
            "change",
            () =>
                renderPlcProgramBlocks(
                    loadedPlcProgramBlocks
                )
        );
    }


    if (plcDbsSort) {
        plcDbsSort.addEventListener(
            "change",
            () =>
                renderPlcStructures(
                    loadedPlcStructures
                )
        );
    }


    if (plcUdtsSort) {
        plcUdtsSort.addEventListener(
            "change",
            () =>
                renderPlcStructures(
                    loadedPlcStructures
                )
        );
    }


    processSelect.addEventListener(
        "change",
        async () => {
            resetModels();

            existingPlcs = [];

            existingHmis = [];

            currentProjectName = "";

            updateTargetSummary();

            loadedPlcTags = [];

            resetPlcTagFilters();

            loadedPlcProgramBlocks = [];

            loadedPlcStructures = {
                data_blocks: [],
                udts: [],
            };

            renderExistingPlcs();

            renderEmptyPlcTags(
                "Select an Active PLC and click Read PLC tags."
            );

            setPlcTagsStatus(
                "PLC tags not loaded."
            );

            resetPlcProgramBlocks(
                "Select an Active PLC and click Read program blocks."
            );

            setPlcProgramBlocksStatus(
                "Program block inventory not loaded."
            );


            resetPlcStructures(
                "Select an Active PLC and click Read DB / UDT."
            );

            setPlcStructuresStatus(
                "DB / UDT inventory not loaded."
            );


            if (
                selectedProcessId()
            ) {
                await refreshProjectPlcs();

            } else {
                setStatus(
                    "Select a TIA process."
                );
            }
        }
    );


    loadModelsButton.addEventListener(
        "click",
        loadModels
    );


    modelSelect.addEventListener(
        "change",
        modelChanged
    );



    if (hmiSourceLanguageSelect) {
        hmiSourceLanguageSelect.addEventListener(
            "change",
            () => {
                populateHmiTranslationLanguages();
            }
        );
    }


    if (hmiTargetLanguageSelect) {
        hmiTargetLanguageSelect.addEventListener(
            "change",
            invalidateHmiPreview
        );
    }

    if (hmiViewPathRootSelect) {
        hmiViewPathRootSelect.addEventListener(
            "change",
            invalidateHmiPreview
        );
    }



    // One Prepare/Import pair routes the checked scopes, without automatic XML writes.
    hmiTranslateButton?.addEventListener(
        "click", () => { void prepareSelectedHmiBatch(); }
    );
    hmiImportReviewedButton?.addEventListener(
        "click", () => {
            if (hmiReviewQueueActive) void approveReviewedHmiQueueBatch();
            else void importSelectedHmiBatch();
        }
    );
    if (hmiPreviewFilter) {
        hmiPreviewFilter.addEventListener("change", renderHmiPreviewRows);
    }
    hmiBatchSizeInput?.addEventListener("input", () => {
        discardHmiReview();
        discardHmiTextListReview();
        renderHmiBatchPlan();
        updateHmiTranslateButtonState();
    });
    hmiBatchTotalInput?.addEventListener("input", () => {
        discardHmiReview();
        discardHmiTextListReview();
        renderHmiBatchPlan();
        updateHmiTranslateButtonState();
    });
    hmiBatchAutoRepeat?.addEventListener("change", renderHmiBatchPlan);
    hmiReviewEachBatch?.addEventListener("change", () => {
        if (!hmiReviewQueueActive) {
            if (hmiUnifiedRunning) {
                hmiUnifiedReviewHandoffRequested = hmiReviewEachBatch.checked;
                if (hmiUnifiedStatus) hmiUnifiedStatus.textContent =
                    hmiReviewEachBatch.checked
                        ? "Review requested. The current automatic TIA batch will finish "
                            + "and verify; the next batch will await approval."
                        : "Automatic mode restored. The current batch continues and "
                            + "the queue will continue automatically.";
            }
            updateHmiTranslateButtonState();
            return;
        }
        // A rendered review is an explicit approval boundary.  A mode change
        // may choose how to continue afterwards, but cannot approve or import
        // the batch currently being edited.
        if (hmiReviewQueuePending) {
            if (!hmiReviewQueueOperation && hmiUnifiedStatus) {
                hmiUnifiedStatus.textContent =
                    "Prepared batch still awaits approval. The mode change "
                    + "will apply after you approve or skip this batch.";
            }
            updateHmiTranslateButtonState();
            return;
        }
        hmiReviewQueueAutoContinue = !hmiReviewEachBatch.checked;
        // An in-flight operation owns its status and lock until its awaited
        // completion. The boundary then reads this latest mode and Pause/Stop.
        void continueReviewedQueueAutomatically();
        updateHmiTranslateButtonState();
    });

    const changeHmiScope = (changed) => {
        if (hmiPreviewInProgress || hmiTextListBusy || hmiReviewInProgress
            || hmiBatchRunning || hmiBatchStarting || hmiAuditInProgress
            || hmiXmlAutoRunning || hmiUnifiedRunning || hmiReviewQueueActive) {
            changed.checked = !changed.checked;
            return;
        }
        // Independent checkboxes: zero, one or both text types may be selected.
        invalidateHmiPreview();
        applyHmiScope();
        updateHmiTranslateButtonState();
    };
    hmiScopeProject?.addEventListener(
        "change", () => changeHmiScope(hmiScopeProject)
    );
    hmiScopeLists?.addEventListener(
        "change", () => changeHmiScope(hmiScopeLists)
    );
    hmiScanButton?.addEventListener(
        "click", () => { void previewSelectedHmi(); }
    );
    hmiAuditExistingButton?.addEventListener(
        "click", () => { void auditExistingHmiTranslations(); }
    );
    hmiExistingQaReportButton?.addEventListener(
        "click", () => { void downloadHmiExistingQaReport(); }
    );
    hmiQualityReportButton?.addEventListener(
        "click", () => { void downloadHmiBatchQualityReport(); }
    );
    hmiUseScanTotalButton?.addEventListener("click", () => {
        const count = combinedMissingCount() + hmiCombinedApprovedCount;
        if (!count || count > 100000) return;
        if (hmiBatchTotalInput) {
            hmiBatchTotalInput.value = String(count);
            discardHmiReview();
            renderHmiBatchPlan();
            updateHmiTranslateButtonState();
        }
    });

    hmiRunReportButton?.addEventListener("click", downloadHmiRunReport);
    hmiDiagnosticsButton?.addEventListener("click", downloadHmiDiagnostics);
    hmiSkipReviewedButton?.addEventListener("click", () => {
        void skipReviewedHmiQueueBatch();
    });
    hmiBatchStartButton?.addEventListener(
        "click", () => { void translateAllSelectedHmi(); }
    );
    hmiBatchResumeButton?.addEventListener(
        "click", () => {
            if (hmiReviewQueuePaused) {
                if (hmiReviewQueueOperation || hmiReviewQueueStopRequested) return;
                hmiReviewQueuePaused = false;
                void continueReviewedQueueAutomatically();
            } else {
                void resumeHmiBatchImport();
            }
        }
    );
    hmiBatchPauseButton?.addEventListener(
        "click", () => { void pauseUnifiedHmiTranslation(); }
    );
    hmiBatchStopButton?.addEventListener(
        "click", () => { stopUnifiedHmiTranslation(); }
    );

    if (hmiOllamaModelSelect) {
        hmiOllamaModelSelect.addEventListener(
            "change",
            () => {
                // Keep scan counts/results; remove proposals made by the old model.
                discardHmiReview();
                discardHmiTextListReview();
                updateHmiTranslateButtonState();
                setHmiTranslationStatus(
                    "Ollama model changed. Scan remains valid; "
                    + "prepare new translations with the selected model."
                );
            }
        );
    }
    if (hmiRefreshOllamaModels) {
        hmiRefreshOllamaModels.addEventListener(
            "click",
            refreshHmiOllamaModels
        );
    }


    createPlcButton.addEventListener(
        "click",
        createPlc
    );


    manualCodeInput.addEventListener(
        "keydown",
        (event) => {
            if (
                event.key === "Enter"
            ) {
                createPlc();
            }
        }
    );


    updateTargetSummary();
    syncHmiConnectionControls();
    renderHmiBatchProgress(0, 0);
    renderHmiBatchPlan();
    applyHmiScope();

    renderPlcTagSortHeaders();

    resetPlcTagFilters();

    renderEmptyPlcTags(
        projectConfig.tia_target
            ? "Click Read PLC tags to load tags from the Active PLC."
            : "Select an Active PLC first."
    );

    setPlcTagsStatus(
        projectConfig.tia_target
            ? "PLC tags not loaded."
            : "Select an Active PLC first."
    );

    resetPlcProgramBlocks(
        projectConfig.tia_target
            ? "Click Read program blocks to inspect the Active PLC."
            : "Select an Active PLC first."
    );

    setPlcProgramBlocksStatus(
        projectConfig.tia_target
            ? "Program block inventory not loaded."
            : "Select an Active PLC first."
    );


    resetPlcStructures(
        projectConfig.tia_target
            ? "Click Read DB / UDT to load structures from the Active PLC."
            : "Select an Active PLC first."
    );

    setPlcStructuresStatus(
        projectConfig.tia_target
            ? "DB / UDT inventory not loaded."
            : "Select an Active PLC first."
    );

    suggestCreateNames();


    return {
        refreshProcesses,
        refreshProjectPlcs,
        familyChanged,
        updateTargetSummary,
    };
}
