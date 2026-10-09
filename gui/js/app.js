import {
    projectConfig,
    loadProjectConfig,
    saveProjectConfig,
} from "./state.js";

import {
    findIncompatibleDataTypes,
} from "./plc-types.js";

import {
    addUdt,
    renderUdts,
} from "./udt.js";

import {
    addDb,
    renderDbs,
} from "./db.js";

import {
    generatePreview,
} from "./preview.js";

import {
    initTiaUi,
} from "./tia.js";


const plcFamilySelect =
    document.getElementById(
        "plc-family"
    );


const newUdtNameInput =
    document.getElementById(
        "new-udt-name"
    );

const addUdtButton =
    document.getElementById(
        "add-udt-button"
    );

const udtContainer =
    document.getElementById(
        "udt-container"
    );


const newDbNameInput =
    document.getElementById(
        "new-db-name"
    );

const addDbButton =
    document.getElementById(
        "add-db-button"
    );

const dbContainer =
    document.getElementById(
        "db-container"
    );


const generatePreviewButton =
    document.getElementById(
        "generate-preview-button"
    );

const sourcePreview =
    document.getElementById(
        "source-preview"
    );


loadProjectConfig();


if (plcFamilySelect) {
    plcFamilySelect.value =
        projectConfig.plc_family;
}


/*
 * TIA UI is a core feature.
 *
 * It must start independently from
 * optional modules such as Devices.
 */
const tiaUi =
    initTiaUi(
        () =>
            projectConfig
                .plc_family
    );


let devicesUi = null;


function renderAll() {
    if (udtContainer) {
        renderUdts(
            udtContainer,
            renderAll
        );
    }


    if (dbContainer) {
        renderDbs(
            dbContainer,
            renderAll
        );
    }


    if (devicesUi) {
        try {
            devicesUi.refresh();
        } catch (error) {
            console.error(
                "Devices refresh failed:",
                error
            );
        }
    }
}


function changePlcFamily() {
    if (!plcFamilySelect) {
        return;
    }


    const previousFamily =
        projectConfig.plc_family;

    const newFamily =
        plcFamilySelect.value;


    if (!newFamily) {
        plcFamilySelect.value =
            previousFamily;

        return;
    }


    if (
        previousFamily
        &&
        previousFamily !== newFamily
    ) {
        const incompatible =
            findIncompatibleDataTypes(
                projectConfig,
                newFamily
            );


        if (
            incompatible.length > 0
        ) {
            alert(
                `Cannot change PLC to ${newFamily}.\n\n`
                +
                `Unsupported data types:\n`
                +
                incompatible.join("\n")
            );


            plcFamilySelect.value =
                previousFamily;

            return;
        }
    }


    projectConfig.plc_family =
        newFamily;


    saveProjectConfig();

    renderAll();

    tiaUi.familyChanged();
}


if (plcFamilySelect) {
    plcFamilySelect.addEventListener(
        "change",
        changePlcFamily
    );
}


if (
    addUdtButton
    &&
    newUdtNameInput
) {
    addUdtButton.addEventListener(
        "click",
        () =>
            addUdt(
                newUdtNameInput,
                renderAll
            )
    );


    newUdtNameInput.addEventListener(
        "keydown",
        (event) => {
            if (
                event.key === "Enter"
            ) {
                addUdt(
                    newUdtNameInput,
                    renderAll
                );
            }
        }
    );
}


if (
    addDbButton
    &&
    newDbNameInput
) {
    addDbButton.addEventListener(
        "click",
        () =>
            addDb(
                newDbNameInput,
                renderAll
            )
    );


    newDbNameInput.addEventListener(
        "keydown",
        (event) => {
            if (
                event.key === "Enter"
            ) {
                addDb(
                    newDbNameInput,
                    renderAll
                );
            }
        }
    );
}


if (
    generatePreviewButton
    &&
    sourcePreview
) {
    generatePreviewButton.addEventListener(
        "click",
        () =>
            generatePreview(
                sourcePreview
            )
    );
}


/*
 * Render the original engineering editors.
 */
renderAll();


/*
 * IMPORTANT:
 *
 * Start TIA process discovery BEFORE loading
 * the Devices module.
 *
 * devices.js is intentionally NOT imported
 * at the top of this file.
 */
tiaUi
    .refreshProcesses()
    .catch(
        (error) => {
            console.error(
                "TIA process refresh failed:",
                error
            );
        }
    );


/*
 * Devices is an optional module.
 *
 * Dynamic import means a syntax/runtime/import
 * error inside devices.js cannot stop the TIA UI.
 */
import("./devices.js")
    .then(
        (module) => {
            devicesUi =
                module.initDevicesUi();

            devicesUi.refresh();
        }
    )
    .catch(
        (error) => {
            console.error(
                "Devices module failed to load:",
                error
            );

            const deviceStatus =
                document.getElementById(
                    "device-config-status"
                );

            if (deviceStatus) {
                deviceStatus.textContent =
                    `Devices error: ${error.message}`;

                deviceStatus.classList.add(
                    "error"
                );
            }
        }
    );