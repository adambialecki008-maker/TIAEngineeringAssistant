import { projectConfig } from "./state.js";
import {
    createButton,
    createDataTypeSelect,
    createInput,
    createTextCell,
} from "./ui.js";
import { getPlcDataTypes } from "./plc-types.js";

const ARRAY_MIN_BOUND = -32768;
const ARRAY_MAX_BOUND = 32767;

function normalized(value) {
    return String(value ?? "").trim().toLowerCase();
}

function availableTypes() {
    return new Set(
        getPlcDataTypes(projectConfig.plc_family).map(normalized)
    );
}

function udtDefinitions(ownerUdtName, replacement) {
    return new Map(projectConfig.udts.map((udt) => [
        normalized(udt.name),
        normalized(udt.name) === normalized(ownerUdtName)
            ? replacement : udt.fields,
    ]));
}

function validateStartValue(member, location) {
    const raw = member.start_value;
    if (raw === null || raw === undefined || String(raw).trim() === "") return null;
    const value = String(raw).trim();
    const kind = normalized(member.data_type);
    if (kind === "array" || kind === "struct") {
        return location + ": set Start value on a scalar member, not a group.";
    }
    if (kind === "bool") {
        return /^(true|false|0|1)$/i.test(value)
            ? null : location + ": Bool Start value must be TRUE or FALSE.";
    }
    const ranges = {
        sint: [-128n, 127n], usint: [0n, 255n],
        int: [-32768n, 32767n], uint: [0n, 65535n],
        dint: [-2147483648n, 2147483647n],
        udint: [0n, 4294967295n],
        lint: [-9223372036854775808n, 9223372036854775807n],
        ulint: [0n, 18446744073709551615n],
    };
    if (ranges[kind]) {
        if (!/^[+-]?[0-9]+$/.test(value)) {
            return location + ": invalid decimal integer Start value.";
        }
        const number = BigInt(value);
        const [min, max] = ranges[kind];
        return number >= min && number <= max
            ? null : location + ": Start value out of range for " + member.data_type;
    }
    if (kind === "real" || kind === "lreal") {
        const decimal = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
        return decimal.test(value) && Number.isFinite(Number(value))
            ? null : location + ": Real Start value must be a finite decimal.";
    }
    return location + ": this data type has no supported Start value syntax yet.";
}

function validateGroup(members, path, types, udts) {
    if (!Array.isArray(members) || members.length === 0) {
        return path + " must contain at least one member.";
    }
    const names = new Set();
    const validType = (type) => types.has(type)
        || (udts.has(type) && Array.isArray(udts.get(type))
            && udts.get(type).length > 0);
    for (const member of members) {
        const name = String(member?.name ?? "").trim();
        if (!name) return path + ": member name is required.";
        const key = normalized(name);
        if (names.has(key)) return path + ": duplicate member " + name + ".";
        names.add(key);
        const location = path + "." + name;
        const type = String(member.data_type ?? "").trim();
        if (!type) return location + ": data type is required.";
        if (normalized(type) === "array") {
            if (member.struct_members != null) {
                return location + ": Struct members are not valid for Array.";
            }
            const element = normalized(member.array_element_type);
            if (!element || !validType(element)) {
                return location + ": select a valid Array element type.";
            }
            const lower = member.array_lower_bound;
            const upper = member.array_upper_bound;
            if (!Number.isInteger(lower) || !Number.isInteger(upper)
                || lower < ARRAY_MIN_BOUND || upper > ARRAY_MAX_BOUND
                || lower > upper) {
                return location + ": Array bounds must be integers from "
                    + ARRAY_MIN_BOUND + " to " + ARRAY_MAX_BOUND
                    + " with lower bound <= upper bound.";
            }
        } else if (normalized(type) === "struct") {
            if (member.array_element_type != null
                || member.array_lower_bound != null
                || member.array_upper_bound != null) {
                return location + ": Array settings are not valid for Struct.";
            }
            const error = validateGroup(
                member.struct_members, location, types, udts
            );
            if (error) return error;
        } else {
            if (member.struct_members != null
                || member.array_element_type != null
                || member.array_lower_bound != null
                || member.array_upper_bound != null) {
                return location + ": complex settings are not valid for " + type + ".";
            }
            if (!validType(normalized(type))) {
                return location + ": unknown data type " + type + ".";
            }
        }
        const startError = validateStartValue(member, location);
        if (startError) return startError;
    }
    return null;
}

