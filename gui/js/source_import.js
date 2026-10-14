import { postJson } from "./api.js";
import { projectConfig } from "./state.js";

// This module is intentionally separate from Generate source. Neither
// rendering the preview nor selecting a PLC modifies TIA.
export function initSourceImportUi() {
    const planButton = document.getElementById("source-import-plan-button");
    const applyButton = document.getElementById("source-import-apply-button");
    const backupCheck = document.getElementById("source-import-backup-confirmed");
    const status = document.getElementById("source-import-status");
    const sourcePreview = document.getElementById("source-preview");
    if (!planButton || !applyButton || !backupCheck || !status) return;

    let prepared = null;
    let plannedSnapshot = "";

    function requestPayload() {
        const processId = Number(document.getElementById("tia-process")?.value);
        const target = projectConfig.tia_target;
        if (!Number.isInteger(processId) || processId <= 0
            || !target?.device_name || !target?.plc_name) {
            throw new Error("Connect to TIA and select a target PLC first.");
        }
        return {
            process_id: processId,
            device_name: target.device_name,
            plc_name: target.plc_name,
            project: projectConfig,
        };
    }

    function clearPlan() {
        prepared = null;
        plannedSnapshot = "";
        applyButton.disabled = true;
    }

    planButton.addEventListener("click", async () => {
        clearPlan();
        backupCheck.checked = false;
        planButton.disabled = true;
        status.textContent = "Checking the live TIA project and name collisions…";
        try {
            const payload = requestPayload();
            const result = await postJson(
                "/api/v1/tia/plc-structure-import/plan", payload
            );
            prepared = result;
            plannedSnapshot = JSON.stringify(payload);
            if (sourcePreview) {
                sourcePreview.textContent =
                    result.udt_source + "\n\n" + result.db_source;
            }
            status.textContent =
                "READY — Project: " + result.project_name
                + " | PLC: " + result.device_name + " / " + result.plc_name
                + " | Will CREATE: " + result.udt_name
                + " + " + result.db_name
                + " | No existing object will be overwritten.";
            applyButton.disabled = false;
        } catch (error) {
            status.textContent = "Preflight blocked: " + error.message;
        } finally {
            planButton.disabled = false;
        }
    });

    applyButton.addEventListener("click", async () => {
        if (!prepared) return;
        if (!backupCheck.checked) {
            status.textContent = "Confirm that you are working on a TIA project copy.";
            return;
        }
        let payload;
        try {
            payload = requestPayload();
        } catch (error) {
            clearPlan();
            status.textContent = error.message;
            return;
        }
        if (JSON.stringify(payload) !== plannedSnapshot) {
            clearPlan();
            status.textContent = "Configuration changed. Re-run Check target.";
            return;
        }
        if (!confirm(
            "Create " + prepared.udt_name + " and " + prepared.db_name
            + " in " + prepared.project_name + " / " + prepared.plc_name
            + "? This modifies the OPEN TIA project. Continue only on a backup."
        )) return;

        applyButton.disabled = true;
        planButton.disabled = true;
        status.textContent = "Import in progress. Check TIA for blocking dialogs…";
        try {
            const result = await postJson(
                "/api/v1/tia/plc-structure-import/apply",
                {
                    ...payload,
                    expected_token: prepared.token,
                    backup_confirmed: true,
                }
            );
            status.textContent = "IMPORTED — " + result.udt_name
                + " + " + result.db_name
                + ". Project saved: " + (result.project_saved || "unconfirmed")
                + ". Inspect both objects and compile in TIA Portal.";
        } catch (error) {
            status.textContent = "IMPORT FAILED — " + error.message
                + " Inspect the open TIA project before retrying.";
        } finally {
            clearPlan(); // Never reuse an already executed plan.
            planButton.disabled = false;
        }
    });
}
