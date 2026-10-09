const STORAGE_KEY =
    "tiaEngineeringAssistant.projectConfig";


export const projectConfig = {
    plc_family: "",
    udts: [],
    dbs: [],
    device_config: {
        templates: [],
        groups: [],
        mappings: [],
    },
    tia_target: null,
};


export function saveProjectConfig() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
            projectConfig
        )
    );
}


export function loadProjectConfig() {
    const saved =
        localStorage.getItem(
            STORAGE_KEY
        );


    if (!saved) {
        return;
    }


    try {
        const parsed =
            JSON.parse(
                saved
            );


        projectConfig.plc_family =
            parsed.plc_family
            ?? "";


        projectConfig.udts =
            Array.isArray(
                parsed.udts
            )
                ? parsed.udts
                : [];


        projectConfig.dbs =
            Array.isArray(
                parsed.dbs
            )
                ? parsed.dbs
                : [];


        projectConfig.device_config =
            normalizeDeviceConfig(
                parsed.device_config
            );


        projectConfig.tia_target =
            normalizeTiaTarget(
                parsed.tia_target
            );

    } catch (error) {
        console.error(
            "Cannot load project configuration:",
            error
        );
    }
}


function normalizeTiaTarget(
    value
) {
    if (
        !value
        ||
        typeof value
        !==
        "object"
    ) {
        return null;
    }


    if (
        typeof value.device_name
        !==
        "string"
        ||
        typeof value.plc_name
        !==
        "string"
    ) {
        return null;
    }


    return {
        device_name:
            value.device_name,

        plc_name:
            value.plc_name,

        type_identifier:
            typeof value.type_identifier
            ===
            "string"
                ? value.type_identifier
                : "",
    };
}


function normalizeDeviceConfig(
    value
) {
    if (
        !value
        ||
        typeof value
        !==
        "object"
    ) {
        return {
            templates: [],
            groups: [],
            mappings: [],
        };
    }


    const templates =
        Array.isArray(
            value.templates
        )
            ? value.templates
                .filter(
                    (template) =>
                        template
                        &&
                        typeof template.id
                        ===
                        "string"
                        &&
                        typeof template.name
                        ===
                        "string"
                )
                .map(
                    (template) => ({
                        id:
                            template.id,

                        name:
                            template.name,

                        signals:
                            Array.isArray(
                                template.signals
                            )
                                ? template.signals
                                    .filter(
                                        (signal) =>
                                            signal
                                            &&
                                            typeof signal.id
                                            ===
                                            "string"
                                    )
                                    .map(
                                        (signal) => ({
                                            id:
                                                signal.id,

                                            key:
                                                typeof signal.key
                                                ===
                                                "string"
                                                    ? signal.key
                                                    : "",

                                            tag_pattern:
                                                typeof signal.tag_pattern
                                                ===
                                                "string"
                                                    ? signal.tag_pattern
                                                    : "",

                                            io_type:
                                                [
                                                    "Input",
                                                    "Output",
                                                    "Internal",
                                                ].includes(
                                                    signal.io_type
                                                )
                                                    ? signal.io_type
                                                    : "Internal",

                                            data_type:
                                                typeof signal.data_type
                                                ===
                                                "string"
                                                &&
                                                signal.data_type
                                                    .trim()
                                                    .length
                                                >
                                                0
                                                    ? signal.data_type
                                                    : "Bool",
                                        })
                                    )
                                : [],
                    })
                )
            : [];


    const groups =
        Array.isArray(
            value.groups
        )
            ? value.groups
                .filter(
                    (group) =>
                        group
                        &&
                        typeof group.id
                        ===
                        "string"
                        &&
                        typeof group.template_id
                        ===
                        "string"
                )
                .map(
                    (group) => ({
                        id:
                            group.id,

                        template_id:
                            group.template_id,

                        prefix:
                            typeof group.prefix
                            ===
                            "string"
                                ? group.prefix
                                : "",

                        start_index:
                            Number.isInteger(
                                group.start_index
                            )
                                ? group.start_index
                                : 1,

                        quantity:
                            Number.isInteger(
                                group.quantity
                            )
                                ? group.quantity
                                : 1,

                        digits:
                            Number.isInteger(
                                group.digits
                            )
                                ? group.digits
                                : 2,
                    })
                )
            : [];


    const mappings =
        Array.isArray(
            value.mappings
        )
            ? value.mappings
                .filter(
                    (mapping) =>
                        mapping
                        &&
                        typeof mapping.group_id
                        ===
                        "string"
                        &&
                        typeof mapping.signal_id
                        ===
                        "string"
                        &&
                        typeof mapping.start_channel_key
                        ===
                        "string"
                )
                .map(
                    (mapping) => ({
                        group_id:
                            mapping.group_id,

                        signal_id:
                            mapping.signal_id,

                        start_channel_key:
                            mapping.start_channel_key,
                    })
                )
            : [];


    return {
        templates,
        groups,
        mappings,
    };
}