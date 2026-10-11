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


const MANUAL_SELECTION =
    "__manual__";


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

    const languageSelect =
        document.getElementById(
            "tia-language-select"
        );

    const addLanguageButton =
        document.getElementById(
            "tia-add-language-button"
        );

    const languagesStatus =
        document.getElementById(
            "tia-languages-status"
        );

    const activeLanguagesElement =
        document.getElementById(
            "tia-active-languages"
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

    const hmiTranslationScopeSelect =
        document.getElementById(
            "tia-hmi-translation-scope"
        );

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

    const hmiPreviewButton =
        document.getElementById(
            "tia-hmi-preview-button"
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

    let verifiedHmiPreviewKey = null;
    let hmiPreviewInProgress = false;
    let lastHmiPreviewRows = [];
    let hmiReviewInProgress = false;
    let preparedHmiReview = null;

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
            5;

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


            for (
                const value
                of [
                    hmi.device_name
                    ||
                    "—",

                    hmi.hmi_name
                    ||
                    "—",

                    hmi.hmi_type_identifier
                    ||
                    hmi.device_type_identifier
                    ||
                    "—",

                    hmi.software_name
                    ||
                    hmi.software_type
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
            source_culture: sourceCulture,
            target_culture: targetCulture,
        };
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
        const selected = hmiPreviewFilter?.value || "matched";
        const matching = selected === "matched";
        const subset = lastHmiPreviewRows.filter(
            item => Boolean(item.matches_hmi) === matching
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
        hmiReviewResults?.classList.add("hidden");
        hmiReviewRows?.replaceChildren();
        updateHmiTranslateButtonState();
    }

    function invalidateHmiPreview() {
        verifiedHmiPreviewKey = null;
        hmiPreviewResults?.classList.add("hidden");
        lastHmiPreviewRows = [];
        renderHmiPreviewRows();
        discardHmiReview();
    }

    function updateHmiTranslateButtonState() {
        const selection = hmiTranslationSelection();
        const key = hmiTranslationKey(selection);
        const isVerified = Boolean(key && key === verifiedHmiPreviewKey);
        const busy = hmiPreviewInProgress || hmiReviewInProgress;
        if (hmiTranslateButton) {
            hmiTranslateButton.disabled =
                busy || !isVerified || !hmiOllamaModelSelect?.value;
        }
        if (hmiPreviewButton) {
            hmiPreviewButton.disabled = busy || !selection;
        }
        if (hmiImportReviewedButton) {
            hmiImportReviewedButton.disabled =
                busy || !preparedHmiReview || preparedHmiReview.selectionKey !== key;
        }
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
                invalidateHmiPreview();
            } else {
                updateHmiTranslateButtonState();
            }
        }
    }


    async function previewSelectedHmi() {
        const selection = hmiTranslationSelection();
        if (!selection) {
            setHmiTranslationStatus("Select HMI, source slot and target language.", "error");
            return false;
        }

        invalidateHmiPreview();
        hmiPreviewInProgress = true;
        updateHmiTranslateButtonState();
        setHmiTranslationStatus("Exporting Project texts for read-only preview...");
        const previewKey = hmiTranslationKey(selection);
        try {
            const result = await postJson("/api/v1/tia/hmis/preview-texts", selection);
            if (hmiTranslationKey(hmiTranslationSelection()) !== previewKey) {
                return false;
            }
            lastHmiPreviewRows = result.sample_rows || [];
            renderHmiPreviewRows();

            if (hmiPreviewSummary) {
                hmiPreviewSummary.textContent =
                    `Source column: ${result.source_column_header || "unknown"}; `
                    + `target column: ${result.target_column_header || "unknown"}. `
                    + `${result.matched_text_rows} matched of ${result.total_text_rows} text rows `
                    + `across ${result.worksheets_found} sheet(s). `
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
                verifiedHmiPreviewKey = previewKey;
                setHmiTranslationStatus(
                    `Preview found ${result.matched_text_rows} matching text row(s). `
                    + "Check the sample references before translating.", "success"
                );
                return true;
            } else {
                setHmiTranslationStatus(
                    "No matching HMI rows. Select the correct exported ViewPath root "
                    + "above, then click Preview texts again.", "error"
                );
                return false;
            }
        } catch (error) {
            setHmiTranslationStatus(error.message, "error");
            return false;
        } finally {
            hmiPreviewInProgress = false;
            updateHmiTranslateButtonState();
        }
    }


    function populateHmiTranslationLanguages() {
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

        invalidateHmiPreview();
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


    async function translateSelectedHmi() {
        const selection = hmiTranslationSelection();
        const key = hmiTranslationKey(selection);
        if (!selection || !key || key !== verifiedHmiPreviewKey) {
            setHmiTranslationStatus(
                "Preview this HMI and ViewPath root before preparing translations.",
                "error"
            );
            return;
        }

        const scope = hmiTranslationScopeSelect?.value || "10";
        if (scope === "all" && !confirm(
            "Generate local Ollama translations for all matching HMI texts? "
            + "This may take a long time depending on your hardware and model. "
            + "No TIA changes will be made yet."
        )) {
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
            "Starting HMI project-text export and local Ollama translation..."
        );

        try {
            const result = await postJson(
                "/api/v1/tia/hmis/prepare-translations",
                {
                    ...selection,
                    max_rows: scope === "all" ? null : 10,
                    progress_id: progressId,
                }
            );
            if (hmiTranslationKey(hmiTranslationSelection()) !== key
                || verifiedHmiPreviewKey !== key) {
                return;
            }

            preparedHmiReview = {
                reviewId: result.review_id,
                selectionKey: key,
                rowCount: result.selected_rows,
            };
            hmiReviewRows?.replaceChildren();
            for (const item of result.examples || []) {
                const row = document.createElement("tr");
                addHmiTextCell(row, item.source_text);
                addHmiTextCell(row, item.current_target || "— (empty)");
                addHmiTextCell(row, item.proposed_target);
                addHmiDetailsCell(row, item.view_path, "", item.sheet, null);
                hmiReviewRows?.appendChild(row);
            }
            if (hmiReviewSummary) {
                hmiReviewSummary.textContent =
                    "Prepared " + result.selected_rows + " row(s), "
                    + result.unique_texts + " unique source text(s). "
                    + "These are NEW proposed values, not existing target values. "
                    + "Review each displayed proposal before importing."
                    + (result.selected_rows > (result.examples || []).length
                        ? " Showing first " + result.examples.length + " of "
                            + result.selected_rows + " proposed rows."
                        : "");
            }
            hmiReviewResults?.classList.remove("hidden");
            hmiReviewResults?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
            setHmiTranslationStatus(
                "Translations prepared. TIA project was not changed. "
                + "Review the Proposed target column, then choose Import reviewed texts.",
                "success"
            );
        } catch (error) {
            setHmiTranslationStatus(error.message, "error");
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
        // Rebuild the target list for the restored source culture.
        populateHmiTranslationLanguages();
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
        const review = preparedHmiReview;
        const selectionBeforeImport = hmiTranslationSelection();
        const key = hmiTranslationKey(selectionBeforeImport);
        if (!review || review.selectionKey !== key
            || verifiedHmiPreviewKey !== key) {
            setHmiTranslationStatus(
                "Translations must be prepared and reviewed for this HMI first.",
                "error"
            );
            return;
        }

        if (!confirm(
            "Import " + review.rowCount
            + " PREPARED text row(s) into the selected TIA project? "
            + "The project will be saved and each imported value verified."
        )) {
            return;
        }

        hmiReviewInProgress = true;
        updateHmiTranslateButtonState();
        setHmiTranslationStatus(
            "Importing approved texts into TIA, then verifying by re-export..."
        );

        // A review can be imported once. On any failure a fresh review is required.
        preparedHmiReview = null;
        try {
            const result = await postJson(
                "/api/v1/tia/hmis/import-reviewed-translations",
                { review_id: review.reviewId }
            );
            const count = result.verified_rows || 0;
            setHmiTranslationStatus(
                "TIA import " + result.import_state + ". Verified "
                + count + " of " + result.imported_rows
                + " translated row(s) by exporting from TIA again."
                + (result.import_log ? " Log: " + result.import_log : ""),
                count === result.imported_rows ? "success" : "error"
            );
            await refreshProjectLanguages();
            const restored = restoreHmiTranslationAfterImport(
                selectionBeforeImport
            );
            if (restored) {
                // A completed import changes the XLSX values. Re-preview the
                // updated TIA project before preparing the remaining texts.
                // This preserves the verified HMI root and target language.
                const previewUpdated = await previewSelectedHmi();
                if (previewUpdated) {
                    setHmiTranslationStatus(
                        "TIA import verified: " + count + " row(s). "
                        + "Selection restored and project texts refreshed. "
                        + "Choose All matched texts (if desired), then Prepare translations. "
                        + (result.import_log ? "Log: " + result.import_log : ""),
                        "success"
                    );
                } else {
                    setHmiTranslationStatus(
                        "TIA import verified: " + count + " row(s). "
                        + "Automatic preview did not complete; click Preview texts "
                        + "again before preparing further translations.",
                        "error"
                    );
                }
            } else {
                invalidateHmiPreview();
                setHmiTranslationStatus(
                    "TIA import verified: " + count + " row(s), but the HMI "
                    + "selection changed. Reselect the source/target language "
                    + "and click Preview texts before continuing.",
                    "success"
                );
            }
        } catch (error) {
            setHmiTranslationStatus(
                error.message + " Prepare a new translation review before retrying.",
                "error"
            );
        } finally {
            hmiReviewInProgress = false;
            updateHmiTranslateButtonState();
        }
    }


    function setLanguagesStatus(
        message,
        type = "normal"
    ) {
        if (!languagesStatus) {
            return;
        }

        languagesStatus.textContent =
            message;

        languagesStatus.classList.toggle(
            "error",
            type === "error"
        );

        languagesStatus.classList.toggle(
            "success",
            type === "success"
        );
    }


    function renderProjectLanguages() {
        if (
            !languageSelect
            ||
            !activeLanguagesElement
        ) {
            return;
        }

        activeLanguagesElement.replaceChildren();
        languageSelect.replaceChildren();

        const active =
            projectLanguages.filter(
                language =>
                    language.is_active
            );

        const inactive =
            projectLanguages.filter(
                language =>
                    !language.is_active
            );

        for (
            const language
            of active
        ) {
            const chip =
                document.createElement(
                    "span"
                );

            chip.className =
                "language-chip";

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

            chip.textContent =
                language.culture
                +
                (
                    roles.length
                        ? " · " + roles.join(" / ")
                        : ""
                );

            chip.title =
                language.english_name
                +
                (
                    language.native_name
                        ? " / " + language.native_name
                        : ""
                );

            activeLanguagesElement.appendChild(
                chip
            );
        }

        const placeholder =
            document.createElement(
                "option"
            );

        placeholder.value = "";

        placeholder.textContent =
            inactive.length
                ? "Select language"
                : "All supported languages are active";

        languageSelect.appendChild(
            placeholder
        );

        for (
            const language
            of inactive
        ) {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                language.culture;

            option.textContent =
                language.english_name
                +
                " ("
                +
                language.culture
                +
                ")";

            languageSelect.appendChild(
                option
            );
        }

        languageSelect.disabled =
            inactive.length === 0;

        addLanguageButton.disabled =
            inactive.length === 0;

        populateHmiTranslationLanguages();

        setLanguagesStatus(
            String(active.length)
            +
            " active project language(s).",
            "success"
        );
    }


    async function refreshProjectLanguages() {
        const processId =
            selectedProcessId();

        if (!processId) {
            projectLanguages = [];

            if (languageSelect) {
                languageSelect.replaceChildren();

                const option =
                    document.createElement(
                        "option"
                    );

                option.value = "";
                option.textContent =
                    "Select a TIA process first";

                languageSelect.appendChild(
                    option
                );

                languageSelect.disabled =
                    true;
            }

            if (addLanguageButton) {
                addLanguageButton.disabled =
                    true;
            }

            if (activeLanguagesElement) {
                activeLanguagesElement.replaceChildren();
            }

            setLanguagesStatus(
                "Select a TIA process first."
            );

            return;
        }

        setLanguagesStatus(
            "Reading project languages from TIA Portal..."
        );

        try {
            const query =
                new URLSearchParams({
                    process_id:
                        String(
                            processId
                        ),
                });

            projectLanguages =
                await getJson(
                    "/api/v1/tia/languages?"
                    +
                    query.toString()
                );

            renderProjectLanguages();

        } catch (error) {
            projectLanguages = [];

            setLanguagesStatus(
                error.message,
                "error"
            );
        }
    }


    async function addProjectLanguage() {
        const processId =
            selectedProcessId();

        const culture =
            languageSelect
                ?.value
                ?.trim();

        if (
            !processId
            ||
            !culture
        ) {
            return;
        }

        addLanguageButton.disabled =
            true;

        languageSelect.disabled =
            true;

        setLanguagesStatus(
            "Adding "
            +
            culture
            +
            " to the TIA project..."
        );

        try {
            await postJson(
                "/api/v1/tia/languages",
                {
                    process_id:
                        processId,

                    culture:
                        culture,
                }
            );

            await refreshProjectLanguages();

            setLanguagesStatus(
                culture
                +
                " added to the project. It is now available for HMI/project text translation.",
                "success"
            );

        } catch (error) {
            setLanguagesStatus(
                error.message,
                "error"
            );

            renderProjectLanguages();
        }
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
        message
    ) {
        if (!plcProgramBlocksBody) {
            return;
        }


        plcProgramBlocksBody.replaceChildren();


        const row =
            document.createElement(
                "tr"
            );

        const cell =
            document.createElement(
                "td"
            );

        cell.colSpan =
            8;

        cell.className =
            "empty-table-cell";

        cell.textContent =
            message;


        row.appendChild(
            cell
        );

        plcProgramBlocksBody.appendChild(
            row
        );
    }


    function resetPlcProgramBlocks(
        message =
            "No program block inventory loaded."
    ) {
        loadedPlcProgramBlocks = [];


        if (plcProgramBlocksSummary) {
            plcProgramBlocksSummary.textContent =
                "Program blocks";
        }


        if (plcProgramBlocksKindFilter) {
            plcProgramBlocksKindFilter.value =
                "";
        }


        renderEmptyProgramBlocks(
            message
        );

        resetPlcProgramBlockDetail();
    }


    function renderPlcProgramBlocks(
        blocks
    ) {
        if (!plcProgramBlocksBody) {
            return;
        }


        const kindFilter =
            plcProgramBlocksKindFilter
                ?.value
            ||
            "";


        const visible =
            blocks.filter(
                block =>
                    !kindFilter
                    ||
                    block.kind ===
                        kindFilter
            );


        plcProgramBlocksBody.replaceChildren();


        if (plcProgramBlocksSummary) {
            plcProgramBlocksSummary.textContent =
                `Program blocks (${visible.length} / ${blocks.length})`;
        }


        if (visible.length === 0) {
            renderEmptyProgramBlocks(
                blocks.length === 0
                    ? "No program blocks found."
                    : "No program blocks match the selected type."
            );

            return;
        }


        for (
            const block
            of visible
        ) {
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


            plcProgramBlocksBody.appendChild(
                row
            );
        }
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
                5;

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
            for (
                const member
                of members
            ) {
                const row =
                    document.createElement(
                        "tr"
                    );


                const values = [
                    member.section
                    ||
                    "—",

                    member.name
                    ||
                    "—",

                    member.data_type
                    ||
                    "—",

                    member.offset
                    ||
                    "—",

                    member.comment
                    ||
                    "—",
                ];


                values.forEach(
                    (value, index) => {
                        const cell =
                            document.createElement(
                                "td"
                            );

                        cell.textContent =
                            value;

                        if (index === 1) {
                            cell.style.paddingLeft =
                                `${12 + (member.level || 0) * 18}px`;

                            cell.title =
                                member.path
                                ||
                                member.name;
                        }

                        row.appendChild(
                            cell
                        );
                    }
                );


                plcProgramBlockDetailBody.appendChild(
                    row
                );
            }
        }


        setPlcProgramBlockDetailStatus(
            `${members.length} interface member(s) loaded.`,
            "success"
        );
    }


    async function readPlcProgramBlockDetail(
        block
    ) {
        const processId =
            selectedProcessId();

        const target =
            projectConfig.tia_target;


        if (
            !processId
            ||
            !target
        ) {
            return;
        }


        plcProgramBlockDetail.classList.remove(
            "hidden"
        );

        setPlcProgramBlockDetailStatus(
            `Exporting ${block.name} from TIA Portal...`
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

                    group_path:
                        block.group_path
                        ||
                        "",

                    name:
                        block.name,
                });


            const detail =
                await getJson(
                    "/api/v1/tia/plc-program-block?"
                    +
                    query.toString()
                );


            renderPlcProgramBlockDetail(
                detail
            );

        } catch (error) {
            setPlcProgramBlockDetailStatus(
                error.message,
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
                    "DB",
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
                `${blocks.length} block(s) read from ${target.plc_name}`
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
                5;

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


        for (
            const member
            of detail.members
        ) {
            const row =
                document.createElement(
                    "tr"
                );


            const sectionCell =
                document.createElement(
                    "td"
                );

            sectionCell.textContent =
                member.section
                ||
                "—";


            const memberCell =
                document.createElement(
                    "td"
                );

            memberCell.textContent =
                member.name;

            memberCell.title =
                member.path
                ||
                member.name;

            memberCell.style.paddingLeft =
                `${12 + (member.level || 0) * 18}px`;


            const typeCell =
                document.createElement(
                    "td"
                );

            typeCell.textContent =
                member.data_type
                ||
                "—";


            const offsetCell =
                document.createElement(
                    "td"
                );

            offsetCell.textContent =
                member.offset
                ||
                "—";


            const commentCell =
                document.createElement(
                    "td"
                );

            commentCell.textContent =
                member.comment
                ||
                "—";


            row.append(
                sectionCell,
                memberCell,
                typeCell,
                offsetCell,
                commentCell
            );

            plcStructureDetailBody.appendChild(
                row
            );
        }


        setPlcStructureDetailStatus(
            `${detail.members.length} member(s) loaded.`,
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


        try {
            const processes =
                await getJson(
                    "/api/v1/tia/processes"
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

        } finally {
            refreshButton.disabled =
                false;

            refreshPlcsButton.disabled =
                false;

            loadModelsButton.disabled =
                false;

            createPlcButton.disabled =
                false;
        }
    }


    async function refreshProjectPlcs() {
        const processId =
            selectedProcessId();


        if (!processId) {
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


    if (addLanguageButton) {
        addLanguageButton.addEventListener(
            "click",
            addProjectLanguage
        );
    }


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


    if (hmiPreviewButton) {
        hmiPreviewButton.addEventListener(
            "click",
            previewSelectedHmi
        );
    }


    if (hmiTranslateButton) {
        hmiTranslateButton.addEventListener(
            "click",
            translateSelectedHmi
        );
    }

    if (hmiImportReviewedButton) {
        hmiImportReviewedButton.addEventListener(
            "click",
            importReviewedHmiTexts
        );
    }

    if (hmiPreviewFilter) {
        hmiPreviewFilter.addEventListener("change", renderHmiPreviewRows);
    }
    if (hmiTranslationScopeSelect) {
        hmiTranslationScopeSelect.addEventListener(
            "change",
            discardHmiReview
        );
    }

    if (hmiOllamaModelSelect) {
        hmiOllamaModelSelect.addEventListener(
            "change",
            invalidateHmiPreview
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
