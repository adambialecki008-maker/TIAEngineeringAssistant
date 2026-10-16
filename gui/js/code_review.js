import {postJson} from "./api.js";
import {projectConfig} from "./state.js";

function markdownText(value) {
    return String(value || "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

const PRIORITY_ORDER = ["P0", "P1", "P2", "P3"];
const PRIORITY_RANK = Object.fromEntries(PRIORITY_ORDER.map((key, index) => [key, index]));

function findingPriority(finding) {
    if (PRIORITY_ORDER.includes(finding.priority)) return finding.priority;
    const confirmed = finding.detection_method === "rule" && finding.verification_status === "verified";
    const severity = String(finding.severity || "").toLowerCase();
    if (severity === "critical" || severity === "error") return confirmed ? "P0" : "P1";
    if (severity === "warning") return confirmed ? "P1" : "P2";
    return "P3";
}

function orderedFindings(findings) {
    return [...findings].sort((a, b) => (
        (PRIORITY_RANK[findingPriority(a)] - PRIORITY_RANK[findingPriority(b)])
        || String(a.source_file || "").localeCompare(String(b.source_file || ""))
        || String(a.block || "").localeCompare(String(b.block || ""))
        || String(a.location || "").localeCompare(String(b.location || ""))
        || String(a.category || "").localeCompare(String(b.category || ""))
    ));
}

function projectReviewSummary(report) {
    if (report.summary && typeof report.summary.total_findings === "number") return report.summary;
    // Read-only compatibility for reports produced by older local backends.
    const files = [];
    const indexed = new Map();
    for (const block of report.files || []) {
        let record = indexed.get(block.source_file);
        if (!record) {
            record = {source_file:block.source_file, blocks:[], findings:0,
                by_priority:Object.fromEntries(PRIORITY_ORDER.map(p => [p, 0]))};
            indexed.set(block.source_file, record);
            files.push(record);
        }
        record.blocks.push(block.name);
    }
    const by_priority = Object.fromEntries(PRIORITY_ORDER.map(p => [p, 0]));
    const by_severity = {critical:0, error:0, warning:0, info:0};
    const by_method = {rule:0, AI:0};
    for (const finding of report.findings || []) {
        const priority = findingPriority(finding);
        by_priority[priority] += 1;
        const sev = finding.severity || "info";
        by_severity[sev] = (by_severity[sev] || 0) + 1;
        const method = finding.detection_method || "rule";
        by_method[method] = (by_method[method] || 0) + 1;
        if (!indexed.has(finding.source_file)) {
            const record = {source_file:finding.source_file, blocks:[], findings:0,
                by_priority:Object.fromEntries(PRIORITY_ORDER.map(p => [p, 0]))};
            indexed.set(finding.source_file, record);
            files.push(record);
        }
        const bucket = indexed.get(finding.source_file);
        bucket.findings += 1;
        bucket.by_priority[priority] += 1;
    }
    return {
        analyzed_files:files.length, analyzed_blocks:(report.files || []).length,
        incomplete_blocks:(report.files || []).filter(b => b.verification_status !== "parsed").length,
        total_findings:(report.findings || []).length,
        by_priority, by_severity, by_method, files,
    };
}

function appendReviewCell(row, value, tag = "td") {
    const cell = document.createElement(tag);
    cell.textContent = String(value ?? "");
    row.appendChild(cell);
    return cell;
}

function renderProjectSummary(report, parent) {
    const summary = projectReviewSummary(report);
    const section = document.createElement("section");
    section.className = "review-project-summary";
    const title = document.createElement("h3");
    title.textContent = "Project overview";
    section.appendChild(title);
    const metrics = document.createElement("p");
    metrics.className = "review-summary-metrics";
    metrics.textContent = summary.analyzed_files + " files · " + summary.analyzed_blocks
        + " blocks · " + summary.total_findings + " findings · "
        + summary.incomplete_blocks + " incompletely parsed blocks";
    section.appendChild(metrics);
    const priority = document.createElement("p");
    priority.className = "review-priority-summary";
    priority.textContent = PRIORITY_ORDER.map(p => p + ": " + (summary.by_priority?.[p] || 0)).join("  ·  ")
        + "  |  AI: " + (summary.by_method?.AI || 0)
        + "  |  Rules: " + (summary.by_method?.rule || 0);
    section.appendChild(priority);
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "P0: verified critical/error · P1: high attention · P2: review · P3: informational. "
        + "Unverified AI findings cannot be P0. Priorities are triage hints, not PLC compilation results.";
    section.appendChild(note);
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrapper";
    const table = document.createElement("table");
    table.className = "management-table review-file-summary";
    const header = document.createElement("tr");
    for (const key of ["File", "Blocks", "P0", "P1", "P2", "P3", "Findings"]) {
        appendReviewCell(header, key, "th");
    }
    const thead = document.createElement("thead");
    thead.appendChild(header);
    const tbody = document.createElement("tbody");
    for (const file of summary.files || []) {
        const row = document.createElement("tr");
        appendReviewCell(row, file.source_file);
        appendReviewCell(row, (file.blocks || []).join(", ") || "—");
        for (const p of PRIORITY_ORDER) appendReviewCell(row, file.by_priority?.[p] || 0);
        appendReviewCell(row, file.findings || 0);
        tbody.appendChild(row);
    }
    table.append(thead, tbody);
    wrapper.appendChild(table);
    section.appendChild(wrapper);
    parent.appendChild(section);
}

function reportMarkdown(report) {
    const lines = ["# PLC Code Review", "", "Read-only local analysis report.", ""];
    const overview = projectReviewSummary(report);
    lines.push("## Project overview", "",
        "Files: " + overview.analyzed_files + "; blocks: " + overview.analyzed_blocks
            + "; findings: " + overview.total_findings
            + "; incomplete blocks: " + overview.incomplete_blocks + ".", "",
        "Priority counts: " + PRIORITY_ORDER.map(p => p + "=" + (overview.by_priority?.[p] || 0)).join("; "), "",
        "P0: verified critical/error. Unverified AI suggestions cannot be P0.", "",
        "| File | Blocks | P0 | P1 | P2 | P3 | Total |",
        "| --- | --- | --- | --- | --- | --- | --- |");
    for (const file of overview.files || []) {
        lines.push("| " + [
            file.source_file, (file.blocks || []).join(", ") || "—",
            ...PRIORITY_ORDER.map(p => String(file.by_priority?.[p] || 0)),
            String(file.findings || 0),
        ].map(markdownText).join(" | ") + " |");
    }
    lines.push("");
    lines.push("## Files", "", "| Source | Block | Type | Language | Verification |", "| --- | --- | --- | --- | --- |");
    for (const block of report.files) lines.push("| " + [block.source_file, block.name, block.block_type, block.language, block.verification_status].map(markdownText).join(" | ") + " |");
    const networkBlocks = report.files.filter(block => (block.network_details || []).length);
    if (networkBlocks.length) {
        lines.push("", "## LAD/FBD network topology (not logic-verified)", "");
        for (const block of networkBlocks) {
            lines.push("### " + markdownText(block.name) + " — " + markdownText(block.source_file), "");
            for (const network of block.network_details) {
                lines.push("#### Network " + network.number + " — " + markdownText(network.language || block.language), "");
                lines.push("Recognized nodes: " + (network.nodes || []).length
                    + "; explicit wires: " + (network.wires || []).length
                    + "; FlgNet " + markdownText(network.schema_version || "version unknown")
                    + "; coverage: " + markdownText(network.coverage || "unknown") + ".", "");
                for (const node of network.nodes || []) {
                    lines.push("- Node " + markdownText(node.uid) + ": " + markdownText(node.kind)
                        + " " + markdownText(node.name || node.symbol || node.constant_value) +
                        (node.scope ? " (" + markdownText(node.scope) + ")" : ""));
                    if (node.constant_type || node.constant_value) lines.push("  - Constant: "
                        + markdownText(node.constant_type) + " " + markdownText(node.constant_value));
                    if (Object.keys(node.template_values || {}).length) lines.push("  - Templates: "
                        + Object.entries(node.template_values).map(([k, v]) => markdownText(k) + "=" + markdownText(v)).join(", "));
                    if (node.instance) lines.push("  - Instance: " + markdownText(node.instance));
                    for (const param of node.call_parameters || []) lines.push("  - Parameter: "
                        + markdownText(param.name) + " (" + markdownText(param.section) + "; " + markdownText(param.data_type) + ")");
                    for (const port of node.connections || []) lines.push("  - Pin " + markdownText(port.port)
                        + " on wire " + markdownText(port.wire_uid) + ": "
                        + (port.peers || []).map(markdownText).join(" ; "));
                }
                for (const wire of network.wires || []) {
                    lines.push("- Wire " + markdownText(wire.uid) + ": "
                        + (wire.endpoints || []).map(endpointText).map(markdownText).join(" ; "));
                }
                for (const warning of network.warnings || []) {
                    lines.push("- Requires TIA verification: " + markdownText(warning));
                }
                lines.push("");
            }
        }
    }
    const callBlocks = report.files.filter(block => (block.calls || []).length);
    if (callBlocks.length) {
        lines.push("", "## Observed FB/FC calls (read-only)", "");
        for (const block of callBlocks) {
            lines.push("### " + markdownText(block.name) + " — " + markdownText(block.source_file), "");
            lines.push("| Location | Source | Target | Nesting | Via instance | Resolution | Arguments |",
                "| --- | --- | --- | --- | --- | --- | --- |");
            for (const call of block.calls) {
                lines.push("| " + [
                    call.location, call.source, call.target,
                    call.parent_target ? "under " + call.parent_target + " (depth " + call.nesting_depth + ")" : "Top level",
                    call.instance || "—", call.resolution,
                    call.source === "SCL" ? (call.arguments_complete ? "Parsed named bindings" : "Not fully verified") : "Not inspected",
                ].map(markdownText).join(" | ") + " |");
                if ((call.arguments || []).length) {
                    lines.push("- Named bindings: " + call.arguments.map(arg =>
                        markdownText(arg.name) + " " + arg.operator).join(", ") +
                        (call.arguments_complete ? "" : " (partial)"));
                }
            }
            lines.push("");
        }
    }
    const usageBlocks = report.files.filter(block => (block.variable_usage || []).length);
    if (usageBlocks.length) {
        lines.push("", "## SCL variable and interface usage", "",
            "Static source occurrences only; not PLC runtime execution counts.", "");
        for (const block of usageBlocks) {
            lines.push("### " + markdownText(block.name) + " — " + markdownText(block.source_file), "");
            lines.push("Flow coverage: " + markdownText(block.variable_analysis_status || "unavailable"), "");
            lines.push("| Variable | Section | Reads | Writes | Assigned on exit | Coverage |",
                "| --- | --- | --- | --- | --- | --- |");
            for (const item of block.variable_usage) {
                lines.push("| " + [
                    item.name, item.section,
                    item.reads == null ? "—" : String(item.reads),
                    item.writes == null ? "—" : String(item.writes),
                    item.assigned_on_exit == null ? "—" : item.assigned_on_exit ? "Yes" : "No",
                    item.analysis_status || "partial",
                ].map(markdownText).join(" | ") + " |");
            }
            lines.push("");
        }
    }
    lines.push("", "## Findings", "");
    if (!report.findings.length) lines.push("No findings reported.");
    for (const finding of orderedFindings(report.findings)) {
        lines.push("### [" + findingPriority(finding) + "] " + markdownText(finding.category) + " — " + markdownText(finding.severity));
        lines.push("- Source: " + markdownText(finding.source_file));
        lines.push("- Block: " + markdownText(finding.block));
        lines.push("- Location: " + markdownText(finding.location || "Not provided"));
        lines.push("- Detection: " + markdownText(finding.detection_method) + " (" + markdownText(finding.verification_status) + ")");
        lines.push("- Explanation: " + markdownText(finding.explanation));
        if (finding.suggested_fix) lines.push("- Suggested fix: " + markdownText(finding.suggested_fix));
        if (finding.evidence) lines.push("- Evidence: " + markdownText(finding.evidence));
        lines.push("");
    }
    if (report.file_warnings.length) lines.push("## Warnings", "", ...report.file_warnings.map(item => "- " + markdownText(item)), "");
    return lines.join("\n") + "\n";
}

function downloadReport(contents, fileName, type) {
    const url = URL.createObjectURL(new Blob([contents], {type}));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

function endpointText(endpoint) {
    if (endpoint.kind === "Powerrail" || endpoint.kind === "OpenCon") return endpoint.kind;
    return endpoint.kind + " " + (endpoint.uid || "?") + (endpoint.port ? "." + endpoint.port : "");
}

function renderNetworkTopology(block, parent) {
    for (const network of block.network_details || []) {
        const section = document.createElement("section");
        section.className = "review-network-topology";
        const heading = document.createElement("h4");
        heading.textContent = "Network " + network.number + " · " + (network.language || block.language)
            + " · topology only";
        section.appendChild(heading);
        const summary = document.createElement("p");
        summary.className = "hint";
        summary.textContent = (network.nodes || []).length + " recognized node(s), "
            + (network.wires || []).length + " wire(s). FlgNet "
            + (network.schema_version || "version unknown") + "; coverage: "
            + (network.coverage || "unknown") + ". Not a verified LAD/FBD logic interpretation.";
        section.appendChild(summary);
        const appendTable = (labels, data) => {
            if (!data.length) return;
            const wrapper = document.createElement("div");
            wrapper.className = "table-wrapper";
            const table = document.createElement("table");
            table.className = "management-table";
            const thead = document.createElement("thead");
            const tr = document.createElement("tr");
            for (const label of labels) {
                const th = document.createElement("th");
                th.textContent = label;
                tr.appendChild(th);
            }
            thead.appendChild(tr);
            const tbody = document.createElement("tbody");
            for (const values of data) {
                const row = document.createElement("tr");
                for (const value of values) {
                    const cell = document.createElement("td");
                    cell.textContent = String(value ?? "");
                    row.appendChild(cell);
                }
                tbody.appendChild(row);
            }
            table.append(thead, tbody);
            wrapper.appendChild(table);
            section.appendChild(wrapper);
        };
        appendTable(["UId", "Node", "Instruction / Call", "Symbol", "Scope", "Constant", "Template values", "Instance"],
            (network.nodes || []).map(node => [
                node.uid, node.kind, node.name, node.symbol, node.scope,
                [node.constant_type, node.constant_value].filter(Boolean).join(" "),
                Object.entries(node.template_values || {}).map(([k, v]) => k + "=" + v).join(", "),
                node.instance || "",
            ]));
        appendTable(["UId", "Pin", "Wire UId", "Other endpoints (unordered)"],
            (network.nodes || []).flatMap(node => (node.connections || []).map(port => [
                node.uid, port.port, port.wire_uid, (port.peers || []).join(" ; "),
            ])));
        appendTable(["Call UId", "Parameter", "Section", "Type"],
            (network.nodes || []).flatMap(node => (node.call_parameters || []).map(param => [
                node.uid, param.name, param.section, param.data_type,
            ])));
        appendTable(["Wire UId", "Listed endpoints (unordered)"],
            (network.wires || []).map(wire => [
                wire.uid, (wire.endpoints || []).map(endpointText).join(" ; "),
            ]));
        for (const warning of network.warnings || []) {
            const note = document.createElement("p");
            note.className = "hint";
            note.textContent = "Requires TIA verification: " + warning;
            section.appendChild(note);
        }
        parent.appendChild(section);
    }
}

function renderBlockCalls(block, parent) {
    if (!(block.calls || []).length) return;
    const heading = document.createElement("h4");
    heading.textContent = "Observed FB/FC calls (read-only)";
    parent.appendChild(heading);
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrapper";
    const table = document.createElement("table");
    table.className = "management-table review-block-calls";
    const header = document.createElement("tr");
    for (const label of ["Location", "Source", "Target", "Nesting", "Via instance", "Resolution", "Arguments"]) {
        const th = document.createElement("th");
        th.textContent = label;
        header.appendChild(th);
    }
    const thead = document.createElement("thead");
    thead.appendChild(header);
    const tbody = document.createElement("tbody");
    for (const call of block.calls) {
        const tr = document.createElement("tr");
        for (const value of [call.location, call.source, call.target,
            call.parent_target ? "↳ " + call.parent_target + " (depth " + call.nesting_depth + ")" : "Top level",
            call.instance || "—", call.resolution,
            call.source === "SCL" ? (call.arguments_complete ? "Parsed named bindings" : "Not fully verified") : "Not inspected"]) {
            const td = document.createElement("td");
            td.textContent = String(value ?? "");
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    wrapper.appendChild(table);
    parent.appendChild(wrapper);
    for (const call of block.calls) {
        if (!(call.arguments || []).length) continue;
        const label = document.createElement("p");
        label.className = "hint review-call-arguments";
        label.textContent = call.target + " · " + call.location + ": "
            + call.arguments.map(argument => argument.name + " " + argument.operator).join(", ")
            + (call.arguments_complete ? "" : " (partial)");
        parent.appendChild(label);
    }
}

function renderVariableUsage(block, parent) {
    if (!(block.variable_usage || []).length) return;
    const section = document.createElement("section");
    section.className = "review-variable-usage";
    const heading = document.createElement("h4");
    heading.textContent = "SCL variable and interface usage";
    section.appendChild(heading);
    const coverage = document.createElement("p");
    coverage.className = "hint";
    coverage.textContent = "Flow coverage: " + (block.variable_analysis_status || "unavailable")
        + ". Counts are static occurrences, not PLC runtime executions.";
    section.appendChild(coverage);
    const wrapper = document.createElement("div");
    wrapper.className = "table-wrapper";
    const table = document.createElement("table");
    table.className = "management-table";
    const header = document.createElement("tr");
    for (const title of ["Name", "Section", "Reads", "Writes", "Assigned on exit", "Coverage"]) {
        const th = document.createElement("th");
        th.textContent = title;
        header.appendChild(th);
    }
    const thead = document.createElement("thead");
    thead.appendChild(header);
    const tbody = document.createElement("tbody");
    for (const item of block.variable_usage) {
        const row = document.createElement("tr");
        for (const value of [
            item.name, item.section,
            item.reads == null ? "—" : item.reads,
            item.writes == null ? "—" : item.writes,
            item.assigned_on_exit == null ? "—" : item.assigned_on_exit ? "Yes" : "No",
            item.analysis_status || "partial",
        ]) {
            const cell = document.createElement("td");
            cell.textContent = String(value ?? "—");
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }
    table.append(thead, tbody);
    wrapper.appendChild(table);
    section.appendChild(wrapper);
    parent.appendChild(section);
}

async function textSha256(text) {
    const bytes = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
}

function splitSclSourceLines(source) {
    // Preserve exact original CRLF/LF for the stale-source comparison.
    return source.match(/[^\n]*\n|[^\n]+$/g) || [];
}

function setupSclProposalUi() {
    const panel = document.getElementById("review-proposal-panel");
    const select = document.getElementById("review-proposal-file");
    const start = document.getElementById("review-proposal-start");
    const end = document.getElementById("review-proposal-end");
    const before = document.getElementById("review-proposal-original");
    const replacement = document.getElementById("review-proposal-replacement");
    const guidance = document.getElementById("review-proposal-guidance");
    const previewButton = document.getElementById("review-proposal-preview");
    const diff = document.getElementById("review-proposal-diff");
    const approve = document.getElementById("review-proposal-approve");
    const download = document.getElementById("review-proposal-download");
    const status = document.getElementById("review-proposal-status");
    if (![panel, select, start, end, before, replacement, guidance,
        previewButton, diff, approve, download, status].every(Boolean)) return null;
    let sources = [];
    let preview = null;
    const activeFile = () => sources.find(file => file.name === select.value);
    const selectedRange = () => {
        const file = activeFile();
        if (!file) return null;
        const lines = splitSclSourceLines(file.content);
        const first = Number(start.value), last = Number(end.value);
        if (!Number.isInteger(first) || !Number.isInteger(last)
            || first < 1 || last < first || last > lines.length || last - first >= 20) {
            return null;
        }
        return {file, original:lines.slice(first - 1, last).join(""), first, last};
    };
    const invalidate = () => {
        preview = null;
        diff.textContent = "";
        approve.checked = false;
        approve.disabled = true;
        download.disabled = true;
    };
    const updateSource = (resetReplacement = false) => {
        invalidate();
        const range = selectedRange();
        before.textContent = range ? range.original : "Select 1–20 valid existing SCL lines.";
        previewButton.disabled = !range;
        if (resetReplacement) {
            replacement.value = range ? range.original.replace(/\r?\n$/, "") : "";
        }
        status.textContent = range
            ? "Draft only — preview the diff, then explicitly approve a new file copy."
            : "Choose a valid SCL file and line range.";
    };
    const configure = (report, payload) => {
        sources = (payload || []).filter(file =>
            /\.scl$/i.test(file.name)
            && (report?.files || []).some(block =>
                block.source_file === file.name && block.language === "SCL"
                && block.verification_status !== "failed")
            && !file.name.replaceAll("\\", "/").split("/").includes("..")
        );
        select.replaceChildren(...sources.map(file => {
            const option = document.createElement("option");
            option.value = file.name;
            option.textContent = file.name;
            return option;
        }));
        select.disabled = !sources.length;
        panel.hidden = !sources.length;
        panel.open = false;
        start.value = "1";
        end.value = "1";
        guidance.textContent = "Proposed replacement is edited by you. AI suggestions are guidance only, never executable patches.";
        updateSource(true);
    };
    const prepare = finding => {
        const file = sources.find(source => source.name === finding.source_file);
        if (!file) return;
        select.value = file.name;
        const number = /^line ([1-9]\d*)$/i.exec(finding.location || "");
        const lines = splitSclSourceLines(file.content);
        const target = number ? Math.min(Number(number[1]), lines.length) : 1;
        start.value = String(target);
        end.value = String(target);
        guidance.textContent = "Finding: " + finding.category + ". "
            + (finding.suggested_fix || finding.explanation)
            + " (Guidance only — supply the replacement code yourself.)";
        updateSource(true);
        panel.hidden = false;
        panel.open = true;
        panel.scrollIntoView({block:"nearest", behavior:"instant"});
    };
    select.addEventListener("change", () => {
        start.value = "1";
        end.value = "1";
        updateSource(true);
    });
    start.addEventListener("input", () => updateSource(true));
    end.addEventListener("input", () => updateSource(true));
    replacement.addEventListener("input", invalidate);
    approve.addEventListener("change", () => {
        download.disabled = !preview || !approve.checked;
    });
    previewButton.addEventListener("click", async () => {
        const range = selectedRange();
        if (!range) return;
        invalidate();
        previewButton.disabled = true;
        status.textContent = "Checking original source and preparing an in-memory diff…";
        status.classList.remove("error");
        try {
            const expected_sha256 = await textSha256(range.file.content);
            const candidate = await postJson("/api/v1/code-review/preview-scl-change", {
                file:range.file,
                expected_sha256,
                start_line:range.first,
                end_line:range.last,
                expected_original:range.original,
                replacement_text:replacement.value,
            });
            if (candidate.preview_only !== true || candidate.requires_explicit_approval !== true
                || candidate.original_sha256 !== expected_sha256) {
                throw new Error("Untrusted patch preview response.");
            }
            preview = candidate;
            diff.textContent = candidate.unified_diff;
            approve.disabled = false;
            status.textContent = "Preview ready — uncompiled. "
                + (candidate.validation_warnings || []).join(" ")
                + " Approve only after inspecting every changed line.";
        } catch (error) {
            status.textContent = "Preview rejected: " + error.message;
            status.classList.add("error");
        } finally {
            previewButton.disabled = !selectedRange();
        }
    });
    download.addEventListener("click", () => {
        if (!preview || !approve.checked || download.disabled) return;
        downloadReport(preview.proposed_content, preview.output_filename,
            "text/plain;charset=utf-8");
        status.textContent = "Downloaded a reviewed SCL copy only. "
            + "The original source and TIA project were not modified.";
        approve.checked = false;
        download.disabled = true;
    });
    configure(null, []);
    return {configure, prepare};
}

function renderReport(report, results, prepareProposal = null) {
    // Preserve selected filters on refresh after a local AI enrichment run.
    const chosen = Object.fromEntries(["priority", "severity", "method", "file", "query"].map(key => [
        key, results.querySelector("#review-filter-" + key)?.value || "",
    ]));
    results.replaceChildren();
    renderProjectSummary(report, results);
    const blocks = document.createElement("details");
    blocks.className = "review-block-details";
    const heading = document.createElement("summary");
    heading.textContent = "Parsed block details (" + report.files.length + ")";
    blocks.appendChild(heading);
    for (const block of report.files) {
        const details = document.createElement("details");
        const title = document.createElement("summary");
        title.textContent = block.name + " · " + block.block_type + " · " + block.language;
        const body = document.createElement("pre");
        body.textContent = JSON.stringify({
            declarations:block.declarations, dependencies:block.dependencies,
            networks:block.networks, warnings:block.parsing_warnings,
            verification:block.verification_status,
        }, null, 2);
        details.append(title, body);
        renderNetworkTopology(block, details);
        renderBlockCalls(block, details);
        renderVariableUsage(block, details);
        blocks.appendChild(details);
    }
    results.appendChild(blocks);
    const findingsSection = document.createElement("section");
    findingsSection.className = "review-findings";
    const title = document.createElement("h3");
    title.textContent = "Findings by priority";
    findingsSection.appendChild(title);
    const filters = document.createElement("div");
    filters.className = "review-filter-controls";
    const selectors = {};
    const field = (key, title, entries, input = false) => {
        const label = document.createElement("label");
        label.textContent = title;
        const element = document.createElement(input ? "input" : "select");
        element.id = "review-filter-" + key;
        element.setAttribute("aria-label", title);
        if (input) {
            element.type = "search";
            element.placeholder = "Search finding text";
        } else {
            for (const [value, name] of entries) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = name;
                element.appendChild(option);
            }
        }
        element.value = chosen[key] || "";
        if (!input && element.value !== (chosen[key] || "")) element.value = "";
        label.appendChild(element);
        filters.appendChild(label);
        selectors[key] = element;
    };
    field("priority", "Priority", [["", "All priorities"],
        ...PRIORITY_ORDER.map(p => [p, p])]);
    field("severity", "Severity", [["", "All severities"],
        ...["critical", "error", "warning", "info"].map(v => [v, v])]);
    field("method", "Detection", [["", "All methods"], ["rule", "Rule"], ["AI", "AI"]]);
    field("file", "Source file", [["", "All files"],
        ...[...new Set([
            ...report.files.map(b => b.source_file),
            ...report.findings.map(f => f.source_file),
        ])].sort().map(name => [name, name])]);
    field("query", "Search", [], true);
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "secondary-button";
    reset.textContent = "Clear filters";
    filters.appendChild(reset);
    findingsSection.appendChild(filters);
    const counts = document.createElement("p");
    counts.className = "hint review-visible-count";
    counts.setAttribute("aria-live", "polite");
    findingsSection.appendChild(counts);
    const list = document.createElement("div");
    list.className = "review-findings-list";
    findingsSection.appendChild(list);
    const sorted = orderedFindings(report.findings);
    const refresh = () => {
        const matching = sorted.filter(finding => {
            if (selectors.priority.value && findingPriority(finding) !== selectors.priority.value) return false;
            if (selectors.severity.value && finding.severity !== selectors.severity.value) return false;
            if (selectors.method.value && finding.detection_method !== selectors.method.value) return false;
            if (selectors.file.value && finding.source_file !== selectors.file.value) return false;
            const needle = selectors.query.value.trim().toLocaleLowerCase();
            return !needle || [
                finding.source_file, finding.block, finding.location,
                finding.category, finding.explanation, finding.evidence,
                finding.suggested_fix, finding.verification_status,
            ].some(value => String(value || "").toLocaleLowerCase().includes(needle));
        });
        counts.textContent = "Showing " + matching.length + " of " + report.findings.length
            + " findings. JSON/Markdown exports always contain the full report.";
        const rows = matching.map(finding => {
            const item = document.createElement("article");
            const priority = findingPriority(finding);
            item.className = "review-finding-row";
            item.dataset.priority = priority;
            item.dataset.method = finding.detection_method || "rule";
            const heading = document.createElement("strong");
            heading.textContent = "[" + priority + " · " + finding.severity + "] "
                + finding.category;
            item.appendChild(heading);
            const context = document.createElement("p");
            context.className = "hint";
            context.textContent = finding.source_file + " · "
                + (finding.block || "Unknown block")
                + (finding.location ? " · " + finding.location : "")
                + " · " + finding.detection_method
                + " · " + finding.verification_status;
            item.appendChild(context);
            const description = document.createElement("p");
            description.textContent = finding.explanation;
            item.appendChild(description);
            if (prepareProposal && /\.scl$/i.test(finding.source_file)
                && /^line [1-9]\d*$/i.test(finding.location || "")) {
                const prepare = document.createElement("button");
                prepare.type = "button";
                prepare.className = "secondary-button review-prepare-change";
                prepare.textContent = "Prepare SCL change";
                prepare.addEventListener("click", () => prepareProposal(finding));
                item.appendChild(prepare);
            }
            if (finding.suggested_fix) {
                const fix = document.createElement("p");
                fix.className = "hint";
                fix.textContent = "Suggested check: " + finding.suggested_fix;
                item.appendChild(fix);
            }
            return item;
        });
        if (!rows.length) {
            const empty = document.createElement("p");
            empty.className = "hint";
            empty.textContent = report.findings.length
                ? "No findings match these filters." : "No findings reported.";
            rows.push(empty);
        }
        list.replaceChildren(...rows);
    };
    Object.values(selectors).forEach(select => select.addEventListener(
        select.type === "search" ? "input" : "change", refresh,
    ));
    reset.addEventListener("click", () => {
        Object.values(selectors).forEach(select => { select.value = ""; });
        refresh();
    });
    refresh();
    results.appendChild(findingsSection);
    if (report.file_warnings.length) {
        const warnings = document.createElement("details");
        warnings.className = "review-file-warnings";
        const heading = document.createElement("summary");
        heading.textContent = "Review warnings (" + report.file_warnings.length + ")";
        const list = document.createElement("ul");
        for (const text of report.file_warnings) {
            const item = document.createElement("li");
            item.textContent = text;
            list.appendChild(item);
        }
        warnings.append(heading, list);
        results.appendChild(warnings);
    }
}

export function initCodeReviewUi() {
    const files = document.getElementById("review-files"), folder = document.getElementById("review-folder");
    const run = document.getElementById("review-analyze"), status = document.getElementById("review-status");
    const list = document.getElementById("review-files-list"), results = document.getElementById("review-results");
    const download = document.getElementById("review-download"), markdown = document.getElementById("review-download-markdown"), ai = document.getElementById("review-ai");
    const model = document.getElementById("review-ollama-model");
    const blockSelect = document.getElementById("review-ai-block");
    const tiaRun = document.getElementById("review-tia-analyze"), tiaStatus = document.getElementById("review-tia-status");
    if (!files || !folder || !run || !status || !list || !results || !download || !markdown || !ai || !model || !blockSelect || !tiaRun || !tiaStatus) return;
    let selected = [], report = null, payload = [];
    const proposals = setupSclProposalUi();
    const refresh = () => {
        selected = [...files.files, ...folder.files].filter(file => /\.(scl|xml)$/i.test(file.name));
        list.replaceChildren(...selected.map(file => {
            const item = document.createElement("li");
            item.textContent = file.webkitRelativePath || file.name;
            return item;
        }));
        status.textContent = selected.length ? selected.length + " supported file(s) selected." : "Select PLC source files or a folder.";
        ai.disabled = true;
        blockSelect.replaceChildren();
        blockSelect.disabled = true;
        report = null;
        payload = [];
        results.replaceChildren();
        download.disabled = true;
        markdown.disabled = true;
        proposals?.configure(null, []);
    };
    const populateAiBlocks = () => {
        blockSelect.replaceChildren(...(report?.files || []).filter(block =>
            block.language === "SCL" && /\.scl$/i.test(block.source_file)
            && block.verification_status !== "failed"
        ).map(block => {
            const option = document.createElement("option");
            option.value = block.name;
            option.textContent = block.name + " — " + block.source_file;
            return option;
        }));
        blockSelect.disabled = !blockSelect.options.length;
        ai.disabled = blockSelect.disabled;
    };
    const readPayload = () => Promise.all(selected.map(async file => ({
        name:file.webkitRelativePath || file.name, content:await file.text(),
    })));
    files.addEventListener("change", refresh);
    folder.addEventListener("change", refresh);
    run.addEventListener("click", async () => {
        if (!selected.length) return;
        run.disabled = true;
        status.classList.remove("error");
        status.textContent = "Reading and analyzing files locally…";
        try {
            payload = await readPayload();
            report = await postJson("/api/v1/code-review/analyze-files", payload);
            renderReport(report, results, finding => proposals?.prepare(finding));
            status.textContent = "Read-only deterministic analysis complete. You can optionally run local Ollama review.";
            download.disabled = false;
            markdown.disabled = false;
            populateAiBlocks();
            proposals?.configure(report, payload);
        } catch (error) {
            status.textContent = "Analysis failed: " + error.message;
            status.classList.add("error");
        } finally {
            run.disabled = false;
        }
    });
    ai.addEventListener("click", async () => {
        if (!payload.length || !blockSelect.value) return;
        ai.disabled = true;
        status.classList.remove("error");
        status.textContent = "Reviewing one selected SCL block with local Ollama (short excerpt, bounded request)…";
        try {
            report = await postJson("/api/v1/code-review/ollama", {files:payload, model:model.value.trim() || null, block_names:[blockSelect.value]});
            renderReport(report, results, finding => proposals?.prepare(finding));
            const aiStatus = report.ai_review_status || "complete";
            status.textContent = aiStatus === "unavailable"
                ? "Ollama did not return usable JSON. Deterministic findings remain available; see report warnings."
                : aiStatus === "partial"
                ? "AI review partially completed. Some Ollama responses were invalid; see report warnings."
                : "Read-only AI review complete. AI findings are unverified suggestions.";
            status.classList.toggle("error", aiStatus !== "complete");
        } catch (error) {
            status.textContent = "Local AI review failed: " + error.message + ". Deterministic results remain available.";
            status.classList.add("error");
        } finally {
            ai.disabled = blockSelect.disabled;
        }
    });
    tiaRun.addEventListener("click", async () => {
        const snapshots = [...projectConfig.fbs, ...projectConfig.fcs].filter(block =>
            block?.source_mode === "tia_read_only" && typeof block.source_xml === "string" && block.source_xml.trim());
        if (!snapshots.length) {
            tiaStatus.textContent = "No read-only FB/FC snapshots with original TIA XML are loaded.";
            tiaStatus.classList.add("error");
            return;
        }
        tiaRun.disabled = true;
        tiaStatus.classList.remove("error");
        tiaStatus.textContent = "Analyzing " + snapshots.length + " locally loaded TIA block snapshot(s)…";
        try {
            payload = snapshots.map(block => ({
                name:"TIA snapshot/" + block.name + ".xml", content:block.source_xml,
            }));
            report = await postJson("/api/v1/code-review/analyze-files", payload);
            renderReport(report, results, finding => proposals?.prepare(finding));
            status.textContent = "Read-only deterministic analysis of loaded TIA snapshots complete.";
            tiaStatus.textContent = snapshots.length + " loaded TIA snapshot(s) analyzed. TIA Portal was not contacted.";
            download.disabled = false;
            markdown.disabled = false;
            populateAiBlocks();
            proposals?.configure(report, payload);
        } catch (error) {
            tiaStatus.textContent = "TIA snapshot analysis failed: " + error.message;
            tiaStatus.classList.add("error");
        } finally {
            tiaRun.disabled = false;
        }
    });
    download.addEventListener("click", () => {
        if (!report) return;
        downloadReport(JSON.stringify(report, null, 2), "plc-code-review.json", "application/json");
    });
    markdown.addEventListener("click", () => {
        if (report) downloadReport(reportMarkdown(report), "plc-code-review.md", "text/markdown;charset=utf-8");
    });
}
