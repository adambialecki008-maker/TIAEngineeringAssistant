import {
    projectConfig,
    saveProjectConfig,
} from "./state.js";

import {
    createButton,
    createTextCell,
    getOpenNames,
} from "./ui.js";

import {
    createMemberEditor,
    formatMemberType,
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


function renameMember(
    dbIndex,
    memberIndex,
    refresh
) {
    const db =
        projectConfig.dbs[
            dbIndex
        ];

    const member =
        db.members[
            memberIndex
        ];


    const result =
        prompt(
            "New member name:",
            member.name
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
        db.members.some(
            (
                other,
                index
            ) =>
                index !== memberIndex
                &&
                other.name
                    .toLowerCase()
                ===
                newName.toLowerCase()
        );


    if (duplicate) {
        alert(
            "Member name must be unique."
        );

        return;
    }


    member.name =
        newName;


    saveProjectConfig();
    refresh();
}


function deleteMember(
    dbIndex,
    memberIndex,
    refresh
) {
    const db =
        projectConfig.dbs[
            dbIndex
        ];

    const member =
        db.members[
            memberIndex
        ];


    if (
        !confirm(
            `Delete member "${member.name}"?`
        )
    ) {
        return;
    }


    db.members.splice(
        memberIndex,
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


            const table =
                document.createElement(
                    "table"
                );


            table.innerHTML = `
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Data type</th>
                        <th>Comment</th>
                        <th>Actions</th>
                    </tr>
                </thead>
            `;


            const tbody =
                document.createElement(
                    "tbody"
                );


            db.members.forEach(
                (
                    member,
                    memberIndex
                ) => {

                    const row =
                        document.createElement(
                            "tr"
                        );


                    row.appendChild(
                        createTextCell(
                            member.name
                        )
                    );


                    row.appendChild(
                        createTextCell(
                            formatMemberType(
                                member
                            )
                        )
                    );


                    row.appendChild(
                        createTextCell(
                            member.comment
                        )
                    );


                    const actionCell =
                        document.createElement(
                            "td"
                        );


                    actionCell.appendChild(
                        createButton(
                            "Rename",
                            () =>
                                renameMember(
                                    dbIndex,
                                    memberIndex,
                                    refresh
                                )
                        )
                    );


                    actionCell.appendChild(
                        createButton(
                            "Delete",
                            () =>
                                deleteMember(
                                    dbIndex,
                                    memberIndex,
                                    refresh
                                )
                        )
                    );


                    row.appendChild(
                        actionCell
                    );


                    tbody.appendChild(
                        row
                    );
                }
            );


            table.appendChild(
                tbody
            );

            content.appendChild(
                table
            );


            const editor =
                createMemberEditor({
                    prefix:
                        `db-member-${dbIndex}`,

                    existingMembers:
                        db.members,

                    onAdd:
                        (member) => {
                            db.members.push(
                                member
                            );

                            saveProjectConfig();
                            refresh();
                        },
                });


            content.appendChild(
                editor
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