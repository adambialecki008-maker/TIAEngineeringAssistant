import { postJson } from "./api.js";
import { projectConfig } from "./state.js";

// Read-only compare / create-only multi-object UDT and DB import.
export function initSourceImportUi() {
    const planButton = document.getElementById("source-import-plan-button");
    const applyButton = document.getElementById("source-import-apply-button");
    const backupCheck = document.getElementById("source-import-backup-confirmed");
    const status = document.getElementById("source-import-status");
    const sourcePreview = document.getElementById("source-preview");
    const report = document.getElementById("source-import-report");
    const reportCounts = document.getElementById("source-import-report-counts");
    const reportRows = document.getElementById("source-import-report-rows");
    const reportDownload = document.getElementById("source-import-report-download");
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

    function clearPlan({clearReport = true} = {}) {
        prepared = null;
        plannedSnapshot = "";
        applyButton.disabled = true;
        if (clearReport) report?.classList.add("hidden");
    }

    function appendCell(row, value) {
        const cell = document.createElement("td");
        cell.textContent = String(value ?? "");
        row.appendChild(cell);
    }

    function renderReport(result) {
        if (!report || !reportRows) return;
        report.classList.remove("hidden");
        reportRows.replaceChildren();
        for (const item of result.items || []) {
            const row = document.createElement("tr");
            appendCell(row, item.kind?.toUpperCase());
            appendCell(row, item.name);
            const state = item.status === "create" ? "Create"
                : item.status === "identical" ? "Identical — skip" : "Conflict — blocked";
            appendCell(row, state);
            appendCell(row, item.reason);
            reportRows.appendChild(row);
        }
        if (reportCounts) reportCounts.textContent =
            "Missing: " + (result.counts?.create || 0)
            + " · Identical/skipped: " + (result.counts?.identical || 0)
            + " · Conflicts: " + (result.counts?.conflict || 0)
            + ". " + (result.can_apply
                ? "Only missing objects will be created after confirmation."
                : "Import blocked or nothing new to create.");
    }

    function csvCell(value) {
        let valueText = String(value ?? "");
        if (/^[=+@\-\t\r]/.test(valueText)) valueText = "'" + valueText;
        return '"' + valueText.replace(/"/g, '""') + '"';
    }

    reportDownload?.addEventListener("click", () => {
        if (!prepared) return;
        const rows = [
            ["Kind", "Name", "Decision", "Explanation"],
            ...(prepared.items || []).map(x => [
                x.kind.toUpperCase(), x.name, x.status, x.reason
            ]),
        ];
        const csv = "\ufeff" + rows.map(row => row.map(csvCell).join(";"))
            .join("\r\n");
        const url = URL.createObjectURL(
            new Blob([csv], {type: "text/csv;charset=utf-8"})
        );
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "TIA_UDT_DB_preflight.csv";
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    });

    planButton.addEventListener("click", async () => {
        clearPlan();
        backupCheck.checked = false;
        planButton.disabled = true;
        status.textContent = "Comparing UDTs and DBs with the live TIA PLC (read-only)…";
        try {
            const payload = requestPayload();
            const result = await postJson(
                "/api/v1/tia/plc-structure-import/plan", payload
            );
            prepared = result;
            plannedSnapshot = JSON.stringify(payload);
            renderReport(result);
            if (sourcePreview) {
                sourcePreview.textContent = result.items.map(item =>
                    "// " + item.status.toUpperCase() + ": " + item.kind
                    + " " + item.name + "\n" + item.source
                ).join("\n\n");
            }
            const items = result.will_create || [];
            if (!items.length) {
                status.textContent = "Nothing to import. "
                    + (result.counts?.conflict ? "Resolve conflicts in TIA before retrying."
                        : "All configured structures already exist and match.");
            } else if (!result.can_apply) {
                status.textContent = "IMPORT BLOCKED — "
                    + result.counts.conflict
                    + " difference(s) / unverified existing objects. "
                    + "No TIA objects were modified; see report.";
            } else {
                status.textContent = "READY — " + items.length
                    + " missing object(s): " + items.join(", ")
                    + ". Identical objects will be skipped. "
                    + "Review the report and confirm before import.";
            }
            applyButton.disabled = !result.can_apply;
        } catch (error) {
            status.textContent = "Preflight failed: " + error.message;
        } finally {
            planButton.disabled = false;
        }
    });

    applyButton.addEventListener("click", async () => {
        if (!prepared?.can_apply) return;
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
            status.textContent = "Configuration changed. Re-run the preflight report.";
            return;
        }
        const exact = prepared.will_create || [];
        if (!confirm(
            "CREATE MISSING UDT/DB OBJECTS IN OPEN TIA PROJECT?\n\n"
            + "Project: " + prepared.project_name
            + "\nPLC: " + prepared.device_name + " / " + prepared.plc_name
            + "\nCreate (" + exact.length + "): " + exact.join(", ")
            + "\nIdentical/skipped: " + prepared.counts.identical
            + "\nConflicts: " + prepared.counts.conflict
            + "\n\nExisting structures will never be overwritten. "
            + "Partial UNSAVED changes are possible if an import fails. "
            + "Proceed ONLY on a backup/test project?"
        )) return;

        applyButton.disabled = true;
        planButton.disabled = true;
        status.textContent = "Creating missing structures in TIA. Do not close TIA dialogs…";
        try {
            const result = await postJson(
                "/api/v1/tia/plc-structure-import/apply",
                {...payload, expected_token: prepared.token,
                    approved_create: exact, backup_confirmed: true}
            );
            status.textContent = "IMPORTED — " + result.created.join(", ")
                + ". Skipped identical: " + result.skipped_identical.length
                + ". Project saved: " + (result.project_saved || "unconfirmed")
                + ". Inspect objects and compile in TIA Portal.";
        } catch (error) {
            status.textContent = "IMPORT FAILED / UNCERTAIN — " + error.message
                + " Inspect the OPEN TIA project before retrying.";
        } finally {
            clearPlan({clearReport: false}); // Preserve the last read-only report.
            planButton.disabled = false;
        }
    });
}
