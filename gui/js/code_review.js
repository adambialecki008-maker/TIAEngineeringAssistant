import {postJson} from "./api.js";
import {projectConfig} from "./state.js";

function markdownText(value) {
    return String(value || "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function reportMarkdown(report) {
    const lines = ["# PLC Code Review", "", "Read-only local analysis report.", ""];
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
                    + "; explicit wires: " + (network.wires || []).length + ".", "");
                for (const node of network.nodes || []) {
                    lines.push("- Node " + markdownText(node.uid) + ": " + markdownText(node.kind)
                        + " " + markdownText(node.name || node.symbol) +
                        (node.scope ? " (" + markdownText(node.scope) + ")" : ""));
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
    lines.push("", "## Findings", "");
    if (!report.findings.length) lines.push("No findings reported.");
    for (const finding of report.findings) {
        lines.push("### " + markdownText(finding.category) + " — " + markdownText(finding.severity));
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
            + (network.wires || []).length + " wire(s). Not a verified LAD/FBD logic interpretation.";
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
        appendTable(["UId", "Node", "Name", "Symbol", "Scope"],
            (network.nodes || []).map(node => [
                node.uid, node.kind, node.name, node.symbol, node.scope,
            ]));
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

function renderReport(report, results) {
    results.replaceChildren();
    const summary = document.createElement("p");
    summary.className = "hint";
    const aiCount = report.findings.filter(item => item.detection_method === "AI").length;
    summary.textContent = report.files.length + " parsed file(s), " + report.findings.length
        + " finding(s)" + (aiCount ? ", including " + aiCount + " unverified AI suggestion(s)." : ".");
    results.appendChild(summary);
    for (const block of report.files) {
        const details = document.createElement("details");
        const title = document.createElement("summary");
        title.textContent = block.name + " · " + block.block_type + " · " + block.language;
        const body = document.createElement("pre");
        body.textContent = JSON.stringify({declarations:block.declarations, dependencies:block.dependencies, networks:block.networks, warnings:block.parsing_warnings, verification:block.verification_status}, null, 2);
        details.append(title, body);
        renderNetworkTopology(block, details);
        results.appendChild(details);
    }
    for (const finding of report.findings) {
        const item = document.createElement("p");
        item.className = "status-box " + (finding.detection_method === "AI" ? "warning" : "error");
        const confidence = finding.confidence == null ? "" : " (confidence " + finding.confidence + ")";
        item.textContent = "[" + finding.detection_method + "/" + finding.severity + "] "
            + (finding.block || finding.source_file) + " " + finding.location + ": "
            + finding.category + " — " + finding.explanation + confidence;
        results.appendChild(item);
    }
    if (report.file_warnings.length) {
        const warning = document.createElement("p");
        warning.className = "hint";
        warning.textContent = report.file_warnings.join(" ");
        results.appendChild(warning);
    }
}

export function initCodeReviewUi() {
    const files = document.getElementById("review-files"), folder = document.getElementById("review-folder");
    const run = document.getElementById("review-analyze"), status = document.getElementById("review-status");
    const list = document.getElementById("review-files-list"), results = document.getElementById("review-results");
    const download = document.getElementById("review-download"), markdown = document.getElementById("review-download-markdown"), ai = document.getElementById("review-ai");
    const model = document.getElementById("review-ollama-model");
    const tiaRun = document.getElementById("review-tia-analyze"), tiaStatus = document.getElementById("review-tia-status");
    if (!files || !folder || !run || !status || !list || !results || !download || !markdown || !ai || !model || !tiaRun || !tiaStatus) return;
    let selected = [], report = null, payload = [];
    const refresh = () => {
        selected = [...files.files, ...folder.files].filter(file => /\.(scl|xml)$/i.test(file.name));
        list.replaceChildren(...selected.map(file => {
            const item = document.createElement("li");
            item.textContent = file.webkitRelativePath || file.name;
            return item;
        }));
        status.textContent = selected.length ? selected.length + " supported file(s) selected." : "Select PLC source files or a folder.";
        ai.disabled = true;
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
            renderReport(report, results);
            status.textContent = "Read-only deterministic analysis complete. You can optionally run local Ollama review.";
            download.disabled = false;
            markdown.disabled = false;
            ai.disabled = false;
        } catch (error) {
            status.textContent = "Analysis failed: " + error.message;
            status.classList.add("error");
        } finally {
            run.disabled = false;
        }
    });
    ai.addEventListener("click", async () => {
        if (!payload.length) return;
        ai.disabled = true;
        status.classList.remove("error");
        status.textContent = "Requesting unverified suggestions from local Ollama…";
        try {
            report = await postJson("/api/v1/code-review/ollama", {files:payload, model:model.value.trim() || null});
            renderReport(report, results);
            status.textContent = "Read-only AI review complete. AI findings are unverified suggestions.";
        } catch (error) {
            status.textContent = "Local AI review failed: " + error.message + ". Deterministic results remain available.";
            status.classList.add("error");
        } finally {
            ai.disabled = false;
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
            renderReport(report, results);
            status.textContent = "Read-only deterministic analysis of loaded TIA snapshots complete.";
            tiaStatus.textContent = snapshots.length + " loaded TIA snapshot(s) analyzed. TIA Portal was not contacted.";
            download.disabled = false;
            markdown.disabled = false;
            ai.disabled = false;
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
