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

    const headerActivePlcElement =
        document.getElementById(
            "active-plc-summary"
        );

    const previewTargetPlcElement =
        document.getElementById(
            "preview-target-plc"
        );


    let existingPlcs = [];


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


        let text =
            "Active PLC: not selected";


        let projectText =
            "No PLC selected.";


        let previewText =
            "Target PLC: not selected";


        if (target) {
            text =
                `Active PLC: ${target.plc_name} `
                +
                `(${target.device_name})`;

            projectText =
                `${target.plc_name} on ${target.device_name}`;

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
            projectText;

        previewTargetPlcElement.textContent =
            previewText;
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


            existingPlcs =
                await getJson(
                    "/api/v1/tia/plcs?"
                    +
                    query.toString()
                );


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


    processSelect.addEventListener(
        "change",
        async () => {
            resetModels();

            existingPlcs = [];

            renderExistingPlcs();


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

    suggestCreateNames();


    return {
        refreshProcesses,
        refreshProjectPlcs,
        familyChanged,
        updateTargetSummary,
    };
}
