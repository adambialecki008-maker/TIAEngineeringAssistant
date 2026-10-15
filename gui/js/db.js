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

let categoryOptions = ["General"];

export function setDbCategoryOptions(categories) {
    categoryOptions = [...new Set(categories.filter(value => typeof value === "string" && value.trim()))]
        .sort((left, right) => left.localeCompare(right));
    if (!categoryOptions.includes("General")) categoryOptions.push("General");
}

function createCategorySelect(db, refresh) {
    const label = document.createElement("label");
    label.textContent = "Category: ";
    const select = document.createElement("select");
    const current = db.category || "General";
    const options = categoryOptions.includes(current) ? categoryOptions : [...categoryOptions, current];
    for (const value of options) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    }
    select.value = current;
    select.addEventListener("change", () => {
        db.category = select.value;
        saveProjectConfig();
        refresh();
    });
    label.appendChild(select);
    return label;
}


export function addDb(
    nameInput,
    categoryInput,
    refresh
) {
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
        category: categoryInput?.value || "General",
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
                `(${db.members.length} members, ${db.category || "General"})`;


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
                createCategorySelect(
                    db,
                    refresh
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
                refresh();
            });
            retainLabel.append(
                retainInput,
                document.createTextNode(" Default Retain for new/inherited Static declarations")
            );
            content.appendChild(retainLabel);

            const retainNote = document.createElement("p");
            retainNote.className = "hint";
            retainNote.textContent = "Set Retain for each Static variable in the table. "
                + "Blank/inherited uses the DB default above; a STRUCT or UDT "
                + "retains its whole value. Individual array elements cannot override Retain.";
            content.appendChild(retainNote);

            // Global DBs contain Static declarations, not FB Input/Output/InOut.
            const staticSection = document.createElement("details");
            staticSection.className = "member-declaration-section";
            staticSection.open = true;
            const staticSummary = document.createElement("summary");
            staticSummary.textContent = "Static (" + db.members.length + " variables)";
            staticSection.appendChild(staticSummary);
            staticSection.appendChild(createMemberTree({
                prefix: "db-member-" + dbIndex,
                members: db.members,
                ownerUdtName: null,
                openPaths: expandedPaths,
                isDb: true,
                retainDefault: db.retain === true,
                onChange: (next) => {
                    db.members = next;
                    saveProjectConfig();
                    refresh();
                    return true;
                },
            }));
            content.appendChild(staticSection);


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