function memberReferences(members, references) {
    for (const member of members ?? []) {
        const type = normalized(member.data_type);
        if (type === "struct") {
            memberReferences(member.struct_members, references);
        } else if (type === "array") {
            references.add(normalized(member.array_element_type));
        } else {
            references.add(type);
        }
    }
}

export function validateMemberList(members, ownerUdtName = null) {
    const types = availableTypes();
    const udts = udtDefinitions(ownerUdtName, members);
    const targetName = ownerUdtName || "DB";
    const error = validateGroup(members, targetName, types, udts);
    if (error) return error;

    const visiting = new Set();
    const visited = new Set();
    function hasCycle(name) {
        if (visiting.has(name)) return true;
        if (visited.has(name)) return false;
        visiting.add(name);
        const references = new Set();
        memberReferences(udts.get(name), references);
        for (const reference of references) {
            if (udts.has(reference) && hasCycle(reference)) return true;
        }
        visiting.delete(name);
        visited.add(name);
        return false;
    }
    for (const name of udts.keys()) {
        if (hasCycle(name)) {
            return "UDT references must not contain a cycle (" + name + ").";
        }
    }
    return null;
}

export function formatMemberType(member) {
    if (member.data_type === "Array") {
        const lower = member.array_lower_bound;
        const upper = member.array_upper_bound;
        const count = Number.isInteger(lower) && Number.isInteger(upper)
            && upper >= lower ? upper - lower + 1 : null;
        return "Array[" + lower + ".." + upper + "] of "
            + member.array_element_type
            + (count === null ? "" : " (" + count
                + (count === 1 ? " element)" : " elements)"));
    }
    if (member.data_type === "Struct") {
        return "Struct (" + (member.struct_members?.length ?? 0)
            + " members)";
    }
    return member.data_type;
}

function labeledControl(text, control) {
    const label = document.createElement("label");
    label.className = "member-field";
    const caption = document.createElement("span");
    caption.textContent = text;
    label.append(caption, control);
    return label;
}

// A native checkbox represents Enabled/Disabled. Indeterminate means that the
// optional TIA attribute is NOT specified, preserving existing project data.
// The small Default action restores the unspecified state after editing.
function selectStoredType(select, value) {
    if (!value) return;
    if (![...select.options].some((option) => option.value === value)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value + " (stored)";
        select.appendChild(option);
    }
    select.value = value;
}

