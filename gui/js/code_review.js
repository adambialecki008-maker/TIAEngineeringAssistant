import {postJson} from "./api.js";
import {projectConfig} from "./state.js";

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
    const download = document.getElementById("review-download"), ai = document.getElementById("review-ai");
    const model = document.getElementById("review-ollama-model");
    const tiaRun = document.getElementById("review-tia-analyze"), tiaStatus = document.getElementById("review-tia-status");
    if (!files || !folder || !run || !status || !list || !results || !download || !ai || !model || !tiaRun || !tiaStatus) return;
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
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type:"application/json"}));
        const link = document.createElement("a");
        link.href = url;
        link.download = "plc-code-review.json";
        link.click();
        URL.revokeObjectURL(url);
    });
}
