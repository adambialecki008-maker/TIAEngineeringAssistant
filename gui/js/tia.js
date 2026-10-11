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

    let currentProjectName = "";


    let loadedPlcTags = [];

    let plcTagSortState = {
        key: "name",
        direction: "asc",
    };

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

        resetPlcStructures(
            "Select an Active PLC first."
        );

        setPlcStructuresStatus(
            "Select an Active PLC first."
        );
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

        cell.colSpan = 4;

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

            currentProjectName = "";

            updateTargetSummary();

            renderEmptyPlcs(
                "Select a TIA process first."
            );

            return;
        }


        refreshPlcsButton.disabled = true;


        renderEmptyPlcs(
            "Loading PLCs from the open TIA project..."
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

            suggestCreateNames();


            setStatus(
                `${existingPlcs.length} PLC(s) found in the open TIA project.`,
                "success"
            );

        } catch (error) {
            existingPlcs = [];

            currentProjectName = "";

            updateTargetSummary();

            renderEmptyPlcs(
                "PLC discovery failed."
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

            currentProjectName = "";

            updateTargetSummary();

            loadedPlcTags = [];

            resetPlcTagFilters();

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
