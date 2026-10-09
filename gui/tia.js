import {
    getJson,
    postJson,
} from "./api.js";


const OTHER_VALUE =
    "__other__";


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


    const manualInput =
        document.getElementById(
            "tia-manual-code"
        );


    const plcNameInput =
        document.getElementById(
            "tia-plc-name"
        );


    const createButton =
        document.getElementById(
            "tia-create-plc-button"
        );


    const status =
        document.getElementById(
            "tia-status"
        );


    refreshButton.addEventListener(
        "click",
        refreshProcesses
    );


    loadModelsButton.addEventListener(
        "click",
        loadModels
    );


    modelSelect.addEventListener(
        "change",
        updateManualVisibility
    );


    createButton.addEventListener(
        "click",
        createPlc
    );


    async function refreshProcesses() {
        setStatus(
            "Searching for TIA Portal..."
        );


        processSelect.innerHTML =
            `<option value="">Select TIA process</option>`;


        clearModels();


        try {
            const processes =
                await getJson(
                    "/api/v1/tia/processes"
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
                    `TIA Portal — PID ${process.process_id}`;


                processSelect.appendChild(
                    option
                );
            }


            if (
                processes.length === 1
            ) {
                processSelect.value =
                    String(
                        processes[0]
                            .process_id
                    );
            }


            if (
                processes.length === 0
            ) {
                setStatus(
                    "No running TIA Portal process found.",
                    true
                );

                return;
            }


            setStatus(
                `${processes.length} TIA Portal process(es) found.`
            );

        } catch (error) {
            console.error(
                error
            );

            setStatus(
                error.message,
                true
            );
        }
    }


    async function loadModels() {
        const processId =
            Number(
                processSelect.value
            );


        if (!processId) {
            alert(
                "Select TIA Portal process first."
            );

            return;
        }


        const family =
            normalizeFamily(
                getPlcFamily()
            );


        if (!family) {
            alert(
                "Select PLC family first."
            );

            return;
        }


        setStatus(
            "Reading Hardware Catalog..."
        );


        clearModels();


        try {
            const models =
                await getJson(
                    `/api/v1/tia/plc-models` +
                    `?process_id=${processId}` +
                    `&family=${encodeURIComponent(family)}`
                );


            const defaultOption =
                document.createElement(
                    "option"
                );


            defaultOption.value =
                "";

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
                    buildModelLabel(
                        model
                    );


                modelSelect.appendChild(
                    option
                );
            }


            const otherOption =
                document.createElement(
                    "option"
                );


            otherOption.value =
                OTHER_VALUE;

            otherOption.textContent =
                "Wybierz inny...";


            modelSelect.appendChild(
                otherOption
            );


            modelSelect.disabled =
                false;


            if (
                models.length === 0
            ) {
                modelSelect.value =
                    OTHER_VALUE;

                updateManualVisibility();

                setStatus(
                    "No predefined models found. Enter catalog number manually.",
                    true
                );

                return;
            }


            setStatus(
                `${models.length} PLC model(s) loaded.`
            );

        } catch (error) {
            console.error(
                error
            );

            setStatus(
                error.message,
                true
            );
        }
    }


    async function createPlc() {
        const processId =
            Number(
                processSelect.value
            );


        if (!processId) {
            alert(
                "Select TIA Portal process."
            );

            return;
        }


        let selection =
            modelSelect.value;


        if (
            selection === OTHER_VALUE
        ) {
            selection =
                manualInput
                    .value
                    .trim();
        }


        if (!selection) {
            alert(
                "Select PLC model or enter catalog number."
            );

            return;
        }


        const plcName =
            plcNameInput
                .value
                .trim();


        if (!plcName) {
            alert(
                "PLC name is required."
            );

            return;
        }


        setStatus(
            "Creating PLC in TIA Portal..."
        );


        createButton.disabled =
            true;


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
                    }
                );


            setStatus(
                `Created ${result.software_name} ` +
                `in ${result.project_saved ?? "project"}.`
            );

        } catch (error) {
            console.error(
                error
            );

            setStatus(
                error.message,
                true
            );

        } finally {
            createButton.disabled =
                false;
        }
    }


    function clearModels() {
        modelSelect.innerHTML =
            `<option value="">Load models first</option>`;

        modelSelect.disabled =
            true;

        manualInput.value =
            "";

        manualContainer.classList.add(
            "hidden"
        );
    }


    function updateManualVisibility() {
        const manual =
            modelSelect.value
            === OTHER_VALUE;


        manualContainer.classList.toggle(
            "hidden",
            !manual
        );
    }


    function setStatus(
        message,
        isError = false
    ) {
        status.textContent =
            message;

        status.classList.toggle(
            "error",
            isError
        );
    }


    function buildModelLabel(
        model
    ) {
        let label =
            model.name;


        if (
            model.article_number
        ) {
            label +=
                ` — ${model.article_number}`;
        }


        if (
            model.version
        ) {
            label +=
                ` — ${model.version}`;
        }


        return label;
    }


    function normalizeFamily(
        family
    ) {
        switch (family) {
            case "S7-1200":
                return "s7-1200";


            case "S7-1200-G2":
                return "s7-1200-g2";


            case "S7-1500":
                return "s7-1500";


            default:
                return "";
        }
    }


    function familyChanged() {
        clearModels();

        setStatus(
            "PLC family changed. Load models again."
        );
    }


    return {
        refreshProcesses,
        familyChanged,
    };
}