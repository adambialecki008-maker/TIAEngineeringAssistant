// Shared, compact declaration UI for TIA FB/FC interface snapshots.
// Source XML is displayed as opaque data; no program logic is edited or written.
import {getActiveProjectProfileId} from "./state.js";

export function programLanguage(language) {
    // Accept native/localized TIA metadata while presenting one LAD label.
    return String(language || "Unknown").trim().toUpperCase() === "KOP"
        ? "LAD" : String(language || "Unknown").trim().toUpperCase();
}

export function programHeading(block, kind) {
    const header = document.createElement("header");
    header.className = "program-block-header";
    const heading = document.createElement("h3");
    heading.textContent = block.name + " · " + kind + " · " + programLanguage(block.language)
        + (block.number == null ? "" : " · #" + block.number);
    header.appendChild(heading);
    const tags = document.createElement("div");
    tags.className = "program-block-tags";
    const state = document.createElement("span");
    state.className = "program-state";
    const tia = block.source_mode === "tia_read_only";
    state.textContent = tia
        ? (block.interface_verified === false ? "TIA · Unverified" : "TIA · Interface verified")
        : block.created_locally === true ? "Local new · Not in TIA" : "Legacy · Unverified";
    tags.appendChild(state);
    if (block.declaration_draft) {
        const draft = document.createElement("span");
        draft.className = "program-state program-state-draft";
        draft.textContent = "Local draft";
        tags.appendChild(draft);
    }
    header.appendChild(tags);
    return header;
}

export function programMetadata(block, kind, dependencies) {
    const details = document.createElement("details");
    details.className = "program-meta-details";
    const summary = document.createElement("summary");
    summary.textContent = "Details";
    const explanation = document.createElement("p");
    explanation.className = "hint";
    if (block.created_locally === true) {
        explanation.textContent = "New local declaration-only block. Add Input/Output and other allowed parameters here. There is no LAD, FBD or SCL program source; the block has not been created in TIA Portal and cannot be imported as program logic.";
    } else if (block.source_mode !== "tia_read_only") {
        explanation.textContent = "Legacy local interface: not verified against TIA. Local declaration drafts are editable, but dependency reuse and FB/FC export stay blocked.";
    } else if (block.interface_verified === false) {
        explanation.textContent = "TIA interface could not be verified. Local declarations can be inspected and edited; dependency reuse and export stay blocked.";
    } else {
        explanation.textContent = "TIA interface snapshot. Only declaration drafts are editable here; original LAD, FBD or SCL logic is preserved. No FB/FC changes are written to TIA.";
    }
    details.append(summary, explanation);
    if (block.declaration_draft) {
        const draft = document.createElement("p");
        draft.className = "hint";
        draft.textContent = "Local declaration draft — not applied to TIA Portal.";
        details.appendChild(draft);
    }
    if (dependencies) details.appendChild(dependencies);
    if (block.unverified_reasons?.length) {
        const list = document.createElement("ul");
        for (const reason of block.unverified_reasons) {
            const item = document.createElement("li");
            item.textContent = reason;
            list.appendChild(item);
        }
        details.appendChild(list);
    }
    return details;
}

export function programDeclarations() {
    const container = document.createElement("div");
    container.className = "program-declarations";
    container.setAttribute("aria-label", "Program block declarations");
    return container;
}

export function programSection(block, kind, section, count, state) {
    const key = getActiveProjectProfileId() + ":" + kind + ":" + block.name.toLocaleLowerCase()
        + ":" + section.toLowerCase();
    const details = document.createElement("details");
    details.className = "program-declaration-section";
    details.dataset.checkpoint = key;
    details.open = state.has(key) ? state.get(key)
        : count > 0 || (block.created_locally === true && section === "Input");
    details.addEventListener("toggle", () => {
        // A detached older rendering must not overwrite the current choice.
        if (details.isConnected) state.set(key, details.open);
    });
    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.textContent = section;
    const size = document.createElement("span");
    size.className = "program-section-count";
    size.textContent = String(count);
    summary.append(name, size);
    details.appendChild(summary);
    return details;
}

export function programActions() {
    const row = document.createElement("div");
    row.className = "program-block-actions";
    return row;
}
