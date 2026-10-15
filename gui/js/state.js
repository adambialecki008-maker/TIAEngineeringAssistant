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
        mapping_mode: "device",
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


// Used only by an explicitly confirmed local backup restore. It reuses the
// same normalizers as legacy localStorage loading and never talks to TIA.
export function replaceProjectConfig(parsed) {
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid project backup.");
    }
    projectConfig.plc_family = typeof parsed.plc_family === "string"
        ? parsed.plc_family : "";
    projectConfig.udts = Array.isArray(parsed.udts) ? parsed.udts : [];
    projectConfig.dbs = Array.isArray(parsed.dbs) ? parsed.dbs : [];
    projectConfig.device_config = normalizeDeviceConfig(parsed.device_config);
    // Restored hardware targets are intentionally cleared: a portable backup
    // must be re-confirmed against the locally open TIA project.
    projectConfig.tia_target = null;
    saveProjectConfig();
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
            mapping_mode: "device",
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

                        category:
                            typeof template.category
                            ===
                            "string"
                            &&
                            template.category.trim()
                            ? template.category.trim()
                            : "General",

                        compatible_plc_families:
                            Array.isArray(
                                template.compatible_plc_families
                            )
                                ? template.compatible_plc_families
                                    .filter(
                                        (family) =>
                                            typeof family
                                            ===
                                            "string"
                                            &&
                                            family.trim()
                                    )
                                    .map(
                                        (family) =>
                                            family.trim()
                                    )
                                : [],

                        library_origin:
                            template.library_origin
                            &&
                            typeof template.library_origin
                            ===
                            "object"
                                ? {
                                    library_id:
                                        typeof template.library_origin.library_id
                                        ===
                                        "string"
                                            ? template.library_origin.library_id
                                            : "",
                                    library_name:
                                        typeof template.library_origin.library_name
                                        ===
                                        "string"
                                            ? template.library_origin.library_name
                                            : "",
                                    object_id:
                                        typeof template.library_origin.object_id
                                        ===
                                        "string"
                                            ? template.library_origin.object_id
                                            : "",
                                    version:
                                        typeof template.library_origin.version
                                        ===
                                        "string"
                                            ? template.library_origin.version
                                            : "",
                                }
                                : undefined,

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
        // Existing configurations default to the historic by-signal mode.
        // New projects default to by-device. Saved anchors are never migrated.
        mapping_mode: ["device", "signal"].includes(value.mapping_mode)
            ? value.mapping_mode
            : (groups.length || templates.length || mappings.length ? "signal" : "device"),
    };
}
