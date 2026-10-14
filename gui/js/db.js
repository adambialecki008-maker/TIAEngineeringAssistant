import {
    projectConfig,
    saveProjectConfig,
} from "./state.js";

import {
    createButton,
    getOpenNames,
} from "./ui.js";

import {
    createMemberTree,
    getExpandedMemberPaths,
} from "./member-editor.js";

import {
    postJson,
} from "./api.js";


function requirePlc() {
    if (!projectConfig.plc_family) {
        alert(
            "Select PLC family first."
        );

        return false;
    }

    return true;
}


export function addDb(
    nameInput,
    refresh
) {
    if (!requirePlc()) {
        return;
    }


    const name =
        nameInput.value.trim();


    if (!name) {
        alert(
            "DB name is required."
        );

        return;
    }


    const duplicate =
        projectConfig.dbs.some(
            (db) =>
                db.name.toLowerCase()
                ===
                name.toLowerCase()
        );


    if (duplicate) {
        alert(
            "DB name must be unique."
        );

        return;
    }


    projectConfig.dbs.push({
        name: name,
        retain: false,
        members: [],
    });


    saveProjectConfig();

    nameInput.value =
        "";

    refresh();
}


function renameDb(
    dbIndex,
    refresh
) {
    const db =
        projectConfig.dbs[
            dbIndex
        ];


    const result =
        prompt(
            "New DB name:",
            db.name
        );


    if (result === null) {
        return;
    }


    const newName =
        result.trim();


    if (!newName) {
        return;
    }


    const duplicate =
        projectConfig.dbs.some(
            (
                other,
                index
            ) =>
                index !== dbIndex
                &&
                other.name
                    .toLowerCase()
                ===
                newName.toLowerCase()
        );


    if (duplicate) {
        alert(
            "DB name must be unique."
        );

        return;
    }


    db.name =
        newName;


    saveProjectConfig();
    refresh();
}


function deleteDb(
    dbIndex,
    refresh
) {
    const db =
        projectConfig.dbs[
            dbIndex
        ];


    if (
        !confirm(
            `Delete DB "${db.name}"?`
        )
    ) {
        return;
    }


    projectConfig.dbs.splice(
        dbIndex,
        1
    );


    saveProjectConfig();
    refresh();
}


async function validateDb(
    dbIndex
) {
    const db =
        projectConfig.dbs[
            dbIndex
        ];


    try {
        await postJson(
            "/api/v1/db-specifications",
            db
        );


        alert(
            `${db.name} validated successfully.`
        );

    } catch (error) {
        console.error(
            error
        );

        alert(
            "DB validation failed."
        );
    }
}


export function renderDbs(
    container,
    refresh
) {
    const openNames =
        getOpenNames(
            container
        );

    const expandedPaths =
        getExpandedMemberPaths(container);


    container.innerHTML =
        "";


    projectConfig.dbs.forEach(
        (
            db,
            dbIndex
        ) => {

            const details =
                document.createElement(
                    "details"
                );


            details.dataset.name =
                db.name;

            details.open =
                openNames.has(
                    db.name
                );


            const summary =
                document.createElement(
                    "summary"
                );


            summary.textContent =
                `${db.name} ` +
                `(${db.members.length} members)`;


            details.appendChild(
                summary
            );


            const content =
                document.createElement(
                    "div"
                );

            content.className =
                "details-content";


            const actions =
                document.createElement(
                    "div"
                );

            actions.className =
                "action-row";


            actions.appendChild(
                createButton(
                    "Rename DB",
                    () =>
                        renameDb(
                            dbIndex,
                            refresh
                        )
                )
            );


            actions.appendChild(
                createButton(
                    "Delete DB",
                    () =>
                        deleteDb(
                            dbIndex,
                            refresh
                        )
                )
            );


            content.appendChild(
                actions
            );

            const retainLabel = document.createElement("label");
            retainLabel.className = "member-db-retain";
            const retainInput = document.createElement("input");
            retainInput.type = "checkbox";
            retainInput.checked = db.retain === true;
            retainInput.addEventListener("change", () => {
                db.retain = retainInput.checked;
                saveProjectConfig();
            });
            retainLabel.append(
                retainInput,
                document.createTextNode(" RETAIN entire DB (otherwise NON_RETAIN)")
            );
            content.appendChild(retainLabel);

            const retainNote = document.createElement("p");
            retainNote.className = "hint";
            retainNote.textContent = "Currently RETAIN applies to the whole DB, "
                + "not individual array elements. Verify CPU retentive memory "
                + "and inspect the resulting DB in TIA after import.";
            content.appendChild(retainNote);

            content.appendChild(
                createMemberTree({
                    prefix: "db-member-" + dbIndex,
                    members: db.members,
                    ownerUdtName: null,
                    openPaths: expandedPaths,
                    onChange: (next) => {
                        db.members = next;
                        saveProjectConfig();
                        refresh();
                        return true;
                    },
                })
            );


            const bottomActions =
                document.createElement(
                    "div"
                );

            bottomActions.className =
                "action-row";


            bottomActions.appendChild(
                createButton(
                    "Validate DB",
                    () =>
                        validateDb(
                            dbIndex
                        )
                )
            );


            content.appendChild(
                bottomActions
            );


            details.appendChild(
                content
            );


            container.appendChild(
                details
            );
        }
    );
}