export function createMemberEditor({
    prefix,
    existingMembers,
    excludeUdtName = null,
    member = null,
    editIndex = -1,
    onAdd = null,
    onSave = null,
    onCancel = null,
    onDraftChange = null,
    isDb = false,
    retainDefault = false,
    inheritedRetain = null,
}) {
    const root = document.createElement("div");
    root.className = "member-editor-form";
    const row = document.createElement("div");
    row.className = "editor-row";
    const nameInput = createInput(prefix + "-name", "Name");
    const typeSelect = createDataTypeSelect(
        prefix + "-type", excludeUdtName, true, true
    );
    const commentInput = createInput(prefix + "-comment", "Comment");
    nameInput.value = member?.name ?? "";
    commentInput.value = member?.comment ?? "";
    selectStoredType(typeSelect, member?.data_type);
    row.append(
        labeledControl("Name", nameInput),
        labeledControl("Data type", typeSelect),
        labeledControl("Comment", commentInput)
    );
    root.appendChild(row);

    // Attribute checkboxes belong directly to the TIA-style declaration
    // table. The expanded editor only changes names, types, start values and
    // nested member structure, preserving all attributes not edited here.
    const startValueInput = createInput(prefix + "-start-value", "Start value");
    startValueInput.value = member?.start_value ?? "";
    const startValueLabel = labeledControl("Start value (optional)", startValueInput);
    root.appendChild(startValueLabel);
    const optionsNote = document.createElement("p");
    optionsNote.className = "hint";
    optionsNote.textContent = "Edit Retain and HMI attributes in the checkboxes "
        + "of the declaration table; right-click a checkbox to restore TIA default.";
    root.appendChild(optionsNote);

    const complexArea = document.createElement("div");
    root.appendChild(complexArea);
    const message = document.createElement("p");
    message.className = "member-editor-error";
    message.setAttribute("role", "alert");
    root.appendChild(message);

    let structMembers = structuredClone(member?.struct_members ?? []);
    let arrayElement = member?.array_element_type ?? "";
    let arrayLower = String(member?.array_lower_bound ?? 0);
    let arrayUpper = String(member?.array_upper_bound ?? 9);
    let elementSelect = null;
    let lowerInput = null;
    let upperInput = null;

    function rememberArray() {
        if (elementSelect) arrayElement = elementSelect.value;
        if (lowerInput) arrayLower = lowerInput.value;
        if (upperInput) arrayUpper = upperInput.value;
    }

    function renderComplexEditor() {
        rememberArray();
        complexArea.replaceChildren();
        elementSelect = lowerInput = upperInput = null;
        const scalar = !["Array", "Struct"].includes(typeSelect.value);
        startValueInput.disabled = !scalar;
        startValueLabel.title = scalar
            ? "Initial value for this scalar variable"
            : "Set values on scalar members of a Struct/UDT";
        if (typeSelect.value === "Array") {
            const arrayRow = document.createElement("div");
            arrayRow.className = "editor-row";
            elementSelect = createDataTypeSelect(
                prefix + "-array-type", excludeUdtName, false, false
            );
            selectStoredType(elementSelect, arrayElement);
            lowerInput = createInput(prefix + "-array-lower", "Lower bound", "number");
            upperInput = createInput(prefix + "-array-upper", "Upper bound", "number");
            lowerInput.value = arrayLower;
            upperInput.value = arrayUpper;
            for (const input of [lowerInput, upperInput]) {
                input.min = String(ARRAY_MIN_BOUND);
                input.max = String(ARRAY_MAX_BOUND);
            }
            arrayRow.append(
                labeledControl("Element type", elementSelect),
                labeledControl("Lower bound", lowerInput),
                labeledControl("Upper bound", upperInput)
            );
            complexArea.appendChild(arrayRow);
        }
        if (typeSelect.value === "Struct") {
            const title = document.createElement("h4");
            title.textContent = "Struct members";
            const draftHost = document.createElement("div");
            function renderDraft() {
                draftHost.replaceChildren(createMemberTree({
                    prefix: prefix + "-struct",
                    members: structMembers,
                    ownerUdtName: excludeUdtName,
                    validateOnChange: false,
                    isDb,
                    retainDefault,
                    inheritedRetain: member?.retain ?? inheritedRetain ?? retainDefault,
                    nested: true,
                    onChange: (next) => {
                        structMembers = next;
                        onDraftChange?.();
                        renderDraft();
                        return true;
                    },
                }));
            }
            complexArea.append(title, draftHost);
            renderDraft();
        }
    }
    typeSelect.addEventListener("change", renderComplexEditor);
    renderComplexEditor();

    const actions = document.createElement("div");
    actions.className = "action-row";
    actions.appendChild(createButton(member ? "Save" : "Add", () => {
        message.textContent = "";
        const name = nameInput.value.trim();
        const dataType = typeSelect.value;
        if (existingMembers.some((item, index) =>
            index !== editIndex && normalized(item.name) === normalized(name))) {
            message.textContent = "Member name must be unique in this structure.";
            return;
        }
        const candidate = {
            name,
            data_type: dataType,
            comment: commentInput.value.trim() || null,
            start_value: startValueInput.disabled
                ? null : (startValueInput.value.trim() || null),
            hmi_visible: member?.hmi_visible ?? null,
            hmi_accessible: member?.hmi_accessible ?? null,
            hmi_writable: member?.hmi_writable ?? null,
            retain: member?.retain ?? null,
            array_element_type: null,
            array_lower_bound: null,
            array_upper_bound: null,
            struct_members: null,
        };
        if (dataType === "Array") {
            const lower = lowerInput?.value.trim() ?? "";
            const upper = upperInput?.value.trim() ?? "";
            if (!lower || !upper) {
                message.textContent = "Array bounds are required.";
                return;
            }
            candidate.array_element_type = elementSelect?.value || null;
            candidate.array_lower_bound = Number(lower);
            candidate.array_upper_bound = Number(upper);
        }
        if (dataType === "Struct") {
            candidate.struct_members = structuredClone(structMembers);
        }
        const error = validateGroup(
            [candidate], "Member", availableTypes(),
            udtDefinitions(excludeUdtName, [candidate])
        );
        if (error) {
            message.textContent = error;
            return;
        }
        const accepted = member ? onSave(candidate) : onAdd(candidate);
        if (accepted === false) return;
        if (!member) {
            nameInput.value = "";
            commentInput.value = "";
            startValueInput.value = "";
            typeSelect.value = "";
            structMembers = [];
            arrayElement = "";
            arrayLower = "0";
            arrayUpper = "9";
            renderComplexEditor();
        }
    }));
    if (member) {
        actions.appendChild(createButton("Cancel", () => onCancel?.()));
    }
    root.appendChild(actions);
    return root;
}

function listAtPath(root, path) {
    let list = root;
    for (const index of path) list = list[index].struct_members;
    return list;
}

export function getExpandedMemberPaths(container) {
    const toggles = container.querySelectorAll("button[data-member-path]");
    if (toggles.length === 0) return null;
    return new Set([...toggles]
        .filter((button) => button.getAttribute("aria-expanded") === "true")
        .map((button) => button.dataset.memberPath));
}

const TABLE_FIELDS = [
    ["hmi_accessible", "Accessible from HMI/OPC UA"],
    ["hmi_writable", "Writable from HMI/OPC UA"],
    ["hmi_visible", "Visible in HMI"],
];

function tableFlagCell({member, key, inherited, editable = true, onChange}) {
    const cell = document.createElement("td");
    cell.className = "member-attribute-cell";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "member-attribute-checkbox";
    box.setAttribute("aria-label", key === "retain"
        ? "Retain " + member.name
        : (TABLE_FIELDS.find(item => item[0] === key)?.[1] || key)
            + " " + member.name);
    box.disabled = !editable;
    const raw = member[key];
    const value = raw == null ? inherited : raw;
    box.checked = value === true;
    box.indeterminate = raw == null && inherited == null;
    box.setAttribute("aria-checked",
        box.indeterminate ? "mixed" : String(box.checked));
    box.title = !editable
        ? (key === "retain" ? "Inherited or not applicable; edit the top-level DB variable" : "Read only")
        : raw == null
            ? "TIA default / inherited setting. Click to override; right-click to reset default."
            : "Explicit " + (raw ? "enabled" : "disabled")
                + ". Right-click to restore TIA default.";
    box.addEventListener("change", () => {
        if (editable) onChange(box.checked);
    });
    box.addEventListener("contextmenu", event => {
        if (!editable) return;
        event.preventDefault();
        onChange(null);
    });
    cell.appendChild(box);
    return cell;
}

