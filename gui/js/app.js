import {
    projectConfig,
    loadProjectConfig,
    saveProjectConfig,
    listProjectProfiles,
    getActiveProjectProfileId,
} from "./state.js";

import {
    findIncompatibleDataTypes,
} from "./plc-types.js";

import {
    addUdt,
    renderUdts,
    setUdtCategoryOptions,
} from "./udt.js";

import { initUdtTiaImportUi } from "./udt_import.js";
import { initDbTiaImportUi } from "./db_import.js";
import { initFbTiaImportUi } from "./fb_import.js";
import { initFcTiaImportUi } from "./fc_import.js";
import {initInstanceDbTiaUi, renderInstanceDbSnapshots} from "./instance_db.js";

import {
    addDb,
    renderDbs,
    setDbCategoryOptions,
} from "./db.js";
import {renderFunctionBlocks} from "./fb.js";
import {renderFunctions} from "./fc.js";
import {initProgramDependencies} from "./program_dependencies.js";
import {initEngineeringDisclosures} from "./engineering_disclosures.js";
import {initLocalProgramCreationUi} from "./program_creation.js";
import {initCodeReviewUi} from "./code_review.js";

import {
    listCategories,
} from "./library_store.js";

import {
    generatePreview,
} from "./preview.js";

import { initSourceImportUi } from "./source_import.js";

import {
    initTiaUi,
} from "./tia.js";

import {
    initDataLibrariesUi,
} from "./data_libraries.js";

initCodeReviewUi();


const plcFamilySelect =
    document.getElementById(
        "plc-family"
    );


const newUdtNameInput =
    document.getElementById(
        "new-udt-name"
    );

const newUdtCategoryInput =
    document.getElementById(
        "new-udt-category"
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

const newDbCategoryInput =
    document.getElementById(
        "new-db-category"
    );

const addDbButton =
    document.getElementById(
        "add-db-button"
    );

const dbContainer =
    document.getElementById(
        "db-container"
    );

const fbContainer = document.getElementById("fb-container");
const fcContainer = document.getElementById("fc-container");
const instanceDbContainer = document.getElementById("instance-db-container");


const generatePreviewButton =
    document.getElementById(
        "generate-preview-button"
    );

const sourcePreview =
    document.getElementById(
        "source-preview"
    );


loadProjectConfig();
initEngineeringDisclosures();
const sourceImportUi = initSourceImportUi();


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

function refreshProfileSummary() {
    const active = listProjectProfiles().find(p => p.id === getActiveProjectProfileId());
    const name = active?.name || "Default project";
    const overview = document.getElementById("overview-profile-name");
    const header = document.getElementById("header-profile-summary");
    if (overview) overview.textContent = name;
    if (header) header.textContent = "Profile: " + name;
}

window.addEventListener("project-profile-changed", refreshProfileSummary);

function renderAll() {
    refreshProfileSummary();
    sourceImportUi?.refreshSelection();
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
    if (fbContainer) renderFunctionBlocks(fbContainer, renderAll);
    if (fcContainer) renderFunctions(fcContainer, renderAll);
    if (instanceDbContainer) renderInstanceDbSnapshots(instanceDbContainer);


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


function applyLibraryCategoryOptions(categories) {
    const selectedUdt = newUdtCategoryInput?.value || "General";
    const selectedDb = newDbCategoryInput?.value || "General";
    const names = [...new Set(categories.filter(value => typeof value === "string" && value.trim()))]
        .sort((left, right) => left.localeCompare(right));
    if (!names.includes("General")) names.push("General");
    setUdtCategoryOptions(names);
    setDbCategoryOptions(names);
    for (const select of [newUdtCategoryInput, newDbCategoryInput]) {
        if (!select) continue;
        select.replaceChildren();
        for (const name of names) {
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        }
        select.value = names.includes(select === newUdtCategoryInput ? selectedUdt : selectedDb)
            ? (select === newUdtCategoryInput ? selectedUdt : selectedDb)
            : "General";
    }
    renderAll();
}


async function refreshLibraryCategoryOptions() {
    try {
        applyLibraryCategoryOptions((await listCategories()).map(category => category.name));
    } catch (error) {
        console.error("Cannot load library categories:", error);
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
                newUdtCategoryInput,
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
                    newUdtCategoryInput,
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
                newDbCategoryInput,
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
                    newDbCategoryInput,
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
            sourceImportUi
                ? sourceImportUi.generateSelectionPreview()
                : generatePreview(sourcePreview)
    );
}


/*
 * Render the original engineering editors.
 */
renderAll();
window.addEventListener("library-categories-changed", event => {
    applyLibraryCategoryOptions(event.detail || []);
});
initUdtTiaImportUi(renderAll);
initDbTiaImportUi(renderAll);
initFbTiaImportUi(renderAll);
initFcTiaImportUi(renderAll);
initInstanceDbTiaUi(renderAll);
initProgramDependencies();
initLocalProgramCreationUi(renderAll);
const dataLibrariesUi = initDataLibrariesUi(() => {
    if (plcFamilySelect) plcFamilySelect.value = projectConfig.plc_family;
    sourceImportUi?.refreshSelection();
    renderAll();
    tiaUi.updateTargetSummary();
});
if (dataLibrariesUi?.ready) {
    dataLibrariesUi.ready.then(refreshLibraryCategoryOptions);
} else {
    refreshLibraryCategoryOptions();
}


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
