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


export function addUdt(
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
            "UDT name is required."
        );

        return;
    }


    const duplicate =
        projectConfig.udts.some(
            (udt) =>
                udt.name.toLowerCase()
                ===
                name.toLowerCase()
        );


    if (duplicate) {
        alert(
            "UDT name must be unique."
        );

        return;
    }


    projectConfig.udts.push({
        name: name,
        fields: [],
    });


    saveProjectConfig();

    nameInput.value =
        "";

    refresh();
}


function renameUdt(
    udtIndex,
    refresh
) {
    const udt =
        projectConfig.udts[
            udtIndex
        ];


    const oldName =
        udt.name;


    const result =
        prompt(
            "New UDT name:",
            oldName
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
        projectConfig.udts.some(
            (
                otherUdt,
                index
            ) =>
                index !== udtIndex
                &&
                otherUdt.name
                    .toLowerCase()
                ===
                newName.toLowerCase()
        );


    if (duplicate) {
        alert(
            "UDT name must be unique."
        );

        return;
    }


    udt.name =
        newName;


    updateUdtReferences(
        oldName,
        newName
    );


    saveProjectConfig();
    refresh();
}


function updateUdtReferences(
    oldName,
    newName
) {
    function updateMember(
        member
    ) {
        if (
            member.data_type
                .toLowerCase()
            ===
            oldName.toLowerCase()
        ) {
            member.data_type =
                newName;
        }


        if (
            member.array_element_type
            &&
            member.array_element_type
                .toLowerCase()
            ===
            oldName.toLowerCase()
        ) {
            member.array_element_type =
                newName;
        }


        for (
            const child
            of member.struct_members ?? []
        ) {
            updateMember(
                child
            );
        }
    }


    for (
        const currentUdt
        of projectConfig.udts
    ) {
        for (
            const field
            of currentUdt.fields
        ) {
            updateMember(
                field
            );
        }
    }


    for (
        const db
        of projectConfig.dbs
    ) {
        for (
            const member
            of db.members
        ) {
            updateMember(
                member
            );
        }
    }
}


function deleteUdt(
    udtIndex,
    refresh
) {
    const udt =
        projectConfig.udts[
            udtIndex
        ];


    if (
        isUdtReferenced(
            udt.name
        )
    ) {
        alert(
            `Cannot delete ${udt.name}. ` +
            `It is referenced by another type.`
        );

        return;
    }


    if (
        !confirm(
            `Delete UDT "${udt.name}"?`
        )
    ) {
        return;
    }


    projectConfig.udts.splice(
        udtIndex,
        1
    );


    saveProjectConfig();
    refresh();
}


function isUdtReferenced(
    udtName
) {
    function memberUsesUdt(
        member
    ) {
        if (
            member.data_type
                .toLowerCase()
            ===
            udtName.toLowerCase()
        ) {
            return true;
        }


        if (
            member.array_element_type
            &&
            member.array_element_type
                .toLowerCase()
            ===
            udtName.toLowerCase()
        ) {
            return true;
        }


        return (
            member.struct_members
            ?? []
        ).some(
            memberUsesUdt
        );
    }


    for (
        const udt
        of projectConfig.udts
    ) {
        for (
            const field
            of udt.fields
        ) {
            if (
                memberUsesUdt(
                    field
                )
            ) {
                return true;
            }
        }
    }


    for (
        const db
        of projectConfig.dbs
    ) {
        for (
            const member
            of db.members
        ) {
            if (
                memberUsesUdt(
                    member
                )
            ) {
                return true;
            }
        }
    }


    return false;
}


function renameField(
    udtIndex,
    fieldIndex,
    refresh
) {
    const udt =
        projectConfig.udts[
            udtIndex
        ];

    const field =
        udt.fields[
            fieldIndex
        ];


    const result =
        prompt(
            "New field name:",
            field.name
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
        udt.fields.some(
            (
                other,
                index
            ) =>
                index !== fieldIndex
                &&
                other.name
                    .toLowerCase()
                ===
                newName.toLowerCase()
        );


    if (duplicate) {
        alert(
            "Field name must be unique."
        );

        return;
    }


    field.name =
        newName;


    saveProjectConfig();
    refresh();
}


function deleteField(
    udtIndex,
    fieldIndex,
    refresh
) {
    const udt =
        projectConfig.udts[
            udtIndex
        ];

    const field =
        udt.fields[
            fieldIndex
        ];


    if (
        !confirm(
            `Delete field "${field.name}"?`
        )
    ) {
        return;
    }


    udt.fields.splice(
        fieldIndex,
        1
    );


    saveProjectConfig();
    refresh();
}


async function validateUdt(
    udtIndex
) {
    const udt =
        projectConfig.udts[
            udtIndex
        ];


    try {
        await postJson(
            "/api/v1/udt-specifications",
            udt
        );


        alert(
            `${udt.name} validated successfully.`
        );

    } catch (error) {
        console.error(
            error
        );

        alert(
            "UDT validation failed."
        );
    }
}


export function renderUdts(
    container,
    refresh
) {
    const openNames =
        getOpenNames(
            container
        );


    container.innerHTML =
        "";


    projectConfig.udts.forEach(
        (
            udt,
            udtIndex
        ) => {

            const details =
                document.createElement(
                    "details"
                );


            details.dataset.name =
                udt.name;

            details.open =
                openNames.has(
                    udt.name
                );


            const summary =
                document.createElement(
                    "summary"
                );


            summary.textContent =
                `${udt.name} ` +
                `(${udt.fields.length} fields)`;


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
                    "Rename UDT",
                    () =>
                        renameUdt(
                            udtIndex,
                            refresh
                        )
                )
            );


            actions.appendChild(
                createButton(
                    "Delete UDT",
                    () =>
                        deleteUdt(
                            udtIndex,
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


            udt.fields.forEach(
                (
                    field,
                    fieldIndex
                ) => {

                    const row =
                        document.createElement(
                            "tr"
                        );


                    row.appendChild(
                        createTextCell(
                            field.name
                        )
                    );


                    row.appendChild(
                        createTextCell(
                            formatMemberType(
                                field
                            )
                        )
                    );


                    row.appendChild(
                        createTextCell(
                            field.comment
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
                                renameField(
                                    udtIndex,
                                    fieldIndex,
                                    refresh
                                )
                        )
                    );


                    actionCell.appendChild(
                        createButton(
                            "Delete",
                            () =>
                                deleteField(
                                    udtIndex,
                                    fieldIndex,
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
                        `udt-field-${udtIndex}`,

                    existingMembers:
                        udt.fields,

                    excludeUdtName:
                        udt.name,

                    onAdd:
                        (field) => {
                            udt.fields.push(
                                field
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
                    "Validate UDT",
                    () =>
                        validateUdt(
                            udtIndex
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