export function createMemberTree({
    prefix,
    members,
    ownerUdtName = null,
    onChange,
    openPaths = null,
    validateOnChange = true,
    isDb = false,
    retainDefault = false,
    inheritedRetain = null,
    nested = false,
}) {
    const root = document.createElement("div");
    root.className = "member-tree";

    // Only one editor is open in each tree. Nested Struct drafts get
    // their own tree and remain isolated until their parent is saved.
    let activeClose = null;
    let savingActive = false;

    function apply(next) {
        if (validateOnChange) {
            const error = validateMemberList(next, ownerUdtName);
            if (error) {
                alert(error);
                return false;
            }
        }
        // An unrelated add/delete/reorder must not discard an open draft.
        if (!savingActive && activeClose && !activeClose(true)) {
            return false;
        }
        return onChange(next) !== false;
    }

    function mutate(path, action) {
        const next = structuredClone(members);
        action(listAtPath(next, path));
        return apply(next);
    }

    function renderList(host, list, path, parentName = "") {
        const table = document.createElement("table");
        table.className = "member-tree-table";
        const head = document.createElement("thead");
        head.innerHTML = "<tr><th>Name</th><th>Data type</th><th>Start value</th>"
            + "<th>Retain</th><th>Accessible from HMI/OPC UA</th>"
            + "<th>Writable from HMI/OPC UA</th><th>Visible in HMI</th>"
            + "<th>Comment</th><th>Actions</th></tr>";
        table.appendChild(head);
        const body = document.createElement("tbody");
        table.appendChild(body);

        list.forEach((member, index) => {
            const memberPath = [...path, index];
            const memberKey = prefix + ":" + memberPath.join(".");
            const row = document.createElement("tr");
            row.dataset.memberPath = memberKey;
            const nameCell = createTextCell(member.name);
            const editRow = document.createElement("tr");
            editRow.className = "member-tree-edit-row";
            editRow.dataset.memberDetails = memberKey;
            const editCell = document.createElement("td");
            editCell.colSpan = 9;
            editRow.appendChild(editCell);

            let expanded = false;
            let dirty = false;
            const toggle = createButton("▸", () => {
                if (expanded) closeEditor(true);
                else openEditor();
            });
            toggle.className = "member-tree-toggle";
            toggle.dataset.memberPath = memberKey;
            toggle.setAttribute("aria-expanded", "false");
            toggle.setAttribute("aria-label", "Expand details for " + member.name);
            nameCell.prepend(toggle, document.createTextNode(" "));
            editCell.addEventListener("input", () => { dirty = true; });
            editCell.addEventListener("change", () => { dirty = true; });

            function closeEditor(confirmChanges) {
                if (!expanded) return true;
                if (confirmChanges && dirty && !confirm(
                    'Discard unsaved changes to "' + member.name + '"?'
                )) return false;
                editRow.remove();
                editCell.replaceChildren();
                expanded = false;
                dirty = false;
                toggle.textContent = "▸";
                toggle.setAttribute("aria-expanded", "false");
                toggle.setAttribute("aria-label", "Expand details for " + member.name);
                if (activeClose === closeEditor) activeClose = null;
                return true;
            }

            function openEditor() {
                if (expanded) return;
                if (activeClose && !activeClose(true)) return;
                activeClose = closeEditor;
                expanded = true;
                dirty = false;
                editCell.replaceChildren(createMemberEditor({
                    prefix: prefix + "-edit-" + memberPath.join("-"),
                    existingMembers: list,
                    excludeUdtName: ownerUdtName,
                    member,
                    editIndex: index,
                    isDb, retainDefault,
                    inheritedRetain: member.retain ?? inheritedRetain ?? retainDefault,
                    onDraftChange: () => { dirty = true; },
                    onSave: (candidate) => {
                        // The renderer preserves expanded paths on refresh.
                        // A successful Save should close this editor instead.
                        toggle.setAttribute("aria-expanded", "false");
                        savingActive = true;
                        let accepted;
                        try {
                            accepted = mutate(path, (target) => {
                                target[index] = candidate;
                            });
                        } finally {
                            savingActive = false;
                        }
                        if (!accepted) {
                            toggle.setAttribute("aria-expanded", "true");
                        }
                        return accepted;
                    },
                    onCancel: () => closeEditor(false),
                }));
                toggle.textContent = "▾";
                toggle.setAttribute("aria-expanded", "true");
                toggle.setAttribute("aria-label", "Collapse details for " + member.name);
                row.after(editRow);
            }

            const ownRetain = isDb && !nested && path.length === 0;
            const effectiveRetain = member.retain ?? inheritedRetain ?? retainDefault;
            const retainCell = isDb
                ? tableFlagCell({
                    member, key:"retain",
                    inherited:effectiveRetain,
                    editable:ownRetain,
                    onChange:value => mutate(path, rows => { rows[index].retain = value; }),
                })
                : createTextCell("—");
            if (!isDb) retainCell.title = "Retain belongs to a DB, not a UDT declaration";
            const attrCells = TABLE_FIELDS.map(([key]) => tableFlagCell({
                member, key, inherited:null,
                onChange:value => mutate(path, rows => { rows[index][key] = value; }),
            }));
            row.append(
                nameCell,
                createTextCell(formatMemberType(member)),
                createTextCell(member.start_value ?? "—"),
                retainCell,
                ...attrCells,
                createTextCell(member.comment),
            );
            const actions = document.createElement("td");
            actions.className = "member-tree-actions";
            actions.appendChild(createButton("Delete", () => {
                if (!confirm('Delete member "' + member.name + '"?')) return;
                mutate(path, (target) => target.splice(index, 1));
            }));
            const up = createButton("Move up", () => mutate(path, (target) => {
                [target[index - 1], target[index]] =
                    [target[index], target[index - 1]];
            }));
            up.disabled = index === 0;
            actions.appendChild(up);
            const down = createButton("Move down", () => mutate(path, (target) => {
                [target[index + 1], target[index]] =
                    [target[index], target[index + 1]];
            }));
            down.disabled = index === list.length - 1;
            actions.appendChild(down);
            row.appendChild(actions);
            body.appendChild(row);
            if (openPaths?.has(memberKey)) openEditor();
        });
        host.appendChild(table);
        const addArea = document.createElement("div");
        addArea.className = "member-add-area";
        addArea.hidden = true;
        addArea.appendChild(createMemberEditor({
            prefix: prefix + "-add-" + (path.join("-") || "root"),
            existingMembers: list,
            excludeUdtName: ownerUdtName,
            isDb, retainDefault, inheritedRetain,
            onAdd: (candidate) => mutate(path, (target) => {
                target.push(candidate);
            }),
        }));
        const addLabel = parentName ? "Add to " + parentName : "Add field";
        const addToggle = createButton(addLabel, () => {
            addArea.hidden = !addArea.hidden;
            addToggle.setAttribute("aria-expanded", String(!addArea.hidden));
            addToggle.textContent = addArea.hidden ? addLabel : "Hide add form";
        });
        addToggle.className = "member-add-toggle";
        addToggle.setAttribute("aria-expanded", "false");
        host.append(addToggle, addArea);
    }

    renderList(root, members, []);
    return root;
}
