import {projectConfig, saveProjectConfig} from "./state.js";
import {createButton} from "./ui.js";
import {createMemberTree} from "./member-editor.js";
import {findSectionNameConflict} from "./program_creation.js";
import {programLanguage, programBlockDisclosure, programMetadata, programDeclarations, programSection, programActions} from "./program_view.js";

const SECTIONS = ["Input", "Output", "InOut", "Temp", "Constant"];
const sectionOpenState = new Map();
const blockOpenState = new Map();

function markDraft(fc) {
    fc.declaration_draft = true;
    saveProjectConfig();
}

function dependencySummary(fc) {
    const memberType = member => String(member.data_type || "").toLocaleLowerCase() === "array"
        ? member.array_element_type : member.data_type;
    const udtNames = new Set(projectConfig.udts.map(udt => String(udt.name).toLocaleLowerCase()));
    const fbNames = new Set(projectConfig.fbs.map(fb => String(fb.name).toLocaleLowerCase()));
    const udts = [], invalid = [];
    const visit = (members, parent = "") => members.forEach(member => {
        const path = parent ? parent + "." + member.name : member.name;
        const typeName = memberType(member);
        const type = String(typeName || "").toLocaleLowerCase();
        if (udtNames.has(type)) udts.push(path + " → " + typeName);
        if (fbNames.has(type)) invalid.push(path + " → " + typeName);
        if (member.struct_members) visit(member.struct_members, path);
    });
    [fc.input, fc.output, fc.inout, fc.temp, fc.constant].forEach(section => visit(section?.members || []));
    if (!udts.length && !invalid.length) return null;
    const note = document.createElement("p");
    note.className = "hint";
    const messages = [];
    if (udts.length) messages.push("UDT dependencies: " + udts.join(", "));
    if (invalid.length) messages.push("Problem: FC cannot use FB multi-instances: " + invalid.join(", "));
    note.textContent = messages.join(". ") + ".";
    return note;
}

export function renderFunctions(host, refresh) {
    host.replaceChildren();
    if (!projectConfig.fcs.length) {
        const empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "No Functions yet. Add a new local FC above, or read one from the Active PLC.";
        host.appendChild(empty);
        return;
    }
    for (const fc of projectConfig.fcs) {
        const card = programBlockDisclosure(fc, "FC", blockOpenState);
        const body = document.createElement("div");
        body.className = "program-block-body";
        body.appendChild(programMetadata(fc, "FC", dependencySummary(fc)));
        const declarations = programDeclarations();
        for (const section of SECTIONS) {
            const key = section.toLowerCase();
            const members = fc[key]?.members || [];
            const details = programSection(fc, "FC", section, members.length, sectionOpenState);
            details.appendChild(createMemberTree({
                prefix: "fc-" + fc.name + "-" + key, members, isDb: false,
                onChange: next => {
                    const conflict = findSectionNameConflict(fc, section, next);
                    if (conflict) { alert(conflict); return false; }
                    fc[key] = {name: section, members: next};
                    markDraft(fc);
                    refresh();
                    return true;
                },
            }));
            declarations.appendChild(details);
        }
        body.appendChild(declarations);
        if (fc.source_xml) {
            const source = document.createElement("details");
            source.className = "program-source-details";
            const summary = document.createElement("summary");
            summary.textContent = "Original " + programLanguage(fc.language) + " XML (read-only)";
            source.appendChild(summary);
            const code = document.createElement("pre");
            code.className = "device-config-preview";
            code.textContent = fc.source_xml;
            source.appendChild(code);
            body.appendChild(source);
        }
        const actions = programActions();
        if (fc.declaration_draft && fc.original_interface) {
            actions.appendChild(createButton("Discard draft", () => {
                for (const section of SECTIONS) {
                    const key = section.toLowerCase();
                    fc[key] = structuredClone(fc.original_interface[key] || {name: section, members: []});
                }
                fc.declaration_draft = false;
                saveProjectConfig();
                refresh();
            }));
        }
        actions.appendChild(createButton(fc.created_locally ? "Delete local FC" : "Remove snapshot", () => {
            const message = fc.created_locally
                ? 'Delete locally created FC "' + fc.name + '"? TIA Portal will not be changed.'
                : 'Remove the local snapshot "' + fc.name + '"? TIA Portal will not be changed.';
            if (!confirm(message)) return;
            projectConfig.fcs.splice(projectConfig.fcs.indexOf(fc), 1);
            saveProjectConfig();
            refresh();
        }));
        body.appendChild(actions);
        card.appendChild(body);
        host.appendChild(card);
    }
}
