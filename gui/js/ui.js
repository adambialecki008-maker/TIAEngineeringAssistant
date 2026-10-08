import {
    projectConfig,
} from "./state.js";

import {
    getPlcDataTypes,
} from "./plc-types.js";


export function createButton(
    text,
    handler
) {
    const button =
        document.createElement("button");

    button.type = "button";
    button.textContent = text;

    button.addEventListener(
        "click",
        handler
    );

    return button;
}


export function createTextCell(text) {
    const cell =
        document.createElement("td");

    cell.textContent =
        text ?? "";

    return cell;
}


export function createInput(
    id,
    placeholder,
    type = "text"
) {
    const input =
        document.createElement("input");

    input.id = id;
    input.type = type;
    input.placeholder = placeholder;

    return input;
}


export function createDataTypeSelect(
    id,
    excludeUdtName = null,
    includeArray = false
) {
    const select =
        document.createElement("select");

    select.id = id;


    const defaultOption =
        document.createElement("option");

    defaultOption.value = "";
    defaultOption.textContent =
        "Select data type";

    select.appendChild(
        defaultOption
    );


    const dataTypes =
        getPlcDataTypes(
            projectConfig.plc_family
        );


    if (dataTypes.length === 0) {
        const noPlcOption =
            document.createElement(
                "option"
            );

        noPlcOption.value = "";
        noPlcOption.disabled = true;
        noPlcOption.textContent =
            "Select PLC family first";

        select.appendChild(
            noPlcOption
        );

        return select;
    }


    const builtInGroup =
        document.createElement(
            "optgroup"
        );

    builtInGroup.label =
        "TIA data types";


    for (const type of dataTypes) {
        const option =
            document.createElement(
                "option"
            );

        option.value = type;
        option.textContent = type;

        builtInGroup.appendChild(
            option
        );
    }


    select.appendChild(
        builtInGroup
    );


    if (includeArray) {
        const complexGroup =
            document.createElement(
                "optgroup"
            );

        complexGroup.label =
            "Complex data types";


        const arrayOption =
            document.createElement(
                "option"
            );

        arrayOption.value = "Array";
        arrayOption.textContent = "Array";

        complexGroup.appendChild(
            arrayOption
        );

        select.appendChild(
            complexGroup
        );
    }


    const availableUdts =
        projectConfig.udts.filter(
            (udt) => {
                if (!excludeUdtName) {
                    return true;
                }

                return (
                    udt.name.toLowerCase() !==
                    excludeUdtName.toLowerCase()
                );
            }
        );


    if (availableUdts.length > 0) {
        const udtGroup =
            document.createElement(
                "optgroup"
            );

        udtGroup.label = "UDTs";


        for (const udt of availableUdts) {
            const option =
                document.createElement(
                    "option"
                );

            option.value = udt.name;
            option.textContent = udt.name;

            udtGroup.appendChild(
                option
            );
        }


        select.appendChild(
            udtGroup
        );
    }


    return select;
}


export function getOpenNames(
    container
) {
    return new Set(
        Array.from(
            container.querySelectorAll(
                "details[open]"
            )
        ).map(
            (details) =>
                details.dataset.name
        )
    );
}