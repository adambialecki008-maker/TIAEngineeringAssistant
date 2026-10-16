import {projectConfig, saveProjectConfig} from "./state.js";
import {createButton} from "./ui.js";
import {createMemberTree} from "./member-editor.js";
import {getSystemInstanceTypes} from "./plc-types.js";
import {programLanguage, programHeading, programMetadata, programDeclarations, programSection, programActions} from "./program_view.js";

const SECTIONS = ["Input", "Output", "InOut", "Static", "Temp", "Constant"];
const sectionOpenState = new Map();

function dependencySummary(fb) {
    const dependencies = (fb.static?.members || [])
        .map(member => ({member, target: projectConfig.fbs.find(candidate =>
            candidate.name.toLocaleLowerCase() === String(member.data_type || "").toLocaleLowerCase())}))
        .filter(item => item.target);
    const udtNames = new Set(projectConfig.udts.map(udt => String(udt.name).toLocaleLowerCase()));
    const udts = [];
    const visit = members => members.forEach(member => {
        if (udtNames.has(String(member.data_type || "").toLocaleLowerCase())) udts.push(member.name + " → " + member.data_type);
        if (member.struct_members) visit(member.struct_members);
    });
    [fb.input, fb.output, fb.inout, fb.static, fb.temp, fb.constant].forEach(section => visit(section?.members || []));
    if (!dependencies.length && !udts.length) return null;
    const note = document.createElement("p");
    note.className = "hint";
    const descriptions = [];
    if (dependencies.length) descriptions.push("Multi-instance: " + dependencies.map(({member, target}) =>
        member.name + " → " + target.name + (target.interface_verified === false ? " (Unverified)" : "")).join(", "));
    if (udts.length) descriptions.push("UDT: " + udts.join(", "));
    note.textContent = descriptions.join(". ") + ".";
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
        card.className = "card program-block-card";
        card.appendChild(programHeading(fb, "FB"));
        card.appendChild(programMetadata(fb, "FB", dependencySummary(fb)));
        const declarations = programDeclarations();
        for (const section of SECTIONS) {
            const key = section.toLowerCase();
            const members = fb[key]?.members || [];
            const details = programSection(fb, "FB", section, members.length, sectionOpenState);
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
                const iecControls = document.createElement("div");
                iecControls.className = "program-iec-controls";
                iecControls.append(system, createButton("Add IEC instance", () => {
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
                details.appendChild(iecControls);
            }
            declarations.appendChild(details);
        }
        card.appendChild(declarations);
        if (fb.source_xml) {
            const source = document.createElement("details");
            source.className = "program-source-details";
            const summary = document.createElement("summary");
            summary.textContent = "Original " + programLanguage(fb.language) + " XML (read-only)";
            source.appendChild(summary);
            const sourceText = document.createElement("pre");
            sourceText.className = "device-config-preview";
            sourceText.textContent = fb.source_xml;
            source.appendChild(sourceText);
            card.appendChild(source);
        }
        const actions = programActions();
        if (fb.declaration_draft && fb.original_interface) {
            actions.appendChild(createButton("Discard draft", () => resetDraft(fb, refresh)));
        }
        actions.appendChild(createButton("Remove snapshot", () => {
            if (!confirm('Remove the local snapshot "' + fb.name + '"? TIA Portal will not be changed.')) return;
            projectConfig.fbs.splice(projectConfig.fbs.indexOf(fb), 1);
            saveProjectConfig();
            refresh();
        }));
        card.appendChild(actions);
        host.appendChild(card);
    }
}
