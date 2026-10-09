export const PLC_DATA_TYPES = {
    "S7-1200": [
        "Bool",

        "Byte",
        "Word",
        "DWord",

        "SInt",
        "USInt",
        "Int",
        "UInt",
        "DInt",
        "UDInt",

        "Real",
        "LReal",

        "Time",

        "Date",
        "TOD",
        "DTL",

        "Char",
        "WChar",
        "String",
        "WString",
    ],

    "S7-1200-G2": [
        "Bool",

        "Byte",
        "Word",
        "DWord",
        "LWord",

        "SInt",
        "USInt",
        "Int",
        "UInt",
        "DInt",
        "UDInt",
        "LInt",
        "ULInt",

        "Real",
        "LReal",

        "Time",
        "LTime",

        "Date",
        "TOD",
        "LTOD",
        "LDT",
        "DTL",

        "Char",
        "WChar",
        "String",
        "WString",
    ],

    "S7-1500": [
        "Bool",

        "Byte",
        "Word",
        "DWord",
        "LWord",

        "SInt",
        "USInt",
        "Int",
        "UInt",
        "DInt",
        "UDInt",
        "LInt",
        "ULInt",

        "Real",
        "LReal",

        "Time",
        "LTime",
        "S5Time",

        "Date",
        "TOD",
        "LTOD",
        "DT",
        "LDT",
        "DTL",

        "Char",
        "WChar",
        "String",
        "WString",
    ],
};


export function getPlcDataTypes(
    plcFamily
) {
    return (
        PLC_DATA_TYPES[plcFamily]
        ?? []
    );
}


function checkDataType(
    dataType,
    path,
    allowedTypes,
    udtNames,
    problems
) {
    const normalized =
        dataType.toLowerCase();


    if (
        normalized === "array"
        || normalized === "struct"
    ) {
        return;
    }


    if (
        !allowedTypes.has(normalized)
        &&
        !udtNames.has(normalized)
    ) {
        problems.push(
            `${path}: ${dataType}`
        );
    }
}


function checkMember(
    member,
    path,
    allowedTypes,
    udtNames,
    problems
) {
    const memberPath =
        `${path}.${member.name}`;


    if (
        member.data_type === "Array"
    ) {
        if (
            member.array_element_type
        ) {
            checkDataType(
                member.array_element_type,
                `${memberPath}[]`,
                allowedTypes,
                udtNames,
                problems
            );
        }

        return;
    }


    if (
        member.data_type === "Struct"
    ) {
        for (
            const child
            of member.struct_members ?? []
        ) {
            checkMember(
                child,
                memberPath,
                allowedTypes,
                udtNames,
                problems
            );
        }

        return;
    }


    checkDataType(
        member.data_type,
        memberPath,
        allowedTypes,
        udtNames,
        problems
    );
}


export function findIncompatibleDataTypes(
    config,
    targetPlcFamily
) {
    const allowedTypes =
        new Set(
            getPlcDataTypes(
                targetPlcFamily
            ).map(
                (type) =>
                    type.toLowerCase()
            )
        );


    const udtNames =
        new Set(
            config.udts.map(
                (udt) =>
                    udt.name.toLowerCase()
            )
        );


    const problems = [];


    for (const udt of config.udts) {
        for (const field of udt.fields) {
            checkMember(
                field,
                udt.name,
                allowedTypes,
                udtNames,
                problems
            );
        }
    }


    for (const db of config.dbs) {
        for (const member of db.members) {
            checkMember(
                member,
                db.name,
                allowedTypes,
                udtNames,
                problems
            );
        }
    }


    return problems;
}