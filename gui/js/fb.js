import {projectConfig, saveProjectConfig} from "./state.js";
import {createButton} from "./ui.js";
import {createMemberTree} from "./member-editor.js";
import {getSystemInstanceTypes} from "./plc-types.js";

const SECTIONS = ["Input", "Output", "InOut", "Static", "Temp", "Constant"];
const sectionOpenState = new Map();

function stateKey(fb, section) {
    return "fb-analyzer:" + fb.name.toLocaleLowerCase() + ":" + section;
}

function rememberedDetails(fb, section, label) {
    const details = document.createElement("details");
    const key = stateKey(fb, section);
    details.dataset.checkpoint = key;
    details.open = sectionOpenState.get(key) === true;
    details.addEventListener("toggle", () => sectionOpenState.set(key, details.open));
    const summary = document.createElement("summary");
    summary.textContent = label;
    details.appendChild(summary);
    return details;
}

function dependencySummary(fb) {
    const dependencies = (fb.static?.members || [])
        .map(member => ({member, target: projectConfig.fbs.find(candidate =>
            candidate.name.toLocaleLowerCase() === String(member.data_type || "").toLocaleLowerCase())}))
        .filter(item => item.target);
    if (!dependencies.length) return null;
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "Multi-instance dependencies: " + dependencies.map(({member, target}) =>
        member.name + " → " + target.name + (target.interface_verified === false ? " (Unverified)" : ""))
        .join(", ") + ".";
    return note;
}

function snapshotStatus(fb) {
    const note = document.createElement("p");
    note.className = "hint";
    if (fb.source_mode === "tia_read_only") {
        note.textContent = fb.interface_verified === false
            ? "TIA snapshot — Unverified interface. Declaration changes stay local; dependency reuse and export are blocked."
            : "TIA snapshot — edit declarations locally. The original program XML is preserved and TIA Portal is never written.";
    } else {
        note.textContent = "Legacy local declaration — read-only and not verified against TIA. It remains visible for migration, but cannot confirm dependencies or be exported as an FB.";
    }
    return note;
}

function markDraft(fb) {
    fb.declaration_draft = true;
    saveProjectConfig();
}

function resetDraft(fb, refresh) {
    if (!fb.original_interface) return;
    for (const section of SECTIONS) {
        const key = section.toLowerCase();
        fb[key] = structuredClone(fb.original_interface[key] || {name: section, members: []});
    }
    fb.declaration_draft = false;
    saveProjectConfig();
    refresh();
}

export function renderFunctionBlocks(host, refresh) {
    host.replaceChildren();
    if (!projectConfig.fbs.length) {
        const empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "No Function Block snapshots are loaded. Read blocks from the Active PLC to analyze their interfaces.";
        host.appendChild(empty);
        return;
    }
    for (const fb of projectConfig.fbs) {
        const card = document.createElement("article");
        card.className = "card";
        const title = document.createElement("h3");
        title.textContent = fb.name + " (" + (fb.language || "Unknown") + ")"
            + (fb.number === null || fb.number === undefined ? "" : " — FB " + fb.number);
        card.append(title, snapshotStatus(fb));
        if (fb.declaration_draft) {
            const draft = document.createElement("p");
            draft.className = "hint";
            draft.textContent = "Local declaration draft — not applied to TIA Portal.";
            card.appendChild(draft);
        }
        const dependencies = dependencySummary(fb);
        if (dependencies) card.appendChild(dependencies);
        for (const section of SECTIONS) {
            const key = section.toLowerCase();
            const members = fb[key]?.members || [];
            const details = rememberedDetails(fb, "section:" + key, section + " (" + members.length + ")");
            details.appendChild(createMemberTree({
                prefix: "fb-" + fb.name + "-" + key,
                members,
                isDb: false,
                allowSystemInstances: section === "Static",
                allowFbInstances: section === "Static",
                onChange: next => {
                    fb[key] = {name: section, members: next};
                    markDraft(fb);
                    refresh();
                    return true;
                },
            }));
            if (section === "Static") {
                const system = document.createElement("select");
                system.append(new Option("Add IEC instance…", ""));
                for (const type of getSystemInstanceTypes(projectConfig.plc_family)) {
                    system.append(new Option(type.name, type.name));
                }
                details.append(system, createButton("Add IEC instance", () => {
                    const type = system.value;
                    if (!type) return;
                    const base = type.replace(/[^A-Za-z0-9]/g, "_");
                    let name = base, index = 2;
                    while ((fb.static?.members || []).some(member => member.name.toLowerCase() === name.toLowerCase())) {
                        name = base + "_" + index++;
                    }
                    fb.static ??= {name: "Static", members: []};
                    fb.static.members.push({name, data_type: type, system_instance: true, comment: null});
                    markDraft(fb);
                    refresh();
                }));
            }
            card.appendChild(details);
        }
        if (fb.source_xml) {
            const source = rememberedDetails(fb, "source", "Original TIA " + fb.language + " source XML (read-only)");
            const sourceText = document.createElement("pre");
            sourceText.className = "device-config-preview";
            sourceText.textContent = fb.source_xml;
            source.appendChild(sourceText);
            card.appendChild(source);
        }
        if (fb.declaration_draft && fb.original_interface) {
            card.appendChild(createButton("Discard local declaration draft", () => resetDraft(fb, refresh)));
        }
        card.appendChild(createButton("Remove local snapshot", () => {
            if (!confirm('Remove the local snapshot "' + fb.name + '"? TIA Portal will not be changed.')) return;
            projectConfig.fbs.splice(projectConfig.fbs.indexOf(fb), 1);
            saveProjectConfig();
            refresh();
        }));
        host.appendChild(card);
    }
}
