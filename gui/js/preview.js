import {
    projectConfig,
} from "./state.js";

import {
    postJson,
} from "./api.js";


export async function generatePreview(
    previewElement
) {
    if (!projectConfig.plc_family) {
        alert(
            "Select PLC family first."
        );

        return;
    }

    if (
        projectConfig.udts.length === 0 &&
        projectConfig.dbs.length === 0
    ) {
        alert(
            "Project does not contain any UDTs or DBs."
        );

        return;
    }

    try {
        const result =
            await postJson(
                "/api/v1/project-source",
                projectConfig
            );

        previewElement.textContent =
            result.source;

    } catch (error) {
        console.error(error);

        previewElement.textContent =
            "";

        alert(
            "Source generation failed. Check console."
        );
    }
}