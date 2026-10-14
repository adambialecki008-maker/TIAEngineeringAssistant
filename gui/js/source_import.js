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
    const udtList = document.getElementById("source-select-udts");
    const dbList = document.getElementById("source-select-dbs");
    const udtCount = document.getElementById("source-select-udt-count");
    const dbCount = document.getElementById("source-select-db-count");
    const selectionStatus = document.getElementById("source-selection-status");
    const selectedUdts = new Set();
    const selectedDbs = new Set();
    const knownUdts = new Set();
    const knownDbs = new Set();
    if (!planButton || !applyButton || !backupCheck || !status) return;

    let prepared = null;
    let lastReport = null;
    let plannedSnapshot = "";
    let previewGeneration = 0;

    // Read LIVE checkbox state. Never rely solely on cached Sets when
    // constructing a generate/import request: the DOM is the user selection.
    function selection() {
        function checked(container, kind, available, stored) {
            if (!container) return available
                .filter(item => stored.has(item.name)).map(item => item.name);
            const checkedNames = new Set([...container.querySelectorAll(
                'input[type="checkbox"][data-structure-kind="' + kind + '"]'
            )].filter(input => input.checked)
                .map(input => input.dataset.structureName));
            return available.filter(item => checkedNames.has(item.name))
                .map(item => item.name);
        }
        return {
            selected_udts: checked(udtList, "UDT", projectConfig.udts, selectedUdts),
            selected_dbs: checked(dbList, "DB", projectConfig.dbs, selectedDbs),
        };
    }

    function renderObjectGroup(container, counter, items, selected, known, kind) {
        if (!container) return;
        const current = new Set(items.map(item => item.name));
        for (const name of [...selected]) if (!current.has(name)) selected.delete(name);
        for (const name of [...known]) if (!current.has(name)) known.delete(name);
        container.replaceChildren();
        if (!items.length) {
            const empty = document.createElement("p");
            empty.className = "hint";
            empty.textContent = "No " + kind + " definitions configured.";
            container.appendChild(empty);
        }
        for (const item of items) {
            if (!known.has(item.name)) {
                selected.add(item.name); // Newly created items are checked by default.
                known.add(item.name);
            }
            const label = document.createElement("label");
            label.className = "checkbox-label structure-selection-item";
            const input = document.createElement("input");
            input.type = "checkbox";
            input.checked = selected.has(item.name);
            input.dataset.structureKind = kind;
            input.dataset.structureName = item.name;
            input.addEventListener("change", () => {
                if (input.checked) selected.add(item.name);
                else selected.delete(item.name);
                clearPlan();
                previewGeneration++;
                if (sourcePreview) sourcePreview.textContent = "";
                showSelectionSummary();
                counter.textContent = selected.size + "/" + items.length;
            });
            const text = document.createElement("span");
            text.textContent = item.name;
            label.append(input, text);
            container.appendChild(label);
        }
        if (counter) counter.textContent = selected.size + "/" + items.length;
    }

    function showSelectionSummary() {
        const choice = selection();
        const total = choice.selected_udts.length + choice.selected_dbs.length;
        if (selectionStatus) {
            selectionStatus.textContent = total
                ? "Selected for generation/import: "
                    + choice.selected_udts.length + " UDT, "
                    + choice.selected_dbs.length + " DB. "
                    + "Preflight compares only checked definitions."
                : "No structures selected. Select at least one UDT or DB.";
        }
        planButton.disabled = !total;
        return total;
    }

    function refreshSelection() {
        renderObjectGroup(udtList, udtCount, projectConfig.udts,
            selectedUdts, knownUdts, "UDT");
        renderObjectGroup(dbList, dbCount, projectConfig.dbs,
            selectedDbs, knownDbs, "DB");
        showSelectionSummary();
    }

    async function generateSelectionPreview() {
        const generation = ++previewGeneration;
        const choice = selection();
        if (!choice.selected_udts.length && !choice.selected_dbs.length) {
            if (sourcePreview) sourcePreview.textContent =
                "Select at least one UDT or DB.";
            return;
        }
        if (!projectConfig.plc_family) {
            if (sourcePreview) sourcePreview.textContent =
                "Select PLC family first.";
            return;
        }
        try {
            const response = await postJson(
                "/api/v1/tia/plc-structure-import/preview",
                {project: projectConfig, ...choice}
            );
            if (generation !== previewGeneration) return;
            // Verify that the preview follows the checked scope. Auto-added
            // UDT dependencies are explicitly tagged by the backend.
            const checked = new Set([...choice.selected_udts, ...choice.selected_dbs]);
            const unexpected = (response.items || []).filter(
                item => !checked.has(item.name) && !item.auto_dependency
            );
            if (unexpected.length) throw new Error(
                "Server generated unselected objects: "
                + unexpected.map(item => item.name).join(", ")
            );
            if (sourcePreview) sourcePreview.textContent = response.source;
        } catch (error) {
            if (generation !== previewGeneration) return;
            if (sourcePreview) sourcePreview.textContent =
                "Source preview failed: " + error.message;
        }
    }

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
            ...selection(),
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
        lastReport = result;
        report.classList.remove("hidden");
        reportRows.replaceChildren();
        for (const item of result.items || []) {
            const row = document.createElement("tr");
            appendCell(row, item.kind?.toUpperCase());
            appendCell(row, item.name);
            const state = item.status === "create" ? "Create"
                : item.status === "identical" ? "Identical — skip"
                : item.status === "blocked" ? "Blocked dependency — skip"
                : "Conflict — skip";
            appendCell(row, state);
            appendCell(row, item.reason);
            reportRows.appendChild(row);
        }
        if (reportCounts) reportCounts.textContent =
            "Missing: " + (result.counts?.create || 0)
            + " · Identical/skipped: " + (result.counts?.identical || 0)
            + " · Conflicts: " + (result.counts?.conflict || 0)
            + " · Blocked dependencies: " + (result.counts?.blocked || 0)
            + " · Required UDTs added: "
            + ((result.auto_dependencies || []).join(", ") || "none")
            + ". " + (result.can_apply
                ? "Only eligible missing objects will be created after confirmation."
                : "Nothing eligible for creation.");
    }

    function csvCell(value) {
        let valueText = String(value ?? "");
        if (/^[=+@\-\t\r]/.test(valueText)) valueText = "'" + valueText;
        return '"' + valueText.replace(/"/g, '""') + '"';
    }

    reportDownload?.addEventListener("click", () => {
        if (!lastReport) return;
        const rows = [
            ["Kind", "Name", "Decision", "Explanation"],
            ...(lastReport.items || []).map(x => [
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
            // A scope change while an async preflight was running must never
            // create an approval for the old selection.
            if (JSON.stringify(requestPayload()) !== JSON.stringify(payload)) {
                clearPlan();
                status.textContent = "Selection changed during preflight. "
                    + "Run Check target again.";
                return;
            }
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
            } else {
                status.textContent = "READY — " + items.length
                    + " eligible missing object(s): " + items.join(", ")
                    + ". Identical/conflicting objects and their dependent "
                    + "blocked structures will be skipped. "
                    + "Review the entire report and confirm only this subset.";
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
            + "\nAutomatically required UDTs to create: "
            + ((prepared.auto_dependencies || []).join(", ") || "none")
            + "\nConflicts (skipped): " + prepared.counts.conflict
            + "\nBlocked dependencies (skipped): "
            + (prepared.counts.blocked || 0)
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
                + ". Skipped conflicts/dependencies: "
                + (result.skipped_conflicts?.length || 0)
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

    refreshSelection();
    return {refreshSelection, selection, generateSelectionPreview};
}
