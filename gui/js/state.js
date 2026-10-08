const STORAGE_KEY =
    "tiaEngineeringAssistant.projectConfig";


export const projectConfig = {
    plc_family: "",
    udts: [],
    dbs: [],
};


export function saveProjectConfig() {
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(projectConfig)
    );
}


export function loadProjectConfig() {
    const saved =
        localStorage.getItem(STORAGE_KEY);

    if (!saved) {
        return;
    }

    try {
        const parsed =
            JSON.parse(saved);

        projectConfig.plc_family =
            parsed.plc_family ?? "";

        projectConfig.udts =
            Array.isArray(parsed.udts)
                ? parsed.udts
                : [];

        projectConfig.dbs =
            Array.isArray(parsed.dbs)
                ? parsed.dbs
                : [];

    } catch (error) {
        console.error(
            "Cannot load project configuration:",
            error
        );
    }
}