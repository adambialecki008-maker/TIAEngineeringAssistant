// Create declaration-only FB/FC drafts in the active local profile.
// No program XML or LAD/FBD/SCL logic is generated and no TIA endpoint is called.
import {projectConfig, getActiveProjectProfileId, saveProjectConfig} from "./state.js";
import {postJson} from "./api.js";

const SECTION_NAMES = {
    fb: ["Input", "Output", "InOut", "Static", "Temp", "Constant"],
    fc: ["Input", "Output", "InOut", "Temp", "Constant"],
};

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const same = (left, right) => String(left || "").toLocaleLowerCase() ===
    String(right || "").toLocaleLowerCase();

function allProgramBlocks() {
    return [...projectConfig.fbs, ...projectConfig.fcs];
}

function makeDraft(kind, name, number, language) {
    const draft = {
        name, number, language,
        source_mode: "local", created_locally: true,
        source_xml: null, interface_verified: false,
        declaration_draft: true, unverified_reasons: [],
    };
    for (const section of SECTION_NAMES[kind]) {
        draft[section.toLowerCase()] = {name: section, members: []};
    }
    return draft;
}

function numberValue(raw) {
    if (raw.trim() === "") return null;
    if (!/^[0-9]+$/.test(raw.trim())) throw Error("Block number must be a nonnegative integer.");
    const value = Number(raw.trim());
    if (!Number.isSafeInteger(value)) throw Error("Block number is out of range.");
    return value;
}

export function findSectionNameConflict(block, section, members) {
    const used = new Set(members.map(item => String(item.name || "").trim().toLocaleLowerCase()));
    const otherSections = SECTION_NAMES[block.static ? "fb" : "fc"]
        .filter(name => name.toLowerCase() !== section.toLowerCase());
    for (const other of otherSections) {
        for (const member of block[other.toLowerCase()]?.members || []) {
            if (used.has(String(member.name || "").trim().toLocaleLowerCase())) {
                return "Variable name '" + member.name + "' already exists in " + other
                    + ". Names must be unique across all block sections.";
            }
        }
    }
    return null;
}

export function initLocalProgramCreationUi(refresh) {
    for (const kind of ["fb", "fc"]) {
        const form = document.getElementById("new-" + kind + "-form");
        const nameInput = document.getElementById("new-" + kind + "-name");
        const numberInput = document.getElementById("new-" + kind + "-number");
        const languageInput = document.getElementById("new-" + kind + "-language");
        const submitButton = document.getElementById("add-" + kind + "-button");
        const status = document.getElementById("new-" + kind + "-status");
        if (!form || !nameInput || !numberInput || !languageInput || !submitButton || !status) continue;
        let busy = false;
        const display = (message, error = false) => {
            status.textContent = message;
            status.classList.toggle("error", error);
            status.classList.toggle("success", !error);
        };
        form.addEventListener("submit", async event => {
            event.preventDefault();
            if (busy) return;
            busy = true;
            submitButton.disabled = true;
            const profileAtStart = getActiveProjectProfileId();
            try {
                const name = nameInput.value.trim();
                if (!identifier.test(name)) {
                    throw Error("Use a valid PLC name (letters, digits, underscore; no leading digit).");
                }
                const number = numberValue(numberInput.value);
                const language = languageInput.value;
                if (!["LAD", "FBD", "SCL"].includes(language)) throw Error("Select LAD, FBD or SCL.");
                if (allProgramBlocks().some(block => same(block.name, name))) {
                    throw Error("A Function or Function Block named " + name + " already exists.");
                }
                const collection = kind === "fb" ? projectConfig.fbs : projectConfig.fcs;
                if (number !== null && collection.some(block => block.number === number)) {
                    throw Error(kind.toUpperCase() + " number " + number + " already exists locally.");
                }
                const payload = makeDraft(kind, name, number, language);
                const endpoint = kind === "fb" ? "/api/v1/local-function-block-declarations"
                    : "/api/v1/local-function-declarations";
                const validated = await postJson(endpoint, payload);
                if (profileAtStart !== getActiveProjectProfileId()) {
                    throw Error("Project profile changed during validation. Nothing was created.");
                }
                if (allProgramBlocks().some(block => same(block.name, name))
                    || (number !== null && collection.some(block => block.number === number))) {
                    throw Error("Block was added concurrently. Nothing was overwritten.");
                }
                collection.push(validated);
                try {
                    saveProjectConfig();
                } catch (error) {
                    collection.pop();
                    throw error;
                }
                refresh();
                nameInput.value = "";
                numberInput.value = "";
                display(kind.toUpperCase() + " " + name
                    + " created in the active local profile. Add variables below; "
                    + "no program logic or TIA block was created.");
            } catch (error) {
                display(error.message, true);
            } finally {
                busy = false;
                submitButton.disabled = false;
            }
        });
    }
}
