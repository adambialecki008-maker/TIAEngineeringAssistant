// Local profiles isolate project configuration; the original legacy key is
// retained unmodified as a recovery copy after one-way migration.
const STORAGE_KEY = "tiaEngineeringAssistant.projectConfig";
const PROFILES_KEY = "tiaEngineeringAssistant.projectProfiles";
const ACTIVE_PROFILE_KEY = "tiaEngineeringAssistant.activeProjectProfile";
const PROFILE_PREFIX = "tiaEngineeringAssistant.projectConfig.profile.";
const LEGACY_BACKUP_KEY = "tiaEngineeringAssistant.projectConfig.legacyBackup";
const DEFAULT_PROFILE = "default";

function emptyProject() {
    return {
        plc_family: "", udts: [], dbs: [],
        device_config: {templates: [], groups: [], mappings: [], mapping_mode: "device"},
        tia_target: null,
    };
}
export const projectConfig = emptyProject();

function normalizeProfileName(value) {
    const name = String(value || "").trim().slice(0, 128);
    if (!name) throw Error("Profile name is required.");
    return name;
}
function initializeProjectProfiles() {
    let profiles = null;
    try { profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "null"); }
    catch { /* do not erase the legacy project */ }
    if (!Array.isArray(profiles) || !profiles.some(p => p?.id === DEFAULT_PROFILE)) {
        profiles = [{id: DEFAULT_PROFILE, name: "Default project"}];
        // First copy the old project to its own profile. Do not remove
        // or overwrite the legacy key (emergency recovery).
        if (localStorage.getItem(PROFILE_PREFIX + DEFAULT_PROFILE) === null) {
            const legacy = localStorage.getItem(STORAGE_KEY);
            if (legacy !== null && localStorage.getItem(LEGACY_BACKUP_KEY) === null)
                localStorage.setItem(LEGACY_BACKUP_KEY, legacy);
            localStorage.setItem(PROFILE_PREFIX + DEFAULT_PROFILE,
                legacy || JSON.stringify(emptyProject()));
        }
        localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
        localStorage.setItem(ACTIVE_PROFILE_KEY, DEFAULT_PROFILE);
    }
    const active = localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (!profiles.some(p => p.id === active)) {
        localStorage.setItem(ACTIVE_PROFILE_KEY, DEFAULT_PROFILE);
    }
    return profiles;
}
export function listProjectProfiles() {
    return initializeProjectProfiles().map(p => ({id: p.id, name: p.name}));
}
export function getActiveProjectProfileId() {
    initializeProjectProfiles();
    return localStorage.getItem(ACTIVE_PROFILE_KEY) || DEFAULT_PROFILE;
}
export function saveProjectConfig() {
    const active = getActiveProjectProfileId();
    const value = JSON.stringify(projectConfig);
    localStorage.setItem(PROFILE_PREFIX + active, value);
    // Compatibility with existing editor tests and legacy integrations.
    // The original pre-migration value is preserved at LEGACY_BACKUP_KEY.
    if (active === DEFAULT_PROFILE) localStorage.setItem(STORAGE_KEY, value);
}
function assignProject(parsed, clearTiaTarget = false) {
    projectConfig.plc_family = typeof parsed?.plc_family === "string" ? parsed.plc_family : "";
    projectConfig.udts = Array.isArray(parsed?.udts) ? parsed.udts : [];
    projectConfig.dbs = Array.isArray(parsed?.dbs) ? parsed.dbs : [];
    projectConfig.device_config = normalizeDeviceConfig(parsed?.device_config);
    // Preserve startup compatibility; clear bindings only when switching
    // local projects or restoring a portable backup.
    projectConfig.tia_target = clearTiaTarget ? null : normalizeTiaTarget(parsed?.tia_target);
}
export function loadProjectConfig() {
    const key = PROFILE_PREFIX + getActiveProjectProfileId();
    const saved = localStorage.getItem(key);
    try {
        assignProject(saved ? JSON.parse(saved) : emptyProject());
    } catch (error) {
        console.error("Cannot load local project profile:", error);
        throw Error("Project profile is invalid. Export/recover it before continuing.");
    }
}
export function createProjectProfile(value) {
    const name = normalizeProfileName(value);
    const profiles = initializeProjectProfiles();
    if (profiles.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
        throw Error("A project profile with this name already exists.");
    const entry = {id: "profile-" + crypto.randomUUID(), name};
    // Write configuration first; the index is updated only after success.
    localStorage.setItem(PROFILE_PREFIX + entry.id, JSON.stringify(emptyProject()));
    localStorage.setItem(PROFILES_KEY, JSON.stringify([...profiles, entry]));
    return entry;
}
export function renameProjectProfile(id, value) {
    const name = normalizeProfileName(value);
    const profiles = initializeProjectProfiles();
    if (!profiles.some(p => p.id === id)) throw Error("Project profile not found.");
    if (profiles.some(p => p.id !== id && p.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
        throw Error("A project profile with this name already exists.");
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.map(p =>
        p.id === id ? {...p, name} : p)));
}
export function switchProjectProfile(id) {
    const profiles = initializeProjectProfiles();
    if (!profiles.some(p => p.id === id)) throw Error("Project profile not found.");
    if (id === getActiveProjectProfileId()) return;
    // Parse destination first, preventing loss of the currently open project.
    const saved = localStorage.getItem(PROFILE_PREFIX + id);
    const next = saved ? JSON.parse(saved) : emptyProject();
    if (!next || typeof next !== "object" || Array.isArray(next))
        throw Error("Destination project profile is corrupt.");
    // Preserve the outgoing profile exactly before changing the active pointer.
    // The destination TIA target is cleared independently upon activation.
    saveProjectConfig();
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    assignProject(next, true);
    saveProjectConfig();
}
export function deleteProjectProfile(id) {
    const profiles = initializeProjectProfiles();
    if (id === DEFAULT_PROFILE) throw Error("Default project cannot be deleted.");
    if (id === getActiveProjectProfileId()) throw Error("Switch projects before deleting the active profile.");
    if (!profiles.some(p => p.id === id)) throw Error("Project profile not found.");
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.filter(p => p.id !== id)));
    localStorage.removeItem(PROFILE_PREFIX + id);
}
// Full restore changes only the active profile, never another project.
export function replaceProjectConfig(parsed) {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw Error("Invalid project backup.");
    assignProject(parsed, true);
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
