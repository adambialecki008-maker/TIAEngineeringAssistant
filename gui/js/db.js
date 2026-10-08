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


const ARRAY_MIN_BOUND = -32768;
const ARRAY_MAX_BOUND = 32767;


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
        alert("DB name is required.");
        return;
    }


    const duplicate =
        projectConfig.dbs.some(
            (db) =>
                db.name.toLowerCase() ===
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

    nameInput.value = "";

    refresh();
}


function renameDb(
    dbIndex,
    refresh
) {
    const db =
        projectConfig.dbs[dbIndex];


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
        alert(
            "DB name is required."
        );

        return;
    }


    const duplicate =
        projectConfig.dbs.some(
            (otherDb, index) =>
                index !== dbIndex &&
                otherDb.name.toLowerCase() ===
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
        projectConfig.dbs[dbIndex];


    const confirmed =
        confirm(
            `Delete DB "${db.name}" and all members?`
        );


    if (!confirmed) {
        return;
    }


    projectConfig.dbs.splice(
        dbIndex,
        1
    );


    saveProjectConfig();
    refresh();
}


function addMember(
    dbIndex,
    refresh
) {
    const db =
        projectConfig.dbs[dbIndex];


    const nameInput =
        document.getElementById(
            `db-member-name-${dbIndex}`
        );

    const typeSelect =
        document.getElementById(
            `db-member-type-${dbIndex}`
        );

    const commentInput =
        document.getElementById(
            `db-member-comment-${dbIndex}`
        );


    const name =
        nameInput.value.trim();

    const dataType =
        typeSelect.value;

    const comment =
        commentInput.value.trim();


    if (!name) {
        alert(
            "Member name is required."
        );

        return;
    }


    if (!dataType) {
        alert(
            "Data type is required."
        );

        return;
    }


    const duplicate =
        db.members.some(
            (member) =>
                member.name.toLowerCase() ===
                name.toLowerCase()
        );


    if (duplicate) {
        alert(
            `Member "${name}" already exists inside ${db.name}.`
        );

        return;
    }


    if (dataType === "Array") {
        addArrayMember(
            db,
            dbIndex,
            name,
            comment,
            refresh
        );

        return;
    }


    db.members.push({
        name: name,
        data_type: dataType,
        comment: comment || null,

        array_element_type: null,
        array_lower_bound: null,
        array_upper_bound: null,
    });


    saveProjectConfig();
    refresh();
}


function addArrayMember(
    db,
    dbIndex,
    name,
    comment,
    refresh
) {
    const elementTypeSelect =
        document.getElementById(
            `db-array-element-type-${dbIndex}`
        );

    const lowerBoundInput =
        document.getElementById(
            `db-array-lower-${dbIndex}`
        );

    const upperBoundInput =
        document.getElementById(
            `db-array-upper-${dbIndex}`
        );


    const elementType =
        elementTypeSelect.value;

    const lowerBound =
        Number(
            lowerBoundInput.value
        );

    const upperBound =
        Number(
            upperBoundInput.value
        );


    if (!elementType) {
        alert(
            "Array element type is required."
        );

        return;
    }


    if (
        !Number.isInteger(lowerBound) ||
        !Number.isInteger(upperBound)
    ) {
        alert(
            "Array bounds must be integers."
        );

        return;
    }


    if (
        lowerBound < ARRAY_MIN_BOUND ||
        lowerBound > ARRAY_MAX_BOUND
    ) {
        alert(
            `Lower bound must be between ` +
            `${ARRAY_MIN_BOUND} and ${ARRAY_MAX_BOUND}.`
        );

        return;
    }


    if (
        upperBound < ARRAY_MIN_BOUND ||
        upperBound > ARRAY_MAX_BOUND
    ) {
        alert(
            `Upper bound must be between ` +
            `${ARRAY_MIN_BOUND} and ${ARRAY_MAX_BOUND}.`
        );

        return;
    }


    if (
        upperBound < lowerBound
    ) {
        alert(
            "Array upper bound must be greater than or equal to lower bound."
        );

        return;
    }


    db.members.push({
        name: name,

        data_type: "Array",

        array_element_type:
            elementType,

        array_lower_bound:
            lowerBound,

        array_upper_bound:
            upperBound,

        comment:
            comment || null,
    });


    saveProjectConfig();
    refresh();
}


