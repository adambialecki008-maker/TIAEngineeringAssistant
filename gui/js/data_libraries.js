import {projectConfig, replaceProjectConfig, saveProjectConfig, listProjectProfiles, getActiveProjectProfileId, createProjectProfile, renameProjectProfile, switchProjectProfile, deleteProjectProfile} from "./state.js";
import {
    LIBRARY_CATEGORIES,
    analyzeDependencies,
    compareRevisionSnapshots,
    createCategory,
    createLibrary,
    createLibraryObjectRevision,
    createLibraryWithObjects,
    createSnapshot,
    deleteLibrary,
    deleteLibraryObject,
    deleteCategory,
    dependencyPlan,
    duplicateLibraryObject,
    exportPackage,
    getSnapshot,
    listLibraries,
    listCategories,
    listLibraryObjects,
    listSnapshots,
    planSelectiveLibraryImport,
    applySelectiveLibraryImport,
    normalizeLibraryName,
    objectVersions,
    parsePackage,
    putLibraryObjects,
    renameLibrary,
    renameLibraryObject,
    resolveDependencies,
    restoreLibraryObjectRevision,
    updateLibraryObjectMetadata,
} from "./library_store.js";

const root = document.getElementById("data-libraries-root");

function element(tag, text = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
}

function actionButton(label, handler, primary = false) {
    const node = element("button", label);
    node.type = "button";
    if (primary) node.className = "primary-button";
    node.addEventListener("click", handler);
    return node;
}

