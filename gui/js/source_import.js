import { postJson } from "./api.js";
import { projectConfig } from "./state.js";
import { describeSourceImport } from "./source_import_diagnostics.js";

// Read-only compare / create-only multi-object UDT and DB import.
export function initSourceImportUi() {
    const exportButton = document.getElementById("source-export-bundle-button");
    const exportStatus = document.getElementById("source-export-bundle-status");
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

    let exportBusy = false;
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
        if (exportButton && !exportBusy) exportButton.disabled = !total;
        return total;
    }

    function refreshSelection() {
        renderObjectGroup(udtList, udtCount, projectConfig.udts,
            selectedUdts, knownUdts, "UDT");
        renderObjectGroup(dbList, dbCount, projectConfig.dbs,
            selectedDbs, knownDbs, "DB");
        showSelectionSummary();
    }

    exportButton?.addEventListener("click", async () => {
        if (exportBusy) return;
        const choice = selection();
        if (!choice.selected_udts.length && !choice.selected_dbs.length) return;
        exportBusy = true;
        exportButton.disabled = true;
        if (exportStatus) exportStatus.textContent =
            "Generating dependency-ordered SCL package locally…";
        try {
            const response = await fetch("/api/v1/tia/plc-structure-import/export", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({project: projectConfig, ...choice}),
            });
            if (!response.ok) {
                let message = "HTTP " + response.status;
                try {
                    const body = await response.json();
                    message = body.detail || message;
                } catch { /* Preserve the HTTP error if no JSON is available. */ }
                throw Error(message);
            }
            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = "TIAEngineeringAssistant_UDT_DB_SCL.zip";
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
            if (exportStatus) exportStatus.textContent =
                "Downloaded SCL files and manifest. No TIA changes made. "
                + "Compilation in TIA V21 is not verified.";
        } catch (error) {
            if (exportStatus) exportStatus.textContent =
                "SCL export failed: " + error.message;
        } finally {
            exportBusy = false;
            showSelectionSummary();
        }
    });

    async function generateSelectionPreview() {
        const generation = ++previewGeneration;
        const choice = selection();
        if (!choice.selected_udts.length && !choice.selected_dbs.length) {
            if (sourcePreview) sourcePreview.textContent =
                "Select at least one UDT or DB.";
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

    function appendDetailsCell(row, value) {
        const diagnosis = describeSourceImport(value);
        const cell = document.createElement("td");
        const details = document.createElement("details");
        details.className = "source-import-details";
        const summary = document.createElement("summary");
        summary.textContent = "Details";
        const body = document.createElement("div");
        body.className = "source-import-details-body";

        function paragraph(heading, message) {
            const section = document.createElement("section");
            section.className = "source-import-diagnostic-section";
            const title = document.createElement("strong");
            title.textContent = heading;
            const text = document.createElement("p");
            text.textContent = message;
            section.append(title, text);
            body.appendChild(section);
        }
        paragraph("Problem", diagnosis.problem);
        paragraph("Cause", diagnosis.cause);
        if (diagnosis.issueLines.length) {
            if (diagnosis.checklist) {
                const caption = document.createElement("p");
                caption.className = "source-import-checklist-caption";
                caption.textContent = "Properties to compare (checklist, not confirmed differences):";
                body.appendChild(caption);
            }
            const list = document.createElement("ul");
            list.className = "source-import-diagnostic-issues";
            for (const issue of diagnosis.issueLines) {
                const entry = document.createElement("li");
                entry.textContent = issue;
                list.appendChild(entry);
            }
            body.appendChild(list);
        }
        paragraph("What to check", diagnosis.action);

        // The API provides all declaration mismatches, not just the first
        // blocker in the compatibility status. Render as text, never HTML.
        if (Array.isArray(value.declaration_differences)
            && value.declaration_differences.length) {
            const title = document.createElement("strong");
            title.textContent = "Declaration differences (read-only)";
            const table = document.createElement("table");
            table.className = "management-table source-declaration-differences";
            const head = document.createElement("thead");
            const headRow = document.createElement("tr");
            for (const heading of ["Member", "Difference", "Requested", "Existing TIA"]) {
                const th = document.createElement("th");
                th.textContent = heading;
                headRow.append(th);
            }
            head.append(headRow);
            const tbody = document.createElement("tbody");
            for (const mismatch of value.declaration_differences) {
                const item = document.createElement("tr");
                for (const text of [mismatch.path, mismatch.property,
                    mismatch.expected, mismatch.actual]) {
                    const cell = document.createElement("td");
                    cell.textContent = String(text ?? "");
                    item.appendChild(cell);
                }
                tbody.appendChild(item);
            }
            table.append(head, tbody);
            body.append(title, table);
        }

        if (diagnosis.technical) {
            const technical = document.createElement("details");
            technical.className = "source-import-technical";
            const technicalSummary = document.createElement("summary");
            technicalSummary.textContent = "Technical details (TIA / Openness)";
            const pre = document.createElement("pre");
            pre.textContent = diagnosis.technical;
            technical.append(technicalSummary, pre);
            body.appendChild(technical);
        }
        details.append(summary, body);
        cell.appendChild(details);
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
            const state = item.status === "imported" ? "Imported in current batch"
                : item.status === "create" ? "Create"
                : item.status === "identical" ? "Identical — skip"
                : item.status === "compatible" ? "Existing compatible UDT — reuse"
                : item.status === "unknown" ? "Unverified — manual TIA review"
                : item.status === "blocked" ? "Blocked dependency — skip"
                : "Conflict — skip";
            appendCell(row, state);
            appendDetailsCell(row, item);
            reportRows.appendChild(row);
        }
        if (reportCounts) reportCounts.textContent =
            "Missing: " + (result.counts?.create || 0)
            + " · Imported this batch: " + (result.counts?.imported || 0)
            + " · Identical/skipped: " + (result.counts?.identical || 0)
            + " · Compatible UDTs/reused: " + (result.counts?.compatible || 0)
            + " · Unverified: " + (result.counts?.unknown || 0)
            + " · Conflicts: " + (result.counts?.conflict || 0)
            + " · Blocked dependencies: " + (result.counts?.blocked || 0)
            + " · Required UDTs added: "
            + ((result.auto_dependencies || []).join(", ") || "none")
            + ". " + (result.can_apply
                ? "Only eligible missing objects will be created after confirmation."
                : "Nothing eligible for creation.");
    }

    function renderAppliedReport(plan, result) {
        const created = new Set(result.created || []);
        const compiledDbs = new Set(result.compiled_dbs || []);
        const imported = created.size;
        renderReport({
            ...plan,
            can_apply: false,
            will_create: [],
            counts: {
                ...(plan.counts || {}),
                create: Math.max(0, (plan.counts?.create || 0) - imported),
                imported,
            },
            items: (plan.items || []).map((item) => {
                if (!created.has(item.name)) return item;
                const compiled = item.kind === "db" && compiledDbs.has(item.name);
                return {
                    ...item,
                    status: "imported",
                    reason: compiled
                        ? "Created and compiler-confirmed in the current TIA import batch."
                        : "Created in the current TIA import batch. Inspect TIA before further changes.",
                };
            }),
        });
    }

    function csvCell(value) {
        let valueText = String(value ?? "");
        if (/^[=+@\-\t\r]/.test(valueText)) valueText = "'" + valueText;
        return '"' + valueText.replace(/"/g, '""') + '"';
    }

    reportDownload?.addEventListener("click", () => {
        if (!lastReport) return;
        const rows = [
            ["Type", "Name", "Status", "Problem", "Cause",
                "What to check", "Declaration differences", "Technical details"],
            ...(lastReport.items || []).map(x => {
                const d = describeSourceImport(x);
                const differences = (x.declaration_differences || []).map(
                    issue => [issue.path, issue.property,
                        "requested=" + issue.expected,
                        "TIA=" + issue.actual].join(" | ")
                ).join("\n");
                return [x.kind.toUpperCase(), x.name, x.status, d.problem,
                    d.cause + (d.issueLines.length ? "\n" + d.issueLines.join("\n") : ""),
                    d.action, differences, d.technical];
            }),
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
                        : result.counts?.unknown || result.counts?.blocked
                            ? "Review unverified structures/dependencies in TIA and rerun preflight."
                        : "All selected structures already exist or required UDTs are compatible.");
            } else {
                status.textContent = "READY — " + items.length
                    + " eligible missing object(s): " + items.join(", ")
                    + ". Existing compatible UDTs will be reused. Other existing objects and their dependent "
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
            + "\nCompatible UDTs/reused: " + (prepared.counts.compatible || 0)
            + "\nUnverified/skipped: " + (prepared.counts.unknown || 0)
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
        const appliedPlan = prepared;
        status.textContent = "Creating missing structures in TIA. Do not close TIA dialogs…";
        try {
            const result = await postJson(
                "/api/v1/tia/plc-structure-import/apply",
                {...payload, expected_token: prepared.token,
                    approved_create: exact, backup_confirmed: true}
            );
            status.textContent = "IMPORTED — " + result.created.join(", ")
                + ". Reused UDTs: " + (result.reused_udts || []).join(", ")
                + ". Skipped identical: " + result.skipped_identical.length
                + ". Skipped conflicts/dependencies: "
                + (result.skipped_conflicts?.length || 0)
                + ". Project saved: " + (result.project_saved || "unconfirmed")
                + ". Compiled DBs: " + ((result.compiled_dbs || []).join(", ") || "none")
                + ". Inspect objects in TIA Portal.";
            renderAppliedReport(appliedPlan, result);
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
