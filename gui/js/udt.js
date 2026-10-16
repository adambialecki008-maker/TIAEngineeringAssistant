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

export function setUdtCategoryOptions(categories) {
    categoryOptions = [...new Set(categories.filter(value => typeof value === "string" && value.trim()))]
        .sort((left, right) => left.localeCompare(right));
    if (!categoryOptions.includes("General")) categoryOptions.push("General");
}

function createCategorySelect(udt, refresh) {
    const label = document.createElement("label");
    label.textContent = "Category: ";
    const select = document.createElement("select");
    const current = udt.category || "General";
    const options = categoryOptions.includes(current) ? categoryOptions : [...categoryOptions, current];
    for (const value of options) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    }
    select.value = current;
    select.addEventListener("change", () => {
        udt.category = select.value;
        saveProjectConfig();
        refresh();
    });
    label.appendChild(select);
    return label;
}


export function addUdt(
    nameInput,
    categoryInput,
    refresh
) {
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
        category: categoryInput?.value || "General",
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

    const expandedPaths =
        getExpandedMemberPaths(container);


    container.innerHTML =
        "";


    projectConfig.udts.forEach(
        (
            udt,
            udtIndex
        ) => {

            const onlyItem = projectConfig.udts.length === 1;
            const details = document.createElement(onlyItem ? "section" : "details");
            if (onlyItem) details.className = "single-engineering-item";


            details.dataset.name =
                udt.name;

            if (!onlyItem) details.open = openNames.has(udt.name);


            const summary = document.createElement(onlyItem ? "h4" : "summary");
            if (onlyItem) summary.className = "single-engineering-item-title";


            summary.textContent =
                `${udt.name} ` +
                `(${udt.fields.length} fields, ${udt.category || "General"})`;


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
                createCategorySelect(
                    udt,
                    refresh
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


            content.appendChild(
                createMemberTree({
                    prefix: "udt-field-" + udtIndex,
                    members: udt.fields,
                    ownerUdtName: udt.name,
                    openPaths: expandedPaths,
                    onChange: (next) => {
                        udt.fields = next;
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
