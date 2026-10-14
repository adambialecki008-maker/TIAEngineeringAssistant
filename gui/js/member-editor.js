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

export function createMemberTree({
    prefix,
    members,
    ownerUdtName = null,
    onChange,
    openPaths = null,
    validateOnChange = true,
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
        head.innerHTML = "<tr><th>Name</th><th>Data type</th>"
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
            editCell.colSpan = 4;
            editRow.appendChild(editCell);

            let expanded = false;
            let dirty = false;
            const toggle = createButton("+", () => {
                if (expanded) closeEditor(true);
                else openEditor();
            });
            toggle.className = "member-tree-toggle";
            toggle.dataset.memberPath = memberKey;
            toggle.setAttribute("aria-expanded", "false");
            toggle.setAttribute("aria-label", "Expand editor for " + member.name);
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
                toggle.textContent = "+";
                toggle.setAttribute("aria-expanded", "false");
                toggle.setAttribute("aria-label", "Expand editor for " + member.name);
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
                toggle.textContent = "−";
                toggle.setAttribute("aria-expanded", "true");
                toggle.setAttribute("aria-label", "Collapse editor for " + member.name);
                row.after(editRow);
            }

            row.append(
                nameCell,
                createTextCell(formatMemberType(member)),
                createTextCell(member.comment)
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