function clone(value) {
    return typeof structuredClone === "function"
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

function typeLabel(type) {
    return type === "udt" ? "UDT"
        : type === "db" ? "Data Block"
            : "Device Template";
}

function objectKey(item) {
    return `${item.object_type}:${item.name.toLocaleLowerCase()}`;
}

function projectObjects() {
    // The selected project PLC does not prove that an UDT, DB or template is
    // PLC-specific. Preserve only an explicit compatibility declaration.
    const compatibility = item => Array.isArray(item.compatible_plc_families)
        ? item.compatible_plc_families : [];
    return [
        ...projectConfig.udts.map(item => ({
            name: item.name,
            object_type: "udt",
            fields: item.fields || [],
            category: item.category || "General",
            source_project: item.source_project || "Current local project",
            compatible_plc_families: compatibility(item),
        })),
        ...projectConfig.dbs.map(item => ({
            name: item.name,
            object_type: "db",
            members: item.members || [],
            retain: item.retain === true,
            category: item.category || "General",
            source_project: item.source_project || "Current local project",
            compatible_plc_families: compatibility(item),
        })),
        ...(projectConfig.device_config?.templates || []).map(item => ({
            name: item.name,
            object_type: "device_template",
            signals: item.signals || [],
            category: item.category || "General",
            source_project: item.source_project || "Current local project",
            compatible_plc_families: compatibility(item),
        })),
    ];
}

function projectCollection(type) {
    if (type === "udt") return projectConfig.udts;
    if (type === "db") return projectConfig.dbs;
    projectConfig.device_config ||= {templates: [], groups: [], mappings: [], mapping_mode: "device"};
    projectConfig.device_config.templates ||= [];
    return projectConfig.device_config.templates;
}

function projectDefinitionFromLibrary(item, library) {
    const definition = clone(item.payload);
    definition.category = item.category || "General";
    definition.compatible_plc_families = clone(item.compatible_plc_families || []);
    definition.library_origin = {
        library_id: library.id,
        library_name: library.name,
        object_id: item.id,
        version: item.version,
    };
    return definition;
}

const PROJECT_BACKUP_SECTIONS = ["plc_family", "udts", "dbs", "templates", "groups", "mappings", "mapping_mode"];

function projectPackage(sections = PROJECT_BACKUP_SECTIONS) {
    const selected = new Set(sections);
    const backup = clone(projectConfig);
    // A portable backup never reuses a potentially stale target from another PC.
    backup.tia_target = null;
    if (!selected.has("plc_family")) backup.plc_family = "";
    if (!selected.has("udts")) backup.udts = [];
    if (!selected.has("dbs")) backup.dbs = [];
    backup.device_config ||= {};
    if (!selected.has("templates")) backup.device_config.templates = [];
    if (!selected.has("groups")) backup.device_config.groups = [];
    if (!selected.has("mappings")) backup.device_config.mappings = [];
    if (!selected.has("mapping_mode")) delete backup.device_config.mapping_mode;
    return backup;
}

function projectCounts(project) {
    return {
        udts: Array.isArray(project?.udts) ? project.udts.length : 0,
        dbs: Array.isArray(project?.dbs) ? project.dbs.length : 0,
        templates: Array.isArray(project?.device_config?.templates) ? project.device_config.templates.length : 0,
        groups: Array.isArray(project?.device_config?.groups) ? project.device_config.groups.length : 0,
        mappings: Array.isArray(project?.device_config?.mappings) ? project.device_config.mappings.length : 0,
    };
}

function mergeProjectBackup(incoming, sections) {
    const selected = new Set(sections);
    const source = incoming || {};
    const sourceDevices = source.device_config || {};
    projectConfig.device_config ||= {templates: [], groups: [], mappings: [], mapping_mode: "device"};
    const targetDevices = projectConfig.device_config;
    targetDevices.templates ||= [];
    targetDevices.groups ||= [];
    targetDevices.mappings ||= [];
    const result = {added: 0, skipped: 0, plc_skipped: false};
    const addNamed = (target, values) => {
        for (const value of values || []) {
            if (target.some(existing => String(existing.name).toLocaleLowerCase() === String(value.name).toLocaleLowerCase())) result.skipped++;
            else { target.push(clone(value)); result.added++; }
        }
    };
    if (selected.has("plc_family") && source.plc_family) {
        if (!projectConfig.plc_family) projectConfig.plc_family = source.plc_family;
        else if (projectConfig.plc_family !== source.plc_family) result.plc_skipped = true;
    }
    if (selected.has("udts")) addNamed(projectConfig.udts, source.udts);
    if (selected.has("dbs")) addNamed(projectConfig.dbs, source.dbs);
    if (selected.has("templates")) addNamed(targetDevices.templates, sourceDevices.templates);
    const addByKey = (target, values, keyOf) => {
        for (const value of values || []) {
            if (target.some(existing => keyOf(existing) === keyOf(value))) result.skipped++;
            else { target.push(clone(value)); result.added++; }
        }
    };
    if (selected.has("groups")) addByKey(targetDevices.groups, sourceDevices.groups, value => value.id);
    if (selected.has("mappings")) addByKey(targetDevices.mappings, sourceDevices.mappings,
        value => `${value.group_id}:${value.signal_id}:${value.start_channel_key}`);
    if (selected.has("mapping_mode") && !targetDevices.groups.length && !targetDevices.mappings.length && sourceDevices.mapping_mode) {
        targetDevices.mapping_mode = sourceDevices.mapping_mode;
    }
    projectConfig.tia_target = null;
    saveProjectConfig();
    return result;
}

async function downloadJson(name, data) {
    const contents = JSON.stringify(data, null, 2) + "\n";
    if (typeof window.showSaveFilePicker === "function") {
        const handle = await window.showSaveFilePicker({
            suggestedName: name,
            types: [{description: "JSON", accept: {"application/json": [".json"]}}],
        });
        const writable = await handle.createWritable();
        await writable.write(contents);
        await writable.close();
        return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([contents], {type: "application/json"}));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function selectOption(select, value, label) {
    const option = element("option", label);
    option.value = value;
    select.append(option);
}

function metadataEditor(item, categories, onSave, onRevision, onCancel) {
    const details = element("details");
    details.open = true;
    details.className = "library-metadata-editor";
    const summary = element("summary", `Edit metadata — ${item.name}`);
    const form = document.createElement("form");
    form.className = "action-row";
    form.noValidate = true;
    const fields = [
        ["Version", "version", item.version || "1.0.0"],
        ["Tags (comma-separated)", "tags", (item.tags || []).join(", ")],
        ["Author", "author", item.author || ""],
        ["Manufacturer", "manufacturer", item.manufacturer || ""],
        ["TIA version", "tia_version", item.tia_version || ""],
        ["Compatible PLC families (comma-separated)", "plc", (item.compatible_plc_families || []).join(", ")],
    ];
    const inputs = {};
    for (const [label, key, value] of fields) {
        const wrapper = element("label", label);
        const input = document.createElement("input");
        input.value = value;
        input.name = key;
        wrapper.append(input);
        inputs[key] = input;
        form.append(wrapper);
    }
    const categoryLabel = element("label", "Category");
    const category = document.createElement("select");
    for (const record of categories) selectOption(category, record.name, record.name);
    if (![...category.options].some(option => option.value === item.category)) {
        selectOption(category, item.category || "General", item.category || "General");
    }
    category.value = item.category || "General";
    categoryLabel.append(category);
    form.append(categoryLabel);
    const descriptionLabel = element("label", "Description");
    const description = document.createElement("textarea");
    description.value = item.description || "";
    descriptionLabel.append(description);
    form.append(descriptionLabel);
    const changelogLabel = element("label", "Changelog for a new version");
    const changelog = document.createElement("textarea");
    changelog.placeholder = "Optional description of this revision";
    changelogLabel.append(changelog);
    form.append(changelogLabel);
    const patch = () => ({
        version: inputs.version.value,
        category: category.value,
        tags: inputs.tags.value.split(","),
        author: inputs.author.value,
        manufacturer: inputs.manufacturer.value,
        tia_version: inputs.tia_version.value,
        compatible_plc_families: inputs.plc.value.split(","),
        description: description.value,
        changelog: changelog.value,
    });
    form.append(
        actionButton("Save metadata", async () => {
            await onSave(patch());
        }, true),
        actionButton("Save as new version", async () => onRevision(patch())),
        actionButton("Close", onCancel),
    );
    details.append(summary, form);
    return details;
}

export function initDataLibrariesUi(refreshProject = () => {}) {
    if (!root) return null;

    let library = null;
    let objects = [];
    let selected = new Set();
    let editingId = null;
    let versioningId = null;
    let detailsId = null;
    let pendingImport = null;
    let pendingImportAnalysis = null;
    let backupPreview = null;
    let categories = LIBRARY_CATEGORIES.map(name => ({key: name.toLocaleLowerCase(), name, built_in: true}));
    const filters = {query: "", type: "", category: "", compatibility: "all", tia: "", sort: "name"};

    const status = element("p", "Create or select a local library.");
    status.className = "status-box";
    const showStatus = (message, isError = false) => {
        status.textContent = message;
        status.classList.toggle("error", isError);
        status.classList.toggle("success", !isError);
    };

    const selector = document.createElement("select");
    const newLibraryName = document.createElement("input");
    newLibraryName.placeholder = "New library name";
    const selectedCount = element("span", "Selected: 0 object(s)");
    selectedCount.className = "hint";
    const objectList = element("div");

    const syncSelectedCount = () => {
        selectedCount.textContent = `Selected: ${selected.size} object(s)`;
    };

    const refresh = async () => {
        const libraries = await listLibraries();
        selector.replaceChildren();
        selectOption(selector, "", "Select library");
        for (const candidate of libraries.sort((a, b) => a.name.localeCompare(b.name))) {
            selectOption(selector, candidate.id, candidate.name);
        }
        if (library && libraries.some(candidate => candidate.id === library.id)) {
            library = libraries.find(candidate => candidate.id === library.id);
            selector.value = library.id;
            objects = await listLibraryObjects(library.id);
        } else {
            library = null;
            objects = [];
        }
        selected = new Set([...selected].filter(id => objects.some(item => item.id === id)));
        categories = await listCategories();
        if (editingId && !objects.some(item => item.id === editingId)) editingId = null;
        if (versioningId && !objects.some(item => item.id === versioningId)) versioningId = null;
        if (detailsId && !objects.some(item => item.id === detailsId)) detailsId = null;
        renderObjects();
        renderCategories();
    };

    const copyPlanToProject = async selectedIds => {
        if (!library) throw Error("Select a library first.");
        if (!selectedIds.length) throw Error("Select at least one library object.");
        const plan = dependencyPlan(selectedIds, objects);
        const existing = new Set(projectObjects().map(objectKey));
        const additions = plan.filter(item => !existing.has(objectKey(item)));
        const dependencies = plan.filter(item => !selectedIds.includes(item.id));
        const planText = plan.map(item => `${typeLabel(item.object_type)} ${item.name}`).join("\n");
        const confirmation = [
            `Copy ${additions.length} missing object(s) into the local project.`,
            dependencies.length ? `${dependencies.length} required dependency object(s) are included first.` : "No additional library dependencies are required.",
            existing.size && additions.length !== plan.length ? `${plan.length - additions.length} already-existing project object(s) will be left unchanged.` : "",
            "\nCopy plan:\n" + planText,
            "\nThis is local project configuration only; no TIA write is performed.",
        ].filter(Boolean).join("\n");
        if (!confirm(confirmation)) return;
        // The library remains local, but retain a recovery point before it
        // changes the in-browser project configuration.
        await createSnapshot("Before adding library objects to project", projectConfig, getActiveProjectProfileId());
        for (const item of additions) {
            projectCollection(item.object_type).push(projectDefinitionFromLibrary(item, library));
        }
        saveProjectConfig();
        refreshProject();
        // The snapshot was written before the project changed, so expose it
        // immediately instead of waiting for another library operation.
        await renderSnapshots();
        showStatus(`Copied ${additions.length} object(s) in dependency order. ${plan.length - additions.length} existing object(s) were unchanged.`);
    };

    const versionPanel = item => {
        const panel = element("details");
        panel.open = true;
        panel.className = "library-metadata-editor";
        panel.append(element("summary", `Versions & comparison — ${item.name}`));
        const records = objectVersions(item);
        const history = document.createElement("table");
        history.className = "management-table";
        history.innerHTML = "<thead><tr><th>Version</th><th>Created</th><th>Changelog</th><th>Actions</th></tr></thead>";
        const historyBody = document.createElement("tbody");
        for (const record of records) {
            const row = document.createElement("tr");
            for (const value of [record.version, new Date(record.created_at).toLocaleString(), record.changelog || "—"]) {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.append(cell);
            }
            const actions = document.createElement("td");
            actions.append(
                actionButton("Export this version", async () => {
                    const exact = {
                        ...clone(record.snapshot),
                        version: record.version,
                        created_at: record.created_at,
                        modified_at: record.created_at,
                        content_hash: record.content_hash,
                        versions: [clone(record)],
                    };
                    const packageObjects = objects.map(candidate => candidate.id === item.id ? exact : candidate);
                    await downloadJson(`${library.name}-${item.name}-${record.version}.json`,
                        exportPackage(library, [exact.id], packageObjects));
                }),
                actionButton("Restore as new version", async () => {
                const nextVersion = prompt(`Restore ${record.version} as a new version:`, "");
                if (nextVersion === null) return;
                try {
                    await restoreLibraryObjectRevision(item.id, record.version, nextVersion);
                    versioningId = null;
                    await refresh();
                    showStatus(`${item.name} restored from ${record.version} as ${nextVersion}.`);
                } catch (error) { showStatus(error.message, true); }
                }),
            );
            row.append(actions);
            historyBody.append(row);
        }
        history.append(historyBody);
        panel.append(history);
        if (records.length > 1) {
            const comparison = element("div");
            comparison.className = "details-content";
            const left = document.createElement("select");
            const right = document.createElement("select");
            for (const record of records) {
                selectOption(left, record.version, record.version);
                selectOption(right, record.version, record.version);
            }
            left.value = records[1].version;
            right.value = records[0].version;
            const changes = element("div");
            const renderComparison = () => {
                changes.replaceChildren();
                const before = records.find(record => record.version === left.value);
                const after = records.find(record => record.version === right.value);
                const diff = compareRevisionSnapshots(before, after);
                changes.append(element("p", diff.length ? `${diff.length} definition change(s):` : "No definition differences."));
                if (diff.length) {
                    const table = document.createElement("table");
                    table.className = "management-table";
                    table.innerHTML = "<thead><tr><th>Path</th><th>Change</th><th>Details</th></tr></thead>";
                    const body = document.createElement("tbody");
                    for (const entry of diff) {
                        const row = document.createElement("tr");
                        for (const value of [entry.path, entry.change, entry.detail]) {
                            const cell = document.createElement("td");
                            cell.textContent = value;
                            row.append(cell);
                        }
                        body.append(row);
                    }
                    table.append(body);
                    changes.append(table);
                }
            };
            comparison.append(element("span", "Compare"), left, element("span", "with"), right, actionButton("Compare", renderComparison), changes);
            renderComparison();
            panel.append(comparison);
        }
        panel.append(actionButton("Close versions", () => { versioningId = null; renderObjects(); }));
        return panel;
    };

    const detailsPanel = item => {
        const panel = element("details");
        panel.open = true;
        panel.className = "library-metadata-editor";
        panel.append(element("summary", `Details & dependencies - ${item.name}`));
        const metadata = document.createElement("table");
        metadata.className = "management-table";
        const metadataBody = document.createElement("tbody");
        for (const [label, value] of [
            ["Type", typeLabel(item.object_type)],
            ["Version", item.version],
            ["Category", item.category || "General"],
            ["Tags", (item.tags || []).join(", ") || "-"],
            ["Author", item.author || "-"],
            ["Manufacturer", item.manufacturer || "-"],
            ["Source project", item.source_project || "-"],
            ["TIA version", item.tia_version || "-"],
            ["PLC compatibility", (item.compatible_plc_families || []).join(", ") || "Any"],
            ["Created", item.created_at ? new Date(item.created_at).toLocaleString() : "-"],
            ["Modified", item.modified_at ? new Date(item.modified_at).toLocaleString() : "-"],
            ["Description", item.description || "-"],
        ]) {
            const row = document.createElement("tr");
            row.append(element("th", label), element("td", value));
            metadataBody.append(row);
        }
        metadata.append(metadataBody);
        panel.append(metadata);
        const dependencyDetails = element("div");
        dependencyDetails.className = "details-content";
        try {
            const graph = resolveDependencies(objects);
            const required = dependencyPlan([item.id], objects)
                .filter(candidate => candidate.id !== item.id)
                .map(candidate => `${typeLabel(candidate.object_type)} ${candidate.name}`);
            const usedBy = objects.filter(candidate => (graph.get(candidate.id) || []).includes(item.id))
                .map(candidate => `${typeLabel(candidate.object_type)} ${candidate.name}`);
            dependencyDetails.append(
                element("p", required.length ? `Requires: ${required.join(", ")}` : "Requires: none."),
                element("p", usedBy.length ? `Used by: ${usedBy.join(", ")}` : "Used by: no library objects."),
            );
        } catch (error) {
            dependencyDetails.append(element("p", `Dependency analysis: ${error.message}`));
        }
        panel.append(dependencyDetails, actionButton("Close details", () => { detailsId = null; renderObjects(); }));
        return panel;
    };

    const renderObjects = () => {
        objectList.replaceChildren();
        syncSelectedCount();
        if (!library) {
            objectList.append(element("p", "No library selected."));
            return;
        }
        if (!objects.length) {
            objectList.append(element("p", "This library is empty. Add current-project objects below."));
            return;
        }

        const filterRow = element("div");
        filterRow.className = "action-row";
        const search = document.createElement("input");
        search.placeholder = "Search name, category or tag";
        search.value = filters.query;
        const type = document.createElement("select");
        selectOption(type, "", "All object types");
        selectOption(type, "udt", "UDT");
        selectOption(type, "db", "Data Block");
        selectOption(type, "device_template", "Device Template");
        type.value = filters.type;
        const category = document.createElement("select");
        selectOption(category, "", "All categories");
        const categoryNames = categories.map(record => record.name);
        for (const value of categoryNames) selectOption(category, value, value);
        if (filters.category && !categoryNames.includes(filters.category)) {
            filters.category = "";
        }
        category.value = filters.category;
        const compatibility = document.createElement("select");
        selectOption(compatibility, "all", "All PLC compatibility");
        selectOption(compatibility, "current", projectConfig.plc_family ? `Compatible with ${projectConfig.plc_family}` : "Compatible with current PLC");
        selectOption(compatibility, "unrestricted", "No PLC restriction");
        compatibility.value = filters.compatibility;
        const tia = document.createElement("select");
        selectOption(tia, "", "All TIA versions");
        const tiaVersions = [...new Set(objects.map(item => item.tia_version).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right));
        for (const value of tiaVersions) selectOption(tia, value, value);
        if (!tiaVersions.includes(filters.tia)) filters.tia = "";
        tia.value = filters.tia;
        const sort = document.createElement("select");
        selectOption(sort, "name", "Sort: name");
        selectOption(sort, "type", "Sort: type");
        selectOption(sort, "version", "Sort: version");
        selectOption(sort, "updated", "Sort: recently updated");
        sort.value = filters.sort;
        filterRow.append(search, type, category, compatibility, tia, sort);
        objectList.append(filterRow);

        const visibleItems = () => {
            const query = filters.query.trim().toLocaleLowerCase();
            const currentFamily = projectConfig.plc_family.toLocaleLowerCase();
            const result = objects.filter(item => {
                const text = [item.name, item.category, ...(item.tags || []), item.author, item.manufacturer]
                    .join(" ").toLocaleLowerCase();
                const families = (item.compatible_plc_families || []).map(value => value.toLocaleLowerCase());
                return (!query || text.includes(query))
                    && (!filters.type || item.object_type === filters.type)
                    && (!filters.category || item.category === filters.category)
                    && (!filters.tia || item.tia_version === filters.tia)
                    && (filters.compatibility === "all"
                        || (filters.compatibility === "unrestricted" && families.length === 0)
                        || (filters.compatibility === "current" && (!!currentFamily && (families.length === 0 || families.includes(currentFamily)))));
            });
            return result.sort((left, right) => {
                if (filters.sort === "type") return `${left.object_type}:${left.name}`.localeCompare(`${right.object_type}:${right.name}`);
                if (filters.sort === "version") return right.version.localeCompare(left.version, undefined, {numeric: true});
                if (filters.sort === "updated") return String(right.modified_at || "").localeCompare(String(left.modified_at || ""));
                return left.name.localeCompare(right.name);
            });
        };

        const categorySelections = element("details");
        categorySelections.className = "library-category-manager";
        categorySelections.append(element("summary", "Select by category"));
        const categorySelectionContent = element("div");
        categorySelectionContent.className = "details-content";
        for (const value of categoryNames) {
            const matching = objects.filter(item => item.category === value);
            if (!matching.length) continue;
            const label = element("label");
            const check = document.createElement("input");
            check.type = "checkbox";
            const count = matching.filter(item => selected.has(item.id)).length;
            check.checked = count === matching.length;
            check.indeterminate = count > 0 && count < matching.length;
            check.addEventListener("change", () => {
                for (const item of matching) check.checked ? selected.add(item.id) : selected.delete(item.id);
                renderObjects();
            });
            label.append(check, document.createTextNode(` ${value} (${matching.length})`));
            categorySelectionContent.append(label);
        }
        categorySelections.append(categorySelectionContent);
        objectList.append(categorySelections);

        const controls = element("div");
        controls.className = "action-row";
        controls.append(
            actionButton("Add selected to project", async () => {
                try { await copyPlanToProject([...selected]); }
                catch (error) { showStatus(error.message, true); }
            }, true),
        );
        objectList.append(controls);

        const table = document.createElement("table");
        table.className = "management-table";
        table.innerHTML = "<thead><tr><th>Select</th><th>Name</th><th>Type</th><th>Version</th><th>Category</th><th>PLC</th><th>Actions</th></tr></thead>";
        const body = document.createElement("tbody");
        table.append(body);
        objectList.append(table);
        const selectAll = document.createElement("input");
        selectAll.type = "checkbox";
        selectAll.setAttribute("aria-label", "Select all visible objects");
        table.querySelector("thead th").replaceChildren(selectAll, document.createTextNode(" Select"));

        const renderRows = () => {
            const visible = visibleItems();
            body.replaceChildren();
            for (const item of visible) {
                const row = document.createElement("tr");
                const check = document.createElement("input");
                check.type = "checkbox";
                check.checked = selected.has(item.id);
                check.addEventListener("change", () => {
                    check.checked ? selected.add(item.id) : selected.delete(item.id);
                    syncSelectedCount();
                    syncSelectAll();
                });
                const values = [
                    check,
                    item.name,
                    typeLabel(item.object_type),
                    item.version,
                    item.category,
                    (item.compatible_plc_families || []).join(", ") || "Any",
                ];
                for (const value of values) {
                    const cell = document.createElement("td");
                    typeof value === "string" ? cell.append(document.createTextNode(value)) : cell.append(value);
                    row.append(cell);
                }
                const actions = document.createElement("td");
                actions.append(
                    actionButton("Copy with dependencies", async () => {
                        try { await copyPlanToProject([item.id]); }
                        catch (error) { showStatus(error.message, true); }
                    }),
                    actionButton(detailsId === item.id ? "Details open" : "Details", () => {
                        detailsId = detailsId === item.id ? null : item.id;
                        renderObjects();
                    }),
                    actionButton(editingId === item.id ? "Editing" : "Edit metadata", () => {
                        editingId = editingId === item.id ? null : item.id;
                        renderObjects();
                    }),
                    actionButton(versioningId === item.id ? "Versions open" : "Versions", () => {
                        versioningId = versioningId === item.id ? null : item.id;
                        renderObjects();
                    }),
                    actionButton("Duplicate", async () => {
                        const name = prompt(`Name for a copy of ${item.name}:`, `${item.name}_Copy`);
                        if (name === null) return;
                        try {
                            const duplicate = await duplicateLibraryObject(item.id, name);
                            await refresh();
                            showStatus(`${typeLabel(duplicate.object_type)} ${duplicate.name} duplicated as version ${duplicate.version}.`);
                        } catch (error) { showStatus(error.message, true); }
                    }),
                    actionButton("Rename", async () => {
                        const name = prompt(`New name for ${item.name}:`, item.name);
                        if (name === null) return;
                        const version = prompt(`New semantic version for ${name}:`, "");
                        if (version === null) return;
                        const changelog = prompt("Changelog (optional):", `Renamed from ${item.name}.`);
                        if (changelog === null) return;
                        try {
                            const result = await renameLibraryObject(item.id, name, version, changelog);
                            await refresh();
                            showStatus(`${item.name} renamed to ${result.item.name}. ${result.references_updated} dependent reference(s) were revised.`);
                        } catch (error) { showStatus(error.message, true); }
                    }),
                    actionButton("Delete", async () => {
                        if (!confirm(`Delete ${item.name} from this local library?`)) return;
                        await deleteLibraryObject(item.id);
                        await refresh();
                        showStatus(`${item.name} deleted from ${library.name}.`);
                    }),
                );
                row.append(actions);
                body.append(row);
                if (editingId === item.id) {
                    const editorRow = document.createElement("tr");
                    const editorCell = document.createElement("td");
                    editorCell.colSpan = 7;
                    editorCell.append(metadataEditor(item, categories, async patch => {
                        await updateLibraryObjectMetadata(item.id, patch);
                        editingId = null;
                        await refresh();
                        showStatus(`Metadata for ${item.name} saved locally.`);
                    }, async patch => {
                        await createLibraryObjectRevision(item.id, patch);
                        editingId = null;
                        await refresh();
                        showStatus(`New version ${patch.version} saved for ${item.name}.`);
                    }, () => { editingId = null; renderObjects(); }));
                    editorRow.append(editorCell);
                    body.append(editorRow);
                }
                if (detailsId === item.id) {
                    const detailsRow = document.createElement("tr");
                    const detailsCell = document.createElement("td");
                    detailsCell.colSpan = 7;
                    detailsCell.append(detailsPanel(item));
                    detailsRow.append(detailsCell);
                    body.append(detailsRow);
                }
                if (versioningId === item.id) {
                    const versionRow = document.createElement("tr");
                    const versionCell = document.createElement("td");
                    versionCell.colSpan = 7;
                    versionCell.append(versionPanel(item));
                    versionRow.append(versionCell);
                    body.append(versionRow);
                }
            }
            syncSelectAll();
        };
        const syncSelectAll = () => {
            const visible = visibleItems();
            const count = visible.filter(item => selected.has(item.id)).length;
            selectAll.checked = visible.length > 0 && count === visible.length;
            selectAll.indeterminate = count > 0 && count < visible.length;
        };
        const updateFilter = () => {
            filters.query = search.value;
            filters.type = type.value;
            filters.category = category.value;
            filters.compatibility = compatibility.value;
            filters.tia = tia.value;
            filters.sort = sort.value;
            renderRows();
            syncSelectAll();
        };
        for (const control of [search, type, category, compatibility, tia, sort]) {
            control.addEventListener(control === search ? "input" : "change", updateFilter);
        }
        selectAll.addEventListener("change", () => {
            for (const item of visibleItems()) selectAll.checked ? selected.add(item.id) : selected.delete(item.id);
            renderRows();
            syncSelectedCount();
        });
        renderRows();
    };

    const profilesCard = element("div");
    profilesCard.className = "card";
    profilesCard.id = "project-profiles-card";
    profilesCard.append(element("h3", "Local project profiles"),
        element("p", "Each profile has independent UDTs, DBs and device configuration. Libraries remain shared. Switching clears the active TIA target."));
    const profileActions = element("div");
    profileActions.className = "action-row";
    const profileSelector = document.createElement("select");
    profileSelector.id = "project-profile-selector";
    const profileName = document.createElement("input");
    profileName.placeholder = "New project name";
    const profileStatus = element("p", "");
    profileStatus.className = "status-box";
    const renderProfiles = () => {
        profileSelector.replaceChildren();
        for (const item of listProjectProfiles()) {
            selectOption(profileSelector, item.id, item.name);
        }
        profileSelector.value = getActiveProjectProfileId();
    };
    profileSelector.addEventListener("change", async () => {
        try {
            if (!confirm("Switch the local project? The current profile will be saved and the TIA target disconnected.")) {
                renderProfiles(); return;
            }
            switchProjectProfile(profileSelector.value);
            refreshProject();
            profileStatus.textContent = "Active project: " + profileSelector.selectedOptions[0]?.textContent + ". TIA target must be selected again.";
            await renderSnapshots();
        } catch (error) { profileStatus.textContent = error.message; renderProfiles(); }
    });
    profileActions.append(profileSelector, profileName,
        actionButton("Create project", () => {
            try {
                const created = createProjectProfile(profileName.value);
                profileName.value = "";
                renderProfiles();
                profileStatus.textContent = "Created " + created.name + ". Select it to switch.";
            } catch (error) { profileStatus.textContent = error.message; }
        }, true),
        actionButton("Rename project", () => {
            try {
                const active = listProjectProfiles().find(p => p.id === getActiveProjectProfileId());
                const name = prompt("New project name:", active?.name);
                if (name === null) return;
                renameProjectProfile(active.id, name);
                renderProfiles();
                profileStatus.textContent = "Project renamed.";
            } catch (error) { profileStatus.textContent = error.message; }
        }),
        actionButton("Delete project", () => {
            try {
                const id = profileSelector.value;
                if (id === "default") throw Error("The default project cannot be deleted.");
                if (!confirm("Delete this local project profile and its configuration? This cannot be undone. Export a backup first.")) return;
                // Active profiles cannot be removed without first switching.
                switchProjectProfile("default");
                deleteProjectProfile(id);
                renderProfiles();
                refreshProject();
                renderSnapshots().catch(console.error);
                profileStatus.textContent = "Profile deleted; switched to Default project.";
            } catch (error) { profileStatus.textContent = error.message; renderProfiles(); }
        }));
    profilesCard.append(profileActions, profileStatus);
    renderProfiles();

    const libraryCard = element("div");
    libraryCard.className = "card";
    libraryCard.append(element("h3", "Engineering Library"));
    const libraryActions = element("div");
    libraryActions.className = "action-row";
    libraryActions.append(
        selector,
        newLibraryName,
        actionButton("Create library", async () => {
            try {
                library = await createLibrary(newLibraryName.value);
                newLibraryName.value = "";
                await refresh();
                showStatus(`Library ${library.name} created locally.`);
            } catch (error) { showStatus(error.message, true); }
        }, true),
        actionButton("Add current project objects", async () => {
            try {
                if (!library) throw Error("Select a library first.");
                const current = projectObjects();
                if (!current.length) throw Error("Current project has no UDT, DB or Device Template to add.");
                const result = await putLibraryObjects(library.id, current, {skipConflicts: true});
                await refresh();
                showStatus(`${result.added.length} missing object(s) added; ${result.skipped.length} identical and ${result.conflicts.length} conflicting object(s) left unchanged.`);
            } catch (error) { showStatus(error.message, true); }
        }, true),
        actionButton("Rename library", async () => {
            try {
                if (!library) throw Error("Select a library first.");
                const name = prompt("New library name:", library.name);
                if (name === null) return;
                library = await renameLibrary(library.id, name);
                await refresh();
                showStatus(`Library renamed to ${library.name}.`);
            } catch (error) { showStatus(error.message, true); }
        }),
        actionButton("Delete library", async () => {
            try {
                if (!library) throw Error("Select a library first.");
                if (!confirm(`Delete library \"${library.name}\" and all of its objects? This cannot be undone.`)) return;
                await deleteLibrary(library.id);
                library = null;
                selected.clear();
                await refresh();
                showStatus("Library deleted.");
            } catch (error) { showStatus(error.message, true); }
        }),
        actionButton("Refresh libraries", async () => {
            try {
                await refresh();
                showStatus("Library list refreshed from local storage.");
            } catch (error) { showStatus(error.message, true); }
        }),
    );
    selector.addEventListener("change", async () => {
        const libraries = await listLibraries();
        library = libraries.find(item => item.id === selector.value) || null;
        selected.clear();
        editingId = null;
        await refresh();
    });
    const categoryManager = element("details");
    categoryManager.className = "library-category-manager";
    categoryManager.append(element("summary", "Manage available categories"));
    const categoryContent = element("div");
    categoryContent.className = "details-content";
    const categoryName = document.createElement("input");
    categoryName.placeholder = "New category name";
    const categoryStatus = element("p", "Categories are shared by UDTs, DBs and libraries.");
    categoryStatus.className = "hint";
    const categoryList = element("div");
    const publishCategories = () => window.dispatchEvent(new CustomEvent("library-categories-changed", {
        detail: categories.map(record => record.name),
    }));
    const renderCategories = () => {
        categoryList.replaceChildren();
        for (const record of categories) {
            const item = element("div");
            item.className = "action-row";
            const used = objects.some(object => object.category === record.name);
            item.append(
                element("span", record.built_in ? `${record.name} (built-in)` : record.name),
            );
            if (!record.built_in) {
                item.append(actionButton("Delete", async () => {
                    try {
                        if (!confirm(`Delete category \"${record.name}\"?`)) return;
                        await deleteCategory(record.key);
                        await refresh();
                        publishCategories();
                        renderCategories();
                        categoryStatus.classList.remove("error");
                        categoryStatus.textContent = `Category ${record.name} deleted.`;
                    } catch (error) {
                        categoryStatus.classList.add("error");
                        categoryStatus.textContent = error.message;
                    }
                }));
            } else if (used) {
                item.append(element("span", "Used by this library"));
            }
            categoryList.append(item);
        }
    };
    categoryContent.append(
        categoryName,
        actionButton("Add category", async () => {
            try {
                const created = await createCategory(categoryName.value);
                categoryName.value = "";
                await refresh();
                publishCategories();
                renderCategories();
                categoryStatus.classList.remove("error");
                categoryStatus.textContent = `Category ${created.name} added and available in UDT, DB and library editors.`;
            } catch (error) {
                categoryStatus.classList.add("error");
                categoryStatus.textContent = error.message;
            }
        }, true),
        categoryStatus,
        categoryList,
    );
    categoryManager.append(categoryContent);
    libraryCard.append(libraryActions, status, categoryManager, selectedCount, objectList);

    // Export is part of the selected library; it stays collapsed until needed.
    const exportSection = element("details");
    exportSection.id = "library-export-panel";
    exportSection.className = "library-category-manager";
    const exportContent = element("div");
    exportContent.className = "details-content";
    exportSection.append(element("summary", "Export Library — save selected objects as JSON"), exportContent);
    let exportPreview = null;
    const exportStatus = element("p", "Select objects with the checkboxes above, then preview the JSON download. Required UDT dependencies are included and listed before you save.");
    exportStatus.className = "status-box";
    const exportPreviewPanel = element("div");
    exportPreviewPanel.className = "details-content";
    const renderExportPreview = () => {
        exportPreviewPanel.replaceChildren();
        if (!exportPreview) {
            exportPreviewPanel.append(element("p", "Prepare an export to inspect selected objects and required dependencies before saving a file."));
            return;
        }
        const {analysis, selectedIds} = exportPreview;
        exportPreviewPanel.append(
            element("p", `Selected objects: ${selectedIds.length}. Required dependencies: ${analysis.dependencies.length}. Exported objects: ${analysis.plan.length}.`),
        );
        const list = element("ul");
        for (const item of analysis.plan) {
            list.append(element("li", `${selectedIds.includes(item.id) ? "Selected" : "Dependency"}: ${typeLabel(item.object_type)} ${item.name}`));
        }
        exportPreviewPanel.append(list);
        exportPreviewPanel.append(
            actionButton("Save previewed library JSON", async () => {
                try {
                    const packageData = exportPackage(library, selectedIds, objects);
                    await downloadJson(`${library.name.replace(/[^a-z0-9]+/gi, "-")}.json`, packageData);
                    exportStatus.classList.remove("error");
                    exportStatus.textContent = `Exported ${packageData.objects.length} object(s) to a portable library JSON file.`;
                } catch (error) { exportStatus.classList.add("error"); exportStatus.textContent = error.message; }
            }, true),
            actionButton("Cancel export preview", () => {
                exportPreview = null;
                renderExportPreview();
            }),
        );
    };
    const prepareExport = ids => {
        if (!library) throw Error("Select a library first.");
        if (!ids.length) throw Error("This library has no objects to export.");
        const analysis = analyzeDependencies(ids, objects);
        if (analysis.missing.length) {
            throw Error(`Export blocked: missing UDT definition(s): ${analysis.missing.join(", ")}. Add them to the library first.`);
        }
        exportPreview = {selectedIds: ids, analysis};
        renderExportPreview();
        exportStatus.classList.remove("error");
        exportStatus.textContent = "Export preview prepared. Review the dependency plan, then save the JSON file.";
    };
    const exportActions = element("div");
    exportActions.className = "action-row";
    exportActions.append(
        actionButton("Export selected objects", async () => {
            try { prepareExport([...selected]); }
            catch (error) { exportStatus.classList.add("error"); exportStatus.textContent = error.message; }
        }, true),
        actionButton("Export complete library", async () => {
            try { prepareExport(objects.map(item => item.id)); }
            catch (error) { exportStatus.classList.add("error"); exportStatus.textContent = error.message; }
        }),
    );
    exportContent.append(
        element("p", "FROM: the selected Engineering Library. TO: a portable JSON file on your computer. Select individual UDTs, DBs and templates using the checkboxes above, or export the entire library. Nothing is sent to TIA Portal."),
        exportActions, exportStatus, exportPreviewPanel
    );
    libraryCard.append(exportSection);

    // Import is a separate foldable menu, not mixed with library export.
    const transfer = element("div");
    transfer.className = "card";
    transfer.id = "library-import-card";
    transfer.append(element("h3", "Import Library"));
    const importSection = element("details");
    importSection.id = "library-import-panel";
    importSection.className = "library-category-manager";
    const importContent = element("div");
    importContent.className = "details-content";
    importSection.append(element("summary", "Import Library — load JSON from another computer"), importContent);
    transfer.append(importSection);
    const importFile = document.createElement("input");
    importFile.type = "file";
    importFile.accept = ".json,application/json";
    const importStatus = element("p", "Choose an exported library JSON to preview it.");
    importStatus.className = "status-box";
    const importPreviewPanel = element("div");
    importPreviewPanel.className = "details-content";
    const renderImportPreview = () => {
        importPreviewPanel.replaceChildren();
        if (!pendingImport || !pendingImportAnalysis) {
            importPreviewPanel.append(element("p", "No import file preview available."));
            return;
        }
        const categories = pendingImport.metadata?.categories || [];
        importPreviewPanel.append(
            element("p", `New library: ${pendingImport.metadata?.name || "Imported Engineering Library"}. ${pendingImport.objects.length} object(s), ${pendingImportAnalysis.dependencies.length} dependency object(s).`),
            element("p", `Categories: ${categories.length ? categories.join(", ") : "General"}.`),
        );
        const table = document.createElement("table");
        table.className = "management-table";
        table.innerHTML = "<thead><tr><th>Status</th><th>Name</th><th>Type</th><th>Version</th><th>Category</th></tr></thead>";
        const body = document.createElement("tbody");
        for (const item of pendingImportAnalysis.plan) {
            const row = document.createElement("tr");
            for (const value of ["NEW", item.name, typeLabel(item.object_type), item.version, item.category]) {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.append(cell);
            }
            body.append(row);
        }
        table.append(body);
        importPreviewPanel.append(table);
    };
    const importApply = actionButton("Import as new library", async () => {
        try {
            if (!pendingImport) throw Error("Preview a library file first.");
            const name = String(pendingImport.metadata?.name || "Imported Engineering Library").trim() || "Imported Engineering Library";
            if (!confirm(`Create local library \"${name}\" with ${pendingImport.objects.length} validated object(s)?`)) return;
            const imported = await createLibraryWithObjects(pendingImport.metadata, pendingImport.objects);
            library = imported.library;
            pendingImport = null;
            pendingImportAnalysis = null;
            importApply.disabled = true;
            await refresh();
            renderImportPreview();
            importStatus.classList.remove("error");
            importStatus.textContent = `Library ${library.name} imported atomically with ${imported.objects.length} object(s).`;
        } catch (error) {
            importStatus.classList.add("error");
            importStatus.textContent = error.message;
        }
    }, true);
    importApply.disabled = true;
    importFile.addEventListener("change", async () => {
        try {
            pendingImport = parsePackage(await importFile.files[0].text());
            const analysis = analyzeDependencies(pendingImport.objects.map(item => item.id), pendingImport.objects);
            if (analysis.missing.length) throw Error(`Import blocked: missing UDT definition(s): ${analysis.missing.join(", ")}.`);
            const importedName = String(pendingImport.metadata?.name || "Imported Engineering Library").trim() || "Imported Engineering Library";
            const names = await listLibraries();
            if (names.some(item => normalizeLibraryName(item.name) === normalizeLibraryName(importedName))) {
                throw Error(`A library named \"${importedName}\" already exists. Rename the source library before importing it.`);
            }
            pendingImportAnalysis = analysis;
            importApply.disabled = false;
            importStatus.classList.remove("error");
            importStatus.textContent = `Preview: ${pendingImport.objects.length} validated object(s), ${analysis.dependencies.length} dependency object(s). A separate library will be created.`;
            renderImportPreview();
        } catch (error) {
            pendingImport = null;
            pendingImportAnalysis = null;
            importApply.disabled = true;
            importStatus.classList.add("error");
            importStatus.textContent = error.message;
            renderImportPreview();
        }
    });
    importContent.append(
        element("p", "FROM: a JSON file exported on another computer. TO: a NEW local Engineering Library (IndexedDB) in this browser. This import currently loads all objects together; existing libraries are not overwritten. No TIA Portal operations."),
        importFile, importApply, importStatus, importPreviewPanel
    );
    renderExportPreview();
    renderImportPreview();

    const backup = element("div");
    backup.className = "card";
    backup.append(element("h3", "Project Backup"), element("p", "Exports portable local configuration. TIA binding and HMI run state are never restored."));
    const backupSections = [
        ["plc_family", "PLC family"], ["udts", "UDTs"], ["dbs", "Data Blocks"],
        ["templates", "Device Templates"], ["groups", "Device Groups"],
        ["mappings", "I/O mappings"], ["mapping_mode", "Mapping mode"],
    ];
    const selectedBackupSections = new Set(PROJECT_BACKUP_SECTIONS);
    const backupSelection = element("fieldset");
    backupSelection.append(element("legend", "Selected project data (partial backup)"));
    for (const [key, label] of backupSections) {
        const labelNode = element("label");
        const check = document.createElement("input");
        check.type = "checkbox";
        check.checked = true;
        check.addEventListener("change", () => {
            check.checked ? selectedBackupSections.add(key) : selectedBackupSections.delete(key);
        });
        labelNode.append(check, document.createTextNode(` ${label}`));
        backupSelection.append(labelNode);
    }
    const backupFile = document.createElement("input");
    backupFile.type = "file";
    backupFile.accept = ".json,application/json";
    const backupStatus = element("p", "Choose a project backup JSON to preview.");
    backupStatus.className = "status-box";
    const backupPreviewPanel = element("div");
    backupPreviewPanel.className = "details-content";
    const backupSectionsOf = data => Array.isArray(data?.metadata?.sections)
        ? data.metadata.sections.filter(section => PROJECT_BACKUP_SECTIONS.includes(section))
        : PROJECT_BACKUP_SECTIONS;
    const renderBackupPreview = () => {
        backupPreviewPanel.replaceChildren();
        if (!backupPreview) {
            backupPreviewPanel.append(element("p", "No project backup preview available."));
            return;
        }
        const counts = projectCounts(backupPreview.project);
        const sections = backupSectionsOf(backupPreview);
        backupPreviewPanel.append(
            element("p", `Included sections: ${sections.join(", ")}.`),
            element("p", `${counts.udts} UDT, ${counts.dbs} DB, ${counts.templates} templates, ${counts.groups} groups and ${counts.mappings} mappings.`),
            element("p", backupPreview.metadata?.partial ? "Partial backup: Replace is unavailable; use Merge for safe additions." : "Full backup: Replace or Merge is available."),
        );
    };
    const restore = actionButton("Replace project from backup", async () => {
        try {
            if (!backupPreview) throw Error("Preview a project backup first.");
            if (backupPreview.metadata?.partial) throw Error("A partial backup cannot replace a complete project. Use Merge instead.");
            if (!confirm("Replace current project configuration? A recovery snapshot will be created first.")) return;
            await createSnapshot("Before project backup restore", projectConfig, getActiveProjectProfileId());
            replaceProjectConfig(backupPreview.project);
            refreshProject();
            await renderSnapshots();
            backupStatus.textContent = "Backup restored. Select and verify a TIA target before any TIA import.";
        } catch (error) { backupStatus.classList.add("error"); backupStatus.textContent = error.message; }
    }, true);
    const merge = actionButton("Merge safe additions", async () => {
        try {
            if (!backupPreview) throw Error("Preview a project backup first.");
            const sections = backupSectionsOf(backupPreview);
            if (!confirm("Merge only missing project objects? Existing objects will never be overwritten. A snapshot will be created first.")) return;
            await createSnapshot("Before project backup merge", projectConfig, getActiveProjectProfileId());
            const result = mergeProjectBackup(backupPreview.project, sections);
            refreshProject();
            await renderSnapshots();
            backupStatus.classList.remove("error");
            backupStatus.textContent = `Merged ${result.added} missing item(s); ${result.skipped} existing item(s) were unchanged.${result.plc_skipped ? " The existing PLC family was retained." : ""} Select and verify a TIA target before any import.`;
        } catch (error) { backupStatus.classList.add("error"); backupStatus.textContent = error.message; }
    }, true);
    restore.disabled = true;
    merge.disabled = true;
    backupFile.addEventListener("change", async () => {
        try {
            const data = JSON.parse(await backupFile.files[0].text());
            if (data?.format !== "TIAEngineeringAssistant" || data?.schema_version !== 1 || data?.kind !== "project_backup" || !data.project || typeof data.project !== "object") throw Error("Unsupported project backup format.");
            backupPreview = data;
            restore.disabled = data.metadata?.partial === true;
            merge.disabled = false;
            backupStatus.classList.remove("error");
            backupStatus.textContent = "Backup preview is ready. No project data has changed.";
            renderBackupPreview();
        } catch (error) {
            backupPreview = null;
            restore.disabled = true;
            merge.disabled = true;
            backupStatus.classList.add("error");
            backupStatus.textContent = error.message;
            renderBackupPreview();
        }
    });
    backup.append(
        actionButton("Save full project backup", async () => {
            await downloadJson("TIAEngineeringAssistant-project-backup.json", {
                format: "TIAEngineeringAssistant",
                schema_version: 1,
                kind: "project_backup",
                metadata: {created_at: new Date().toISOString(), sections: PROJECT_BACKUP_SECTIONS, partial: false},
                project: projectPackage(),
            });
        }, true),
        actionButton("Save selected project data", async () => {
            if (!selectedBackupSections.size) throw Error("Select at least one project-data section.");
            await downloadJson("TIAEngineeringAssistant-project-selection.json", {
                format: "TIAEngineeringAssistant",
                schema_version: 1,
                kind: "project_backup",
                metadata: {created_at: new Date().toISOString(), sections: [...selectedBackupSections], partial: true},
                project: projectPackage([...selectedBackupSections]),
            });
        }),
        backupSelection,
        backupFile,
        restore,
        merge,
        backupStatus,
        backupPreviewPanel,
    );
    renderBackupPreview();

    const recovery = element("div");
    recovery.className = "card";
    recovery.append(element("h3", "Recovery snapshots"));
    const snapshotDetails = element("details");
    snapshotDetails.className = "library-category-manager";
    const snapshotSummary = element("summary", "Saved snapshots");
    const snapshots = element("div", "Loading snapshots…");
    snapshotDetails.append(snapshotSummary, snapshots);
    const renderSnapshots = async () => {
        snapshots.replaceChildren();
        const entries = (await listSnapshots()).filter(item => (item.profile_id || "default") === getActiveProjectProfileId()).sort((left, right) => right.created_at.localeCompare(left.created_at));
        snapshotSummary.textContent = `Saved snapshots (${entries.length})`;
        if (!entries.length) snapshots.append(element("p", "No local snapshots yet."));
        for (const snapshot of entries) {
            const row = element("div");
            row.className = "action-row";
            const counts = projectCounts(snapshot.project);
            row.append(
                element("span", `${new Date(snapshot.created_at).toLocaleString()}: ${snapshot.reason} (${counts.udts} UDT, ${counts.dbs} DB, ${counts.templates} templates)`),
                actionButton("Preview", () => {
                    backupPreview = {format: "TIAEngineeringAssistant", schema_version: 1, kind: "project_backup", metadata: {sections: PROJECT_BACKUP_SECTIONS, partial: false}, project: snapshot.project};
                    restore.disabled = false;
                    merge.disabled = false;
                    backupStatus.classList.remove("error");
                    backupStatus.textContent = `Previewing snapshot from ${new Date(snapshot.created_at).toLocaleString()}.`;
                    renderBackupPreview();
                }),
                actionButton("Export", async () => {
                    await downloadJson(`TIAEngineeringAssistant-snapshot-${snapshot.id}.json`, {
                        format: "TIAEngineeringAssistant", schema_version: 1, kind: "project_backup",
                        metadata: {created_at: snapshot.created_at, sections: PROJECT_BACKUP_SECTIONS, partial: false, snapshot_reason: snapshot.reason},
                        project: snapshot.project,
                    });
                }),
                actionButton("Restore", async () => {
                    if (!confirm("Restore this snapshot? The current configuration will be snapshotted first.")) return;
                    const source = await getSnapshot(snapshot.id);
                    if ((source?.profile_id || "default") !== getActiveProjectProfileId()) throw Error("Snapshot belongs to another project profile.");
                    await createSnapshot("Before snapshot restore", projectConfig, getActiveProjectProfileId());
                    replaceProjectConfig(source.project);
                    refreshProject();
                    await renderSnapshots();
                }),
            );
            snapshots.append(row);
        }
    };
    recovery.append(
        actionButton("Create snapshot", async () => {
            const reason = prompt("Snapshot reason:", "Manual project snapshot");
            if (reason === null) return;
            await createSnapshot(reason, projectConfig, getActiveProjectProfileId());
            await renderSnapshots();
        }, true),
        actionButton("Refresh snapshots", () => renderSnapshots().catch(error => {
            snapshots.replaceChildren(element("p", `Cannot load snapshots: ${error.message}`));
        })),
        snapshotDetails,
    );

    root.replaceChildren(profilesCard, libraryCard, transfer, backup, recovery);
    // Open IndexedDB and read its initial content in sequence. This avoids a
    // cold-start race with the category controls in app.js.
    const ready = (async () => {
        try {
            await refresh();
        } catch (error) {
            showStatus(error.message, true);
        }
        try {
            await renderSnapshots();
        } catch (error) {
            snapshots.replaceChildren(element("p", `Cannot load snapshots: ${error.message}`));
        }
    })();
    return {refresh, ready};
}
