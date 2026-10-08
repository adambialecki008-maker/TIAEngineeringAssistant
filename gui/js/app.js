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


function renderAll() {
    renderUdts(
        udtContainer,
        renderAll
    );

    renderDbs(
        dbContainer,
        renderAll
    );
}


function changePlcFamily() {
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
        previousFamily &&
        previousFamily !== newFamily
    ) {

        const incompatible =
            findIncompatibleDataTypes(
                projectConfig,
                newFamily
            );


        if (incompatible.length > 0) {

            alert(
                `Cannot change PLC to ${newFamily}.\n\n` +
                `Unsupported data types:\n` +
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
}


plcFamilySelect.addEventListener(
    "change",
    changePlcFamily
);


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

        if (event.key === "Enter") {

            addUdt(
                newUdtNameInput,
                renderAll
            );
        }
    }
);


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

        if (event.key === "Enter") {

            addDb(
                newDbNameInput,
                renderAll
            );
        }
    }
);


loadProjectConfig();

plcFamilySelect.value =
    projectConfig.plc_family;

renderAll();