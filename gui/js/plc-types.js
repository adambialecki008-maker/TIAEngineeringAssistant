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


export function getPlcDataTypes(plcFamily) {
    return PLC_DATA_TYPES[plcFamily] ?? [];
}


export function isBuiltInDataType(
    plcFamily,
    dataType
) {
    const allowedTypes =
        getPlcDataTypes(plcFamily);

    return allowedTypes.some(
        (type) =>
            type.toLowerCase() ===
            dataType.toLowerCase()
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
            const type =
                field.data_type.toLowerCase();

            if (
                !allowedTypes.has(type) &&
                !udtNames.has(type)
            ) {
                problems.push(
                    `${udt.name}.${field.name}: ${field.data_type}`
                );
            }
        }
    }


    for (const db of config.dbs) {
        for (const member of db.members) {
            const type =
                member.data_type.toLowerCase();

            if (
                !allowedTypes.has(type) &&
                !udtNames.has(type)
            ) {
                problems.push(
                    `${db.name}.${member.name}: ${member.data_type}`
                );
            }
        }
    }


    return problems;
}