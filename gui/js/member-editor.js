import {
    createButton,
    createInput,
    createDataTypeSelect,
    createTextCell,
} from "./ui.js";


const ARRAY_MIN_BOUND =
    -32768;

const ARRAY_MAX_BOUND =
    32767;


export function formatMemberType(
    member
) {
    if (
        member.data_type === "Array"
    ) {
        return (
            `Array[` +
            `${member.array_lower_bound}..` +
            `${member.array_upper_bound}] ` +
            `of ${member.array_element_type}`
        );
    }


    if (
        member.data_type === "Struct"
    ) {
        const count =
            member.struct_members
                ?.length
            ?? 0;

        return (
            `Struct (${count} members)`
        );
    }


    return member.data_type;
}


export function createMemberEditor({
    prefix,
    existingMembers,
    excludeUdtName = null,
    onAdd,
    allowStruct = true,
}) {
    const root =
        document.createElement(
            "div"
        );


    let structMembers = [];


    const mainRow =
        document.createElement(
            "div"
        );

    mainRow.className =
        "editor-row";


    const nameInput =
        createInput(
            `${prefix}-name`,
            "Name"
        );


    const typeSelect =
        createDataTypeSelect(
            `${prefix}-type`,
            excludeUdtName,
            true,
            allowStruct
        );


    const commentInput =
        createInput(
            `${prefix}-comment`,
            "Comment"
        );


    const addButton =
        createButton(
            "Add",
            addCurrentMember
        );


    mainRow.appendChild(
        nameInput
    );

    mainRow.appendChild(
        typeSelect
    );

    mainRow.appendChild(
        commentInput
    );

    mainRow.appendChild(
        addButton
    );


    root.appendChild(
        mainRow
    );


    const complexArea =
        document.createElement(
            "div"
        );


    root.appendChild(
        complexArea
    );


    typeSelect.addEventListener(
        "change",
        renderComplexEditor
    );


    function renderComplexEditor() {
        complexArea.innerHTML =
            "";


        if (
            typeSelect.value ===
            "Array"
        ) {
            renderArrayEditor();
        }


        if (
            typeSelect.value ===
            "Struct"
        ) {
            renderStructEditor();
        }
    }


    function renderArrayEditor() {
        const row =
            document.createElement(
                "div"
            );

        row.className =
            "editor-row";


        const elementLabel =
            document.createElement(
                "label"
            );

        elementLabel.textContent =
            "Element type:";


        const elementType =
            createDataTypeSelect(
                `${prefix}-array-type`,
                excludeUdtName,
                false,
                false
            );


        const lowerLabel =
            document.createElement(
                "label"
            );

        lowerLabel.textContent =
            "Lower bound:";


        const lowerInput =
            createInput(
                `${prefix}-array-lower`,
                "0",
                "number"
            );

        lowerInput.value =
            "0";

        lowerInput.min =
            String(
                ARRAY_MIN_BOUND
            );

        lowerInput.max =
            String(
                ARRAY_MAX_BOUND
            );


        const upperLabel =
            document.createElement(
                "label"
            );

        upperLabel.textContent =
            "Upper bound:";


        const upperInput =
            createInput(
                `${prefix}-array-upper`,
                "9",
                "number"
            );

        upperInput.value =
            "9";

        upperInput.min =
            String(
                ARRAY_MIN_BOUND
            );

        upperInput.max =
            String(
                ARRAY_MAX_BOUND
            );


        row.appendChild(
            elementLabel
        );

        row.appendChild(
            elementType
        );

        row.appendChild(
            lowerLabel
        );

        row.appendChild(
            lowerInput
        );

        row.appendChild(
            upperLabel
        );

        row.appendChild(
            upperInput
        );


        complexArea.appendChild(
            row
        );
    }


    function renderStructEditor() {
        const wrapper =
            document.createElement(
                "div"
            );

        wrapper.className =
            "struct-editor";


        const title =
            document.createElement(
                "h4"
            );

        title.textContent =
            "Struct members";


        wrapper.appendChild(
            title
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


        table.appendChild(
            tbody
        );


        wrapper.appendChild(
            table
        );


        function renderStructRows() {
            tbody.innerHTML =
                "";


            structMembers.forEach(
                (
                    member,
                    index
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
                            "Delete",
                            () => {
                                structMembers.splice(
                                    index,
                                    1
                                );

                                renderStructRows();
                            }
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
        }


        const nestedEditor =
            createMemberEditor({
                prefix:
                    `${prefix}-struct-member`,

                existingMembers:
                    structMembers,

                excludeUdtName:
                    excludeUdtName,

                allowStruct:
                    false,

                onAdd:
                    (member) => {
                        structMembers.push(
                            member
                        );

                        renderStructRows();
                    },
            });


        wrapper.appendChild(
            nestedEditor
        );


        complexArea.appendChild(
            wrapper
        );


        renderStructRows();
    }


    function addCurrentMember() {
        const name =
            nameInput.value.trim();

        const dataType =
            typeSelect.value;

        const comment =
            commentInput.value.trim();


        if (!name) {
            alert(
                "Name is required."
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
            existingMembers.some(
                (member) =>
                    member.name
                        .toLowerCase()
                    ===
                    name.toLowerCase()
            );


        if (duplicate) {
            alert(
                `Member "${name}" already exists.`
            );

            return;
        }


        const member = {
            name: name,
            data_type: dataType,
            comment:
                comment || null,

            array_element_type:
                null,

            array_lower_bound:
                null,

            array_upper_bound:
                null,

            struct_members:
                null,
        };


        if (
            dataType === "Array"
        ) {
            const elementType =
                document
                    .getElementById(
                        `${prefix}-array-type`
                    )
                    .value;


            const lowerText =
                document
                    .getElementById(
                        `${prefix}-array-lower`
                    )
                    .value;


            const upperText =
                document
                    .getElementById(
                        `${prefix}-array-upper`
                    )
                    .value;


            if (!elementType) {
                alert(
                    "Array element type is required."
                );

                return;
            }


            const lowerBound =
                Number(lowerText);

            const upperBound =
                Number(upperText);


            if (
                !Number.isInteger(
                    lowerBound
                )
                ||
                !Number.isInteger(
                    upperBound
                )
            ) {
                alert(
                    "Array bounds must be integers."
                );

                return;
            }


            if (
                lowerBound
                < ARRAY_MIN_BOUND
                ||
                lowerBound
                > ARRAY_MAX_BOUND
            ) {
                alert(
                    `Lower bound must be between ` +
                    `${ARRAY_MIN_BOUND} and ` +
                    `${ARRAY_MAX_BOUND}.`
                );

                return;
            }


            if (
                upperBound
                < ARRAY_MIN_BOUND
                ||
                upperBound
                > ARRAY_MAX_BOUND
            ) {
                alert(
                    `Upper bound must be between ` +
                    `${ARRAY_MIN_BOUND} and ` +
                    `${ARRAY_MAX_BOUND}.`
                );

                return;
            }


            if (
                upperBound
                < lowerBound
            ) {
                alert(
                    "Upper bound must be greater than " +
                    "or equal to lower bound."
                );

                return;
            }


            member.array_element_type =
                elementType;

            member.array_lower_bound =
                lowerBound;

            member.array_upper_bound =
                upperBound;
        }


        if (
            dataType === "Struct"
        ) {
            if (
                structMembers.length === 0
            ) {
                alert(
                    "Struct must contain at least one member."
                );

                return;
            }


            member.struct_members =
                structuredClone(
                    structMembers
                );
        }


        onAdd(member);


        nameInput.value =
            "";

        commentInput.value =
            "";

        typeSelect.value =
            "";

        structMembers =
            [];

        complexArea.innerHTML =
            "";
    }


    return root;
}