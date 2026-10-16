// Offline declaration analysis; the source data is copied from the active profile.
import {projectConfig} from "./state.js";
import {postJson} from "./api.js";

function textCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value || "—";
    return cell;
}

export function initProgramDependencies() {
    const button = document.getElementById("program-dependencies-run");
    const status = document.getElementById("program-dependencies-status");
    const results = document.getElementById("program-dependencies-results");
    if (!button || !status || !results) return;
    let busy = false;
    button.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        button.disabled = true;
        results.replaceChildren();
        status.textContent = "Analyzing local declaration graph…";
        const snapshot = JSON.stringify(projectConfig);
        try {
            const report = await postJson("/api/v1/program-dependencies", JSON.parse(snapshot));
            if (JSON.stringify(projectConfig) !== snapshot)
                throw Error("Local project changed during analysis. Run it again.");
            const summary = document.createElement("p");
            summary.className = "hint";
            summary.textContent = report.nodes.length + " object(s), "
                + report.edges.length + " declared relation(s), "
                + report.unresolved.length + " unresolved item(s). Read-only; no TIA write.";
            results.appendChild(summary);
            if (report.edges.length) {
                const wrapper = document.createElement("div");
                wrapper.className = "table-wrapper";
                const table = document.createElement("table");
                table.className = "management-table program-dependency-table";
                const thead = document.createElement("thead");
                const head = document.createElement("tr");
                for (const label of ["Dependency", "Dependent", "Declaration", "Relation", "Verification"]) {
                    const th = document.createElement("th");
                    th.textContent = label;
                    head.appendChild(th);
                }
                thead.appendChild(head);
                table.appendChild(thead);
                const body = document.createElement("tbody");
                for (const edge of report.edges) {
                    const row = document.createElement("tr");
                    for (const value of [edge.dependency, edge.dependent, edge.member, edge.relation, edge.status])
                        row.appendChild(textCell(value));
                    body.appendChild(row);
                }
                table.appendChild(body);
                wrapper.appendChild(table);
                results.appendChild(wrapper);
            }
            if (report.unresolved.length) {
                const details = document.createElement("details");
                const title = document.createElement("summary");
                title.textContent = "Unverified / unresolved (" + report.unresolved.length + ")";
                const wrapper = document.createElement("div");
                wrapper.className = "table-wrapper";
                const table = document.createElement("table");
                table.className = "management-table program-dependency-table";
                const thead = document.createElement("thead");
                const head = document.createElement("tr");
                for (const label of ["Object", "Declaration", "Issue", "Details"]) {
                    const th = document.createElement("th");
                    th.textContent = label;
                    head.appendChild(th);
                }
                thead.appendChild(head);
                table.appendChild(thead);
                const body = document.createElement("tbody");
                for (const entry of report.unresolved) {
                    const row = document.createElement("tr");
                    for (const value of [entry.object, entry.member, entry.category, entry.reason])
                        row.appendChild(textCell(value));
                    body.appendChild(row);
                }
                table.appendChild(body);
                wrapper.appendChild(table);
                details.append(title, wrapper);
                results.appendChild(details);
            }
            const ordered = document.createElement("p");
            ordered.className = "hint";
            ordered.textContent = "Local dependency order: "
                + (report.order.map(item => item.kind + " " + item.name).join(" → ") || "none");
            results.appendChild(ordered);
            status.textContent = "Offline analysis complete. Not verified against TIA compilation.";
        } catch (error) {
            status.textContent = "Dependency analysis failed: " + error.message;
        } finally {
            busy = false;
            button.disabled = false;
        }
    });
}
