import {
    projectConfig,
    saveProjectConfig,
} from "./state.js";

import {
    createButton,
    createTextCell,
    createInput,
    createDataTypeSelect,
    getOpenNames,
} from "./ui.js";

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
        alert("UDT name is required.");
        return;
    }


    const duplicate =
        projectConfig.udts.some(
            (udt) =>
                udt.name.toLowerCase() ===
                name.toLowerCase()
        );


    if (duplicate) {
        alert(
            "UDT name must be unique."
        );

        return;
    }


    projectConfig.udts.push({
        name,
        fields: [],
    });


    saveProjectConfig();

    nameInput.value = "";

    refresh();
}


function renameUdt(
    udtIndex,
    refresh
) {
    const udt =
        projectConfig.udts[udtIndex];

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
        alert(
            "UDT name is required."
        );

        return;
    }


    const duplicate =
        projectConfig.udts.some(
            (otherUdt, index) =>
                index !== udtIndex &&
                otherUdt.name.toLowerCase() ===
                    newName.toLowerCase()
        );


    if (duplicate) {
        alert(
            "UDT name must be unique."
        );

        return;
    }


    udt.name = newName;


    /*
        Update UDT references
        inside other UDTs.
    */
    for (
        const otherUdt
        of projectConfig.udts
    ) {
        for (
            const field
            of otherUdt.fields
        ) {
            if (
                field.data_type.toLowerCase() ===
                oldName.toLowerCase()
            ) {
                field.data_type =
                    newName;
            }
        }
    }


    /*
        Update DB references.
    */
    for (
        const db
        of projectConfig.dbs
    ) {
        for (
            const member
            of db.members
        ) {
            if (
                member.data_type.toLowerCase() ===
                oldName.toLowerCase()
            ) {
                member.data_type =
                    newName;
            }
        }
    }


    saveProjectConfig();
    refresh();
}


function deleteUdt(
    udtIndex,
    refresh
) {
    const udt =
        projectConfig.udts[udtIndex];


    const references = [];


    for (
        const otherUdt
        of projectConfig.udts
    ) {

        if (otherUdt === udt) {
            continue;
        }


        const used =
            otherUdt.fields.some(
                (field) =>
                    field.data_type.toLowerCase() ===
                    udt.name.toLowerCase()
            );


        if (used) {
            references.push(
                `UDT ${otherUdt.name}`
            );
        }
    }


    for (
        const db
        of projectConfig.dbs
    ) {

        const used =
            db.members.some(
                (member) =>
                    member.data_type.toLowerCase() ===
                    udt.name.toLowerCase()
            );


        if (used) {
            references.push(
                `DB ${db.name}`
            );
        }
    }


    if (references.length > 0) {

        alert(
            `Cannot delete ${udt.name}.\n` +
            `Used by:\n${references.join("\n")}`
        );

        return;
    }


    const confirmed =
        confirm(
            `Delete UDT "${udt.name}"?`
        );


    if (!confirmed) {
        return;
    }


    projectConfig.udts.splice(
        udtIndex,
        1
    );


    saveProjectConfig();
    refresh();
}


function addField(
    udtIndex,
    refresh
) {
    const udt =
        projectConfig.udts[udtIndex];


    const name =
        document
            .getElementById(
                `udt-field-name-${udtIndex}`
            )
            .value
            .trim();


    const dataType =
        document
            .getElementById(
                `udt-field-type-${udtIndex}`
            )
            .value;


    const comment =
        document
            .getElementById(
                `udt-field-comment-${udtIndex}`
            )
            .value
            .trim();


    if (!name || !dataType) {

        alert(
            "Field name and data type are required."
        );

        return;
    }


    const duplicate =
        udt.fields.some(
            (field) =>
                field.name.toLowerCase() ===
                name.toLowerCase()
        );


    if (duplicate) {

        alert(
            `Field "${name}" already exists inside ${udt.name}.`
        );

        return;
    }


    udt.fields.push({
        name,
        data_type: dataType,
        comment: comment || null,
    });


    saveProjectConfig();
    refresh();
}


function renameField(
    udtIndex,
    fieldIndex,
    refresh
) {
    const udt =
        projectConfig.udts[udtIndex];

    const field =
        udt.fields[fieldIndex];


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
            (otherField, index) =>
                index !== fieldIndex &&
                otherField.name.toLowerCase() ===
                    newName.toLowerCase()
        );


    if (duplicate) {

        alert(
            "Field name must be unique inside the UDT."
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
        projectConfig.udts[udtIndex];

    const field =
        udt.fields[fieldIndex];


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
        projectConfig.udts[udtIndex];


    if (udt.fields.length === 0) {

        alert(
            "UDT must contain at least one field."
        );

        return;
    }


    try {

        await postJson(
            "/api/v1/udt-specifications",
            udt
        );

        alert(
            `${udt.name} validated successfully.`
        );

    } catch (error) {

        console.error(error);

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
        getOpenNames(container);


    container.innerHTML = "";


    projectConfig.udts.forEach(
        (udt, udtIndex) => {

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
                `${udt.name} (${udt.fields.length} fields)`;


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
                (field, fieldIndex) => {

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
                            field.data_type
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

                    actionCell.className =
                        "actions-cell";


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
                document.createElement(
                    "div"
                );

            editor.className =
                "editor-row";


            editor.appendChild(
                createInput(
                    `udt-field-name-${udtIndex}`,
                    "Field name"
                )
            );


            editor.appendChild(
                createDataTypeSelect(
                    `udt-field-type-${udtIndex}`,
                    udt.name
                )
            );


            editor.appendChild(
                createInput(
                    `udt-field-comment-${udtIndex}`,
                    "Comment"
                )
            );


            editor.appendChild(
                createButton(
                    "Add field",
                    () =>
                        addField(
                            udtIndex,
                            refresh
                        )
                )
            );


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