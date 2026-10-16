import {projectConfig, saveProjectConfig} from "./state.js";
import {createButton} from "./ui.js";
import {createMemberTree} from "./member-editor.js";

const SECTIONS = ["Input", "Output", "InOut", "Temp", "Constant"];
const sectionOpenState = new Map();

function detailsFor(fc, section, label) {
    const details = document.createElement("details");
    const key = "fc-analyzer:" + fc.name.toLocaleLowerCase() + ":" + section;
    details.open = sectionOpenState.get(key) === true;
    details.addEventListener("toggle", () => sectionOpenState.set(key, details.open));
    const summary = document.createElement("summary");
    summary.textContent = label;
    details.appendChild(summary);
    return details;
}

function markDraft(fc) {
    fc.declaration_draft = true;
    saveProjectConfig();
}

export function renderFunctions(host, refresh) {
    host.replaceChildren();
    if (!projectConfig.fcs.length) {
        const empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "No Function snapshots are loaded. Read FCs from the Active PLC to analyze or prepare declaration drafts.";
        host.appendChild(empty);
        return;
    }
    for (const fc of projectConfig.fcs) {
        const card = document.createElement("article");
        card.className = "card";
        const title = document.createElement("h3");
        title.textContent = fc.name + " (" + (fc.language || "Unknown") + ")"
            + (fc.number === null || fc.number === undefined ? "" : " — FC " + fc.number);
        const note = document.createElement("p");
        note.className = "hint";
        note.textContent = fc.interface_verified === false
            ? "TIA FC snapshot — Unverified interface. Declaration changes stay local and dependency reuse is blocked."
            : "TIA FC snapshot — edit declarations locally. Program logic remains preserved XML and TIA Portal is never written.";
        card.append(title, note);
        if (fc.declaration_draft) {
            const draft = document.createElement("p");
            draft.className = "hint";
            draft.textContent = "Local declaration draft — not applied to TIA Portal.";
            card.appendChild(draft);
        }
        for (const section of SECTIONS) {
            const key = section.toLowerCase();
            const members = fc[key]?.members || [];
            const details = detailsFor(fc, key, section + " (" + members.length + ")");
            details.appendChild(createMemberTree({
                prefix: "fc-" + fc.name + "-" + key, members, isDb: false,
                onChange: next => {
                    fc[key] = {name: section, members: next};
                    markDraft(fc);
                    refresh();
                    return true;
                },
            }));
            card.appendChild(details);
        }
        if (fc.source_xml) {
            const source = detailsFor(fc, "source", "Original TIA " + fc.language + " source XML (read-only)");
            const code = document.createElement("pre");
            code.className = "device-config-preview";
            code.textContent = fc.source_xml;
            source.appendChild(code);
            card.appendChild(source);
        }
        if (fc.declaration_draft && fc.original_interface) {
            card.appendChild(createButton("Discard local declaration draft", () => {
                for (const section of SECTIONS) {
                    const key = section.toLowerCase();
                    fc[key] = structuredClone(fc.original_interface[key] || {name: section, members: []});
                }
                fc.declaration_draft = false;
                saveProjectConfig();
                refresh();
            }));
        }
        card.appendChild(createButton("Remove local snapshot", () => {
            if (!confirm('Remove the local snapshot "' + fc.name + '"? TIA Portal will not be changed.')) return;
            projectConfig.fcs.splice(projectConfig.fcs.indexOf(fc), 1);
            saveProjectConfig();
            refresh();
        }));
        host.appendChild(card);
    }
}
