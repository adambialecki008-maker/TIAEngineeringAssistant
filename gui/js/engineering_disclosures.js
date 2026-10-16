// Consistent top-level collapsible engineering sections across Overview,
// PLC, UDT, DB, Function Blocks and Source preview. Each existing form/control
// is MOVED, never recreated, so TIA import state and event handlers are intact.
const PREF_KEY = "tiaEngineeringAssistant.sections.v1";

// Only top-level static cards; never touch nested PLC tree or HMI workflow panels.
// "open" means default state for a new browser profile; the user's toggle
// choice is kept until explicitly changed, including after project switches.
const SECTIONS = [
    {tab: "project", index: 0, selector: ".overview-help", id: "overview-help",
     label: "Engineering context — getting started", static: true},
    {tab: "plc", index: 0, id: "plc-tags", label: "PLC tags", open: false},
    {tab: "plc", index: 1, id: "plc-program", label: "PLC program", open: false},
    {tab: "plc", index: 2, id: "plc-structures", label: "PLC data structures", open: false},
    {tab: "plc", index: 3, id: "plc-create", label: "Create PLC", open: false},
    {tab: "udt", index: 0, id: "udt-editor", label: "Application UDTs", open: true},
    {tab: "udt", index: 1, id: "udt-import", label: "Import UDT from TIA (read-only)", open: false},
    {tab: "db", index: 0, id: "db-editor", label: "Application DBs", open: true},
    {tab: "db", index: 1, id: "db-import", label: "Import DB from TIA (read-only)", open: false},
    {tab: "fb", index: 0, id: "fb-editor", label: "Function Blocks (FB)", open: false,
     move: "fb-container"},
    {tab: "fb", index: 1, id: "fb-import", label: "Read Function Block from TIA", open: false},
    {tab: "fb", index: 2, id: "fc-editor", label: "Functions (FC)", open: false,
     move: "fc-container"},
    {tab: "fb", index: 3, id: "fc-import", label: "Read Function from TIA", open: false},
    {tab: "fb", index: 4, id: "program-dependencies", label: "Offline declaration dependencies",
     open: false},
    {tab: "fb", index: 5, id: "instance-db-inventory", label: "Instance DB inventory",
     open: false},
    {tab: "preview", index: 0, id: "preview-selection", label: "Select UDTs and DBs", open: true},
    {tab: "preview", index: 1, id: "preview-source", label: "Generated source preview", open: true},
    {tab: "preview", index: 2, id: "preview-import", label: "Import UDT / DB to TIA — batch",
     open: false},
];

function readStoredState() {
    try {
        const stored = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
        return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    } catch {
        return {};
    }
}

function writeStoredState(state) {
    try {
        localStorage.setItem(PREF_KEY, JSON.stringify(state));
    } catch {
        // Optional display preference: never interrupt engineering operations.
    }
}

function staticCards(tab) {
    const panel = document.querySelector('.tab-panel[data-tab-panel="' + tab + '"]');
    return panel ? [...panel.querySelectorAll(":scope > .card")] : [];
}

function enhanceCard(card, spec, state) {
    if (!card || card.classList.contains("ui-disclosure")) return;
    if (spec.static) {
        // Informational context is always present. Ignore any stale
        // persisted disclosure preference from earlier versions.
        card.dataset.uiSection = spec.id;
        card.classList.add("ui-static-card");
        return;
    }
    const originalHeading = card.querySelector(":scope > h3, :scope > .card-header h3");
    const details = document.createElement("details");
    details.className = card.className + " ui-disclosure";
    details.dataset.uiSection = spec.id;
    const summary = document.createElement("summary");
    summary.className = "ui-disclosure-heading";
    if (originalHeading) {
        // Preserve the heading element/semantics without duplicated text.
        summary.appendChild(originalHeading);
    } else {
        const heading = document.createElement("h3");
        heading.textContent = spec.label;
        summary.appendChild(heading);
    }
    const body = document.createElement("div");
    body.className = "ui-disclosure-body";
    while (card.firstChild) body.appendChild(card.firstChild);
    details.append(summary, body);

    // Newly created FB/FC declarations live inside their respective panel,
    // not as a disconnected block between cards.
    if (spec.move) {
        const existingHost = document.getElementById(spec.move);
        if (existingHost) body.appendChild(existingHost);
    }
    details.open = Object.prototype.hasOwnProperty.call(state, spec.id)
        ? state[spec.id] === true : spec.open;
    details.addEventListener("toggle", () => {
        if (!details.isConnected) return;
        state[spec.id] = details.open;
        writeStoredState(state);
    });
    card.replaceWith(details);
}

export function initEngineeringDisclosures() {
    const state = readStoredState();
    const cardsByTab = {};
    for (const spec of SECTIONS) {
        // Snapshot BEFORE modification: converting a div to details must
        // not shift the positional mapping for the following cards.
        if (!cardsByTab[spec.tab]) cardsByTab[spec.tab] = staticCards(spec.tab);
        const card = spec.selector
            ? document.querySelector('.tab-panel[data-tab-panel="' + spec.tab + '"] '
                + spec.selector)
            : cardsByTab[spec.tab][spec.index];
        enhanceCard(card, spec, state);
    }
}