function renameMember(
    dbIndex,
    memberIndex,
    refresh
) {
    const db =
        projectConfig.dbs[dbIndex];

    const member =
        db.members[memberIndex];


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
        alert(
            "Member name is required."
        );

        return;
    }


    const duplicate =
        db.members.some(
            (otherMember, index) =>
                index !== memberIndex &&
                otherMember.name.toLowerCase() ===
                    newName.toLowerCase()
        );


    if (duplicate) {
        alert(
            "Member name must be unique inside the DB."
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
        projectConfig.dbs[dbIndex];

    const member =
        db.members[memberIndex];


    const confirmed =
        confirm(
            `Delete member "${member.name}"?`
        );


    if (!confirmed) {
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
        projectConfig.dbs[dbIndex];


    if (db.members.length === 0) {
        alert(
            "DB must contain at least one member."
        );

        return;
    }


    try {
        await postJson(
            "/api/v1/db-specifications",
            db
        );

        alert(
            `${db.name} validated successfully.`
        );

    } catch (error) {
        console.error(error);

        alert(
            "DB validation failed."
        );
    }
}


function getMemberTypeDisplay(
    member
) {
    if (
        member.data_type !== "Array"
    ) {
        return member.data_type;
    }


    return (
        `Array[` +
        `${member.array_lower_bound}..` +
        `${member.array_upper_bound}] ` +
        `of ${member.array_element_type}`
    );
}


function createArrayEditor(
    dbIndex
) {
    const container =
        document.createElement(
            "div"
        );

    container.id =
        `db-array-options-${dbIndex}`;

    container.className =
        "editor-row";

    container.style.display =
        "none";


    const typeLabel =
        document.createElement(
            "label"
        );

    typeLabel.textContent =
        "Element type:";


    const typeSelect =
        createDataTypeSelect(
            `db-array-element-type-${dbIndex}`
        );


    const lowerLabel =
        document.createElement(
            "label"
        );

    lowerLabel.textContent =
        "Lower bound:";


    const lowerInput =
        createInput(
            `db-array-lower-${dbIndex}`,
            "0",
            "number"
        );

    lowerInput.value = "0";

    lowerInput.min =
        String(ARRAY_MIN_BOUND);

    lowerInput.max =
        String(ARRAY_MAX_BOUND);


    const upperLabel =
        document.createElement(
            "label"
        );

    upperLabel.textContent =
        "Upper bound:";


    const upperInput =
        createInput(
            `db-array-upper-${dbIndex}`,
            "9",
            "number"
        );

    upperInput.value = "9";

    upperInput.min =
        String(ARRAY_MIN_BOUND);

    upperInput.max =
        String(ARRAY_MAX_BOUND);


    container.appendChild(
        typeLabel
    );

    container.appendChild(
        typeSelect
    );

    container.appendChild(
        lowerLabel
    );

    container.appendChild(
        lowerInput
    );

    container.appendChild(
        upperLabel
    );

    container.appendChild(
        upperInput
    );


    return container;
}


function updateArrayEditorVisibility(
    dbIndex
) {
    const typeSelect =
        document.getElementById(
            `db-member-type-${dbIndex}`
        );

    const arrayEditor =
        document.getElementById(
            `db-array-options-${dbIndex}`
        );


    if (
        !typeSelect ||
        !arrayEditor
    ) {
        return;
    }


    if (
        typeSelect.value === "Array"
    ) {
        arrayEditor.style.display =
            "flex";
    } else {
        arrayEditor.style.display =
            "none";
    }
}


export function renderDbs(
    container,
    refresh
) {
    const openNames =
        getOpenNames(container);


    container.innerHTML = "";


    projectConfig.dbs.forEach(
        (db, dbIndex) => {

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
                `${db.name} (${db.members.length} members)`;


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
                            getMemberTypeDisplay(
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

                    actionCell.className =
                        "actions-cell";


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
                document.createElement(
                    "div"
                );

            editor.className =
                "editor-row";


            editor.appendChild(
                createInput(
                    `db-member-name-${dbIndex}`,
                    "Member name"
                )
            );


            const dataTypeSelect =
                createDataTypeSelect(
                    `db-member-type-${dbIndex}`,
                    null,
                    true
                );


            dataTypeSelect.addEventListener(
                "change",
                () =>
                    updateArrayEditorVisibility(
                        dbIndex
                    )
            );


            editor.appendChild(
                dataTypeSelect
            );


            editor.appendChild(
                createInput(
                    `db-member-comment-${dbIndex}`,
                    "Comment"
                )
            );


            editor.appendChild(
                createButton(
                    "Add member",
                    () =>
                        addMember(
                            dbIndex,
                            refresh
                        )
                )
            );


            content.appendChild(
                editor
            );


            content.appendChild(
                createArrayEditor(
                    dbIndex
                )
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