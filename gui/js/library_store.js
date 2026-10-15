/* Local, portable engineering-library persistence. No TIA/API calls. */
import {isBuiltInSystemType} from "./plc-types.js";

export const LIBRARY_SCHEMA_VERSION = 1;
export const LIBRARY_CATEGORIES = ["Motors & Drives", "Pneumatics", "Hydraulics", "Safety", "Analog Signals", "Communication", "Diagnostics & Alarms", "General"];
const DB_NAME = "tiaEngineeringAssistant.libraries";
const DB_VERSION = 2;
const TYPES = new Set(["udt", "db", "device_template"]);
function typeLabel(type) { return type === "udt" ? "UDT" : type === "db" ? "Data Block" : "Device Template"; }
const MAX_JSON_BYTES = 10 * 1024 * 1024;

function id(prefix = "lib") {
    return (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`)
        .replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64).replace(/^/, `${prefix}-`);
}
function text(value, max = 5000) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export function normalizeLibraryName(value) {
    return text(value, 128).toLocaleLowerCase();
}
export function normalizeCategoryName(value) {
    return text(value, 128).toLocaleLowerCase();
}
function bool(value) { return value === true ? true : value === false ? false : null; }
function plain(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function jsonClone(value) { return JSON.parse(JSON.stringify(value)); }
function member(input, depth = 0) {
    if (!plain(input) || depth > 20) throw Error("Invalid or excessively nested member structure.");
    const name = text(input.name, 128), dataType = text(input.data_type, 128);
    if (!name || !dataType) throw Error("Each member needs a name and data type.");
    const result = {name, data_type: dataType};
    for (const key of ["comment", "start_value", "array_element_type"]) {
        if (input[key] != null) result[key] = text(input[key], 5000);
    }
    for (const key of ["hmi_visible", "hmi_accessible", "hmi_writable", "retain"]) {
        const value = bool(input[key]); if (value !== null) result[key] = value;
    }
    if (dataType === "Array") {
        if (!Number.isInteger(input.array_lower_bound) || !Number.isInteger(input.array_upper_bound)
            || input.array_upper_bound < input.array_lower_bound || !result.array_element_type) {
            throw Error(`Invalid Array bounds or element type for ${name}.`);
        }
        result.array_lower_bound = input.array_lower_bound;
        result.array_upper_bound = input.array_upper_bound;
    }
    if (dataType === "Struct") {
        if (!Array.isArray(input.struct_members) || !input.struct_members.length) throw Error(`Struct ${name} has no members.`);
        result.struct_members = input.struct_members.map(item => member(item, depth + 1));
    }
    return result;
}
function members(items) {
    if (!Array.isArray(items) || items.length > 10000) throw Error("Invalid member list.");
    const result = items.map(item => member(item));
    const names = new Set();
    for (const item of result) { const key = item.name.toLocaleLowerCase(); if (names.has(key)) throw Error(`Duplicate member: ${item.name}.`); names.add(key); }
    return result;
}
export function sanitizeLibraryObject(input, libraryId = "") {
    if (!plain(input) || !TYPES.has(input.object_type)) throw Error("Unsupported library object type.");
    const name = text(input.name, 128); if (!name) throw Error("Library object name is required.");
    const object = {id: text(input.id, 96) || id("object"), library_id: libraryId || text(input.library_id, 96), name,
        object_type: input.object_type, version: text(input.version, 32) || "1.0.0",
        // A category is ordinary local metadata. Keep a user-defined value too;
        // the built-in category list is only a UI convenience, not a whitelist.
        description: text(input.description), category: text(input.category, 128) || "General",
        tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(tag => text(tag, 64)).filter(Boolean))].slice(0, 50) : [],
        author: text(input.author, 256), manufacturer: text(input.manufacturer, 256), source_project: text(input.source_project, 256),
        tia_version: text(input.tia_version, 64), compatible_plc_families: Array.isArray(input.compatible_plc_families) ? input.compatible_plc_families.map(x => text(x, 64)).filter(Boolean).slice(0, 30) : []};
    if (object.object_type === "udt") object.payload = {name, fields: members(input.payload?.fields ?? input.fields ?? [])};
    if (object.object_type === "db") object.payload = {name, retain: input.payload?.retain === true || input.retain === true, members: members(input.payload?.members ?? input.members ?? [])};
    if (object.object_type === "device_template") {
        const signals = input.payload?.signals ?? input.signals ?? [];
        if (!Array.isArray(signals) || signals.length > 10000) throw Error("Invalid device template signals.");
        object.payload = {id: text(input.payload?.id ?? input.id, 96) || id("template"), name, signals: signals.map(signal => {
            if (!plain(signal)) throw Error("Invalid device signal.");
            return {id: text(signal.id, 96) || id("signal"), key: text(signal.key, 128), tag_pattern: text(signal.tag_pattern, 512),
                io_type: ["Input", "Output", "Internal"].includes(signal.io_type) ? signal.io_type : "Internal", data_type: text(signal.data_type, 128) || "Bool"};
        })};
    }
    return object;
}
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
}
export async function contentHash(value) {
    const raw = new TextEncoder().encode(JSON.stringify(canonical(value)));
    const digest = await crypto.subtle.digest("SHA-256", raw);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
function revisionSnapshot(item) {
    const {versions, ...snapshot} = item;
    return jsonClone(snapshot);
}
function revisionRecord(item, createdAt, changelog = "") {
    return {
        version: item.version,
        created_at: createdAt,
        changelog: text(changelog, 2000),
        content_hash: item.content_hash,
        snapshot: revisionSnapshot(item),
    };
}
function normalizedRevision(record, item) {
    if (record?.snapshot) return record;
    // Compatibility for objects stored before immutable revision snapshots.
    return {
        version: record?.version || item.version,
        created_at: record?.created_at || item.modified_at || item.created_at,
        changelog: record?.changelog || "",
        content_hash: record?.content_hash || item.content_hash,
        snapshot: {...revisionSnapshot(item), version: record?.version || item.version, payload: jsonClone(record?.payload || item.payload)},
    };
}
function metadataPatch(item, patch) {
    return {
        ...item,
        description: text(patch?.description),
        category: text(patch?.category, 128) || "General",
        tags: Array.isArray(patch?.tags)
            ? [...new Set(patch.tags.map(tag => text(tag, 64)).filter(Boolean))].slice(0, 50)
            : [],
        author: text(patch?.author, 256),
        manufacturer: text(patch?.manufacturer, 256),
        tia_version: text(patch?.tia_version, 64),
        compatible_plc_families: Array.isArray(patch?.compatible_plc_families)
            ? patch.compatible_plc_families.map(value => text(value, 64)).filter(Boolean).slice(0, 30)
            : [],
        modified_at: new Date().toISOString(),
    };
}
function rewriteMemberReferences(items, oldName, newName) {
    let changed = false;
    const oldKey = String(oldName).toLocaleLowerCase();
    const rewrite = item => {
        const next = jsonClone(item);
        for (const key of ["data_type", "array_element_type"]) {
            if (String(next[key] || "").toLocaleLowerCase() === oldKey) {
                next[key] = newName;
                changed = true;
            }
        }
        if (Array.isArray(next.struct_members)) next.struct_members = next.struct_members.map(rewrite);
        return next;
    };
    return {items: (items || []).map(rewrite), changed};
}
export function renameTypeReferencesInPayload(objectType, payload, oldName, newName) {
    const key = objectType === "udt" ? "fields" : objectType === "db" ? "members" : "";
    if (!key) return {payload: jsonClone(payload), changed: false};
    const rewritten = rewriteMemberReferences(payload?.[key], oldName, newName);
    return {payload: {...jsonClone(payload), [key]: rewritten.items}, changed: rewritten.changed};
}
function automaticReferenceVersion(item, sequence) {
    const core = text(item.version, 32).split(/[+-]/, 1)[0] || "1.0.0";
    return `${core}+reference-${Date.now()}-${sequence}`;
}
function memberMap(items, prefix = "", output = new Map()) {
    for (const item of items || []) {
        const path = prefix ? `${prefix}.${item.name}` : item.name;
        output.set(path, item);
        memberMap(item.struct_members, path, output);
    }
    return output;
}
export function compareRevisionSnapshots(left, right) {
    const leftPayload = left?.snapshot?.payload || left?.payload || {};
    const rightPayload = right?.snapshot?.payload || right?.payload || {};
    if (!Array.isArray(leftPayload.fields || leftPayload.members) || !Array.isArray(rightPayload.fields || rightPayload.members)) {
        return [{path: "Definition", change: "Changed", detail: "Non-PLC member payload changed."}];
    }
    const leftMembers = memberMap(leftPayload.fields || leftPayload.members);
    const rightMembers = memberMap(rightPayload.fields || rightPayload.members);
    const changes = [];
    for (const path of new Set([...leftMembers.keys(), ...rightMembers.keys()])) {
        const before = leftMembers.get(path), after = rightMembers.get(path);
        if (!before) { changes.push({path, change: "Added", detail: after.data_type}); continue; }
        if (!after) { changes.push({path, change: "Removed", detail: before.data_type}); continue; }
        const details = [];
        for (const key of ["data_type", "array_element_type", "array_lower_bound", "array_upper_bound", "start_value", "comment"]) {
            if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) details.push(key.replaceAll("_", " "));
        }
        if (details.length) changes.push({path, change: "Changed", detail: details.join(", ")});
    }
    return changes;
}
function referencesInMembers(items, names, output) {
    for (const item of items || []) {
        for (const kind of [item.data_type, item.array_element_type]) {
            const match = names.get(String(kind || "").toLocaleLowerCase()); if (match) output.add(match.id);
        }
        referencesInMembers(item.struct_members, names, output);
    }
}
export function resolveDependencies(objects) {
    // A member data type can reference a UDT, never a DB or a device template.
    // Restricting this lookup prevents a same-named DB from shadowing a UDT.
    const names = new Map(objects.filter(item => item.object_type === "udt")
        .map(item => [item.name.toLocaleLowerCase(), item]));
    return new Map(objects.map(item => {
        const dependencies = new Set();
        if (item.object_type === "udt") referencesInMembers(item.payload.fields, names, dependencies);
        if (item.object_type === "db") referencesInMembers(item.payload.members, names, dependencies);
        dependencies.delete(item.id); return [item.id, [...dependencies]];
    }));
}
export function dependencyPlan(selectedIds, objects) {
    const byId = new Map(objects.map(item => [item.id, item])); const graph = resolveDependencies(objects); const included = new Set(); const visiting = new Set(); const ordered = [];
    function visit(objectId) { if (included.has(objectId)) return; if (visiting.has(objectId)) throw Error("Circular library dependency."); const item = byId.get(objectId); if (!item) throw Error("Missing library dependency."); visiting.add(objectId); for (const child of graph.get(objectId) || []) visit(child); visiting.delete(objectId); included.add(objectId); ordered.push(item); }
    for (const objectId of selectedIds) visit(objectId); return ordered;
}
function findMissingReferences(items, knownTypes, missing) {
    for (const item of items || []) {
        for (const dataType of [item.data_type, item.array_element_type]) {
            const raw = String(dataType || "").trim();
            const key = raw.toLocaleLowerCase();
            if (raw && !isBuiltInSystemType(key) && !["any", "variant", "void", "array", "struct"].includes(key)
                && !knownTypes.has(key)) missing.add(raw);
        }
        findMissingReferences(item.struct_members, knownTypes, missing);
    }
}
export function analyzeDependencies(selectedIds, objects) {
    const plan = dependencyPlan(selectedIds, objects);
    const knownTypes = new Map(objects.filter(item => item.object_type === "udt")
        .map(item => [item.name.toLocaleLowerCase(), item]));
    const missing = new Set();
    for (const item of plan) {
        if (item.object_type === "udt") findMissingReferences(item.payload.fields, knownTypes, missing);
        if (item.object_type === "db") findMissingReferences(item.payload.members, knownTypes, missing);
    }
    return {
        plan,
        dependencies: plan.filter(item => !selectedIds.includes(item.id)),
        missing: [...missing].sort((left, right) => left.localeCompare(right)),
    };
}

/**
 * Read-only import plan. Decisions are indexed by source object ID.
 * Conflicts require an explicit resolution. Dependencies are included before
 * dependants and a renamed UDT is rewritten throughout the imported subset.
 */
export function planSelectiveLibraryImport(selectedIds, sourceObjects, targetObjects = [], decisions = {}) {
    if (!Array.isArray(selectedIds) || !selectedIds.length) throw Error("Select at least one object to import.");
    const selected = [...new Set(selectedIds)];
    const analysis = analyzeDependencies(selected, sourceObjects);
    if (analysis.missing.length) throw Error("Missing source dependency: " + analysis.missing.join(", "));
    const targets = new Map(targetObjects.map(item => [item.object_type + ":" + item.name.toLocaleLowerCase(), item]));
    const names = new Set(targets.keys());
    const importedIds = new Set(analysis.plan.map(item => item.id));
    const renamed = new Map();
    const rows = [];
    for (const source of analysis.plan) {
        const key = source.object_type + ":" + source.name.toLocaleLowerCase();
        const target = targets.get(key) || null;
        const same = target && JSON.stringify(canonical(target.payload)) === JSON.stringify(canonical(source.payload));
        const choice = decisions[source.id] || {};
        let action = target ? (same ? "skip" : (choice.action || "unresolved")) : "add";
        const allowed = ["skip", "keep", "rename", "version", "replace"];
        if (target && !same && !allowed.includes(action) && action !== "unresolved") throw Error("Unknown import conflict resolution.");
        if (!target && choice.action && choice.action !== "add") throw Error("Resolution specified for a new object: " + source.name);
        let name = source.name;
        let version = source.version;
        if (action === "rename") {
            name = text(choice.name, 128);
            if (!name || name.toLocaleLowerCase() === source.name.toLocaleLowerCase()) {
                throw Error("Provide a different name for imported " + source.name + ".");
            }
            if (source.object_type === "udt") renamed.set(source.name.toLocaleLowerCase(), name);
        }
        if (action === "version" || action === "replace") {
            version = text(choice.version, 32);
            if (!SEMVER.test(version)) throw Error("Provide a valid SemVer version for " + source.name + ".");
            if ((target.versions || []).some(v => v.version === version) || target.version === version) {
                throw Error("Version " + version + " already exists for " + source.name + ".");
            }
        }
        const destinationKey = source.object_type + ":" + name.toLocaleLowerCase();
        if (action === "add" || action === "rename") {
            if (names.has(destinationKey)) throw Error("Import name collision: " + name + ".");
            names.add(destinationKey);
        }
        rows.push({source, target, action, name, version, is_dependency: !selected.includes(source.id)});
    }
    const candidates = rows.filter(row => ["add", "rename", "version", "replace"].includes(row.action))
        .map(row => {
            let payload = jsonClone(row.source.payload);
            for (const [oldName, newName] of renamed) {
                payload = renameTypeReferencesInPayload(row.source.object_type, payload, oldName, newName).payload;
            }
            payload.name = row.name;
            return {...row, payload};
        });
    // Missing dependencies may be provided by an existing destination library,
    // but never by an object which will be skipped without being present.
    const destinationTypes = new Map(targetObjects.filter(item => item.object_type === "udt")
        .map(item => [item.name.toLocaleLowerCase(), item]));
    for (const candidate of candidates.filter(item => item.source.object_type === "udt")) {
        destinationTypes.set(candidate.name.toLocaleLowerCase(), candidate);
    }
    const missing = new Set();
    for (const row of candidates) {
        if (row.source.object_type === "udt") findMissingReferences(row.payload.fields, destinationTypes, missing);
        if (row.source.object_type === "db") findMissingReferences(row.payload.members, destinationTypes, missing);
    }
    if (missing.size) throw Error("Import would leave missing UDT references: " + [...missing].join(", "));
    // Detect cycles involving imported UDTs and already-existing target UDTs.
    const proposed = targetObjects.map(item => {
        const update = candidates.find(row => row.target && row.target.id === item.id &&
            (row.action === "version" || row.action === "replace"));
        return update ? {...item, payload: update.payload} : item;
    });
    for (const row of candidates.filter(item => !item.target || item.action === "rename")) {
        const freshId = "import-preview-" + row.source.id;
        proposed.push({...row.source, id: freshId, name: row.name, payload: row.payload});
    }
    const proposedImports = candidates.map(row => row.target && (row.action === "version" || row.action === "replace")
        ? row.target.id : "import-preview-" + row.source.id);
    // A missing source dependency is checked above; the proposed model checks
    // the destination graph after all approved renames/replacements.
    dependencyPlan(proposedImports, proposed);
    return {rows, candidates, dependencies: analysis.dependencies, unresolved: rows.filter(row => row.action === "unresolved")};
}

function request(value) { return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error || Error("IndexedDB operation failed.")); }); }
function transactionDone(tx) { return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error || Error("IndexedDB transaction failed.")); }); }
let database;
let databaseOpening;
let libraryWrite = Promise.resolve();
let categoryWrite = Promise.resolve();

function serializeLibraryWrite(work) {
    const result = libraryWrite.then(work, work);
    // Keep the serialization chain usable after a rejected create/import.
    libraryWrite = result.catch(() => undefined);
    return result;
}

function serializeCategoryWrite(work) {
    const result = categoryWrite.then(work, work);
    categoryWrite = result.catch(() => undefined);
    return result;
}

async function requireAvailableLibraryName(name, exceptId = "") {
    const db = await openLibraryStore();
    const tx = db.transaction("libraries", "readonly");
    const key = normalizeLibraryName(name);
    const existing = await request(tx.objectStore("libraries").getAll());
    if (existing.some(item => item.id !== exceptId && normalizeLibraryName(item.name) === key)) {
        throw Error(`A library named "${name}" already exists. Choose a different name.`);
    }
}

export function openLibraryStore() {
    if (database) return Promise.resolve(database);
    if (!databaseOpening) {
        const opening = new Promise((resolve, reject) => {
            const open = indexedDB.open(DB_NAME, DB_VERSION);
            open.onupgradeneeded = () => { const db = open.result;
                if (!db.objectStoreNames.contains("libraries")) db.createObjectStore("libraries", {keyPath: "id"});
                if (!db.objectStoreNames.contains("objects")) { const store = db.createObjectStore("objects", {keyPath: "id"}); store.createIndex("library_id", "library_id"); }
                if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", {keyPath: "id"});
                if (!db.objectStoreNames.contains("categories")) {
                    const categories = db.createObjectStore("categories", {keyPath: "key"});
                    for (const name of LIBRARY_CATEGORIES) {
                        categories.add({key: normalizeCategoryName(name), name, built_in: true});
                    }
                }
            };
            open.onsuccess = () => resolve(open.result);
            open.onerror = () => reject(open.error || Error("Cannot open local library storage."));
            open.onblocked = () => reject(Error("Library storage upgrade is blocked by another open application tab. Close that tab and refresh."));
        });
        // Every caller receives this one settled promise. Clearing a shared
        // opening promise from each caller caused a cold-start race between
        // categories, libraries and recovery snapshots.
        databaseOpening = opening.then(db => {
            database = db;
            database.onversionchange = () => {
                database.close();
                database = undefined;
            };
            return database;
        });
        databaseOpening.finally(() => {
            databaseOpening = undefined;
        }).catch(() => undefined);
    }
    return databaseOpening;
}
export async function listLibraries() { const db = await openLibraryStore(); const tx = db.transaction("libraries", "readonly"); return request(tx.objectStore("libraries").getAll()); }
export async function listCategories() {
    const db = await openLibraryStore();
    const tx = db.transaction("categories", "readonly");
    const categories = await request(tx.objectStore("categories").getAll());
    return categories.sort((left, right) => left.name.localeCompare(right.name));
}
export async function createCategory(name) {
    const clean = text(name, 128);
    const key = normalizeCategoryName(clean);
    if (!clean) throw Error("Category name is required.");
    return serializeCategoryWrite(async () => {
        const db = await openLibraryStore();
        const tx = db.transaction("categories", "readwrite");
        const store = tx.objectStore("categories");
        if (await request(store.get(key))) {
            tx.abort();
            throw Error(`Category "${clean}" already exists.`);
        }
        const category = {key, name: clean, built_in: false};
        store.add(category);
        await transactionDone(tx);
        return category;
    });
}
export async function deleteCategory(key) {
    return serializeCategoryWrite(async () => {
        const db = await openLibraryStore();
        const tx = db.transaction(["categories", "objects"], "readwrite");
        const categoryStore = tx.objectStore("categories");
        const category = await request(categoryStore.get(key));
        if (!category) {
            tx.abort();
            throw Error("Category not found.");
        }
        if (category.built_in) {
            tx.abort();
            throw Error("Built-in categories cannot be deleted.");
        }
        const objects = await request(tx.objectStore("objects").getAll());
        if (objects.some(item => normalizeCategoryName(item.category) === key)) {
            tx.abort();
            throw Error(`Category "${category.name}" is still used by library objects.`);
        }
        categoryStore.delete(key);
        await transactionDone(tx);
    });
}
export async function createLibrary(name) {
    return serializeLibraryWrite(async () => {
        const db = await openLibraryStore();
        const library = {id: id("library"), name: text(name, 128) || "Engineering Library", description: "", created_at: new Date().toISOString(), modified_at: new Date().toISOString()};
        await requireAvailableLibraryName(library.name);
        const tx = db.transaction("libraries", "readwrite");
        tx.objectStore("libraries").add(library);
        await transactionDone(tx);
        return library;
    });
}
export async function renameLibrary(libraryId, name) {
    const clean = text(name, 128);
    if (!clean) throw Error("Library name is required.");
    return serializeLibraryWrite(async () => {
        const db = await openLibraryStore();
        const read = db.transaction("libraries", "readonly");
        const library = await request(read.objectStore("libraries").get(libraryId));
        if (!library) throw Error("Library not found.");
        await requireAvailableLibraryName(clean, libraryId);
        const renamed = {...library, name: clean, modified_at: new Date().toISOString()};
        const tx = db.transaction("libraries", "readwrite");
        tx.objectStore("libraries").put(renamed);
        await transactionDone(tx);
        return renamed;
    });
}
export async function createLibraryWithObjects(metadata, inputs) {
    return serializeLibraryWrite(async () => {
        const db = await openLibraryStore(); const now = new Date().toISOString();
        const library = {id: id("library"), name: text(metadata?.name, 128) || "Imported Engineering Library",
            description: text(metadata?.description), created_at: now, modified_at: now};
        await requireAvailableLibraryName(library.name);
        const objects = await Promise.all(inputs.map(async raw => {
            const item = sanitizeLibraryObject({...raw, id: id("object")}, library.id); if (item.object_type === "device_template") item.payload.id = item.id; item.content_hash = await contentHash(item.payload);
            item.created_at = raw.created_at || now; item.modified_at = now;
        item.versions = Array.isArray(raw.versions) && raw.versions.length
            ? raw.versions.map(version => normalizedRevision(version, item))
            : [revisionRecord(item, now)];
            return item;
        }));
        const names = new Set();
        for (const item of objects) { const key = `${item.object_type}:${item.name.toLocaleLowerCase()}`;
            if (names.has(key)) throw Error(`Duplicate imported object: ${item.name}.`); names.add(key); }
        // Library metadata, its objects and imported category definitions commit
        // together. A failed import therefore cannot leave a partial library.
        const tx = db.transaction(["libraries", "objects", "categories"], "readwrite");
        const categoryStore = tx.objectStore("categories");
        const categoryNames = [...new Set([
            ...(Array.isArray(metadata?.categories) ? metadata.categories : []),
            ...objects.map(item => item.category),
        ].map(value => text(value, 128)).filter(Boolean))];
        const knownCategories = new Set((await request(categoryStore.getAll())).map(item => item.key));
        for (const name of categoryNames) {
            const key = normalizeCategoryName(name);
            if (!knownCategories.has(key)) {
                categoryStore.add({key, name, built_in: false});
                knownCategories.add(key);
            }
        }
        tx.objectStore("libraries").add(library);
        for (const item of objects) tx.objectStore("objects").add(item);
        await transactionDone(tx); return {library, objects};
    });
}

/**
 * Import into an existing library as one IndexedDB transaction. All hashing
 * and graph validation finish before the write transaction begins.
 */
export async function applySelectiveLibraryImport(libraryId, selectedIds, sourceObjects, decisions = {}) {
    return serializeLibraryWrite(async () => {
        const db = await openLibraryStore();
        const existingTx = db.transaction(["libraries", "objects"], "readonly");
        const library = await request(existingTx.objectStore("libraries").get(libraryId));
        if (!library) throw Error("Destination library no longer exists.");
        const before = await request(existingTx.objectStore("objects").index("library_id").getAll(libraryId));
        const plan = planSelectiveLibraryImport(selectedIds, sourceObjects, before, decisions);
        if (plan.unresolved.length) throw Error("Resolve all import conflicts before confirming.");
        const now = new Date().toISOString();
        const written = [];
        for (const row of plan.candidates) {
            const validated = sanitizeLibraryObject({
                ...row.source, name: row.name, payload: row.payload,
                id: (row.action === "replace" || row.action === "version") ? row.target.id : id("object"),
            }, libraryId);
            validated.payload.name = validated.name;
            if (validated.object_type === "device_template") validated.payload.id = validated.id;
            validated.content_hash = await contentHash(validated.payload);
            if (row.action === "replace" || row.action === "version") {
                const old = row.target;
                validated.created_at = old.created_at;
                validated.modified_at = now;
                validated.version = row.version;
                validated.versions = [
                    ...(old.versions || []).map(entry => normalizedRevision(entry, old)),
                    revisionRecord(validated, now, row.action === "version" ? "Imported as new version." : "Explicitly replaced by library import."),
                ];
            } else {
                validated.created_at = now;
                validated.modified_at = now;
                validated.versions = [revisionRecord(validated, now, "Imported from portable library.")];
            }
            written.push(validated);
        }
        const tx = db.transaction(["libraries", "objects", "categories"], "readwrite");
        const store = tx.objectStore("objects");
        const current = await request(store.index("library_id").getAll(libraryId));
        const destination = await request(tx.objectStore("libraries").get(libraryId));
        if (!destination || JSON.stringify(before) !== JSON.stringify(current)) {
            tx.abort();
            throw Error("Destination library changed during import. Refresh preview before trying again.");
        }
        const catStore = tx.objectStore("categories");
        const known = new Set((await request(catStore.getAll())).map(item => item.key));
        for (const item of written) {
            const key = normalizeCategoryName(item.category);
            if (!known.has(key)) {
                catStore.add({key, name: item.category, built_in: false});
                known.add(key);
            }
            store.put(item);
        }
        if (written.length) tx.objectStore("libraries").put({...destination, modified_at: now});
        await transactionDone(tx);
        return {added: written.filter(item => !before.some(old => old.id === item.id)).length,
            revised: written.filter(item => before.some(old => old.id === item.id)).length,
            skipped: plan.rows.length - written.length,
            written};
    });
}

export async function deleteLibrary(libraryId) {
    const db = await openLibraryStore();
    const read = db.transaction("libraries", "readonly");
    if (!await request(read.objectStore("libraries").get(libraryId))) {
        throw Error("Library not found.");
    }
    const tx = db.transaction(["libraries", "objects"], "readwrite");
    const objectStore = tx.objectStore("objects");
    const cursor = objectStore.index("library_id").openKeyCursor(IDBKeyRange.only(libraryId));
    cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current) return;
        objectStore.delete(current.primaryKey);
        current.continue();
    };
    cursor.onerror = () => tx.abort();
    tx.objectStore("libraries").delete(libraryId);
    await transactionDone(tx);
}
export async function listLibraryObjects(libraryId) { const db = await openLibraryStore(); const tx = db.transaction("objects", "readonly"); return request(tx.objectStore("objects").index("library_id").getAll(libraryId)); }
export async function putLibraryObjects(libraryId, inputs, {skipConflicts = false} = {}) {
    const db = await openLibraryStore(); const existingTx = db.transaction("libraries", "readonly");
    const library = await request(existingTx.objectStore("libraries").get(libraryId));
    if (!library) throw Error("Library not found.");
    const now = new Date().toISOString();
    const candidates = await Promise.all(inputs.map(async raw => {
        const item = sanitizeLibraryObject({...raw, id: id("object")}, libraryId); if (item.object_type === "device_template") item.payload.id = item.id; item.content_hash = await contentHash(item.payload);
        item.created_at = raw.created_at || now; item.modified_at = now;
        item.versions = Array.isArray(raw.versions) && raw.versions.length
            ? raw.versions.map(version => normalizedRevision(version, item))
            : [revisionRecord(item, now)];
        return item;
    }));
    const byName = new Map((await listLibraryObjects(libraryId)).map(item => [`${item.object_type}:${item.name.toLocaleLowerCase()}`, item]));
    const added = [], skipped = [], conflicts = [];
    for (const item of candidates) {
        const key = `${item.object_type}:${item.name.toLocaleLowerCase()}`, found = byName.get(key);
        if (!found) { byName.set(key, item); added.push(item); continue; }
        if (found.content_hash === item.content_hash) { skipped.push(item); continue; }
        if (skipConflicts) { conflicts.push(item); continue; }
        throw Error(`${typeLabel(item.object_type)} "${item.name}" already exists with different content. Use versioning or import conflict resolution.`);
    }
    if (!added.length) return {added, skipped, conflicts};
    const tx = db.transaction(["objects", "libraries"], "readwrite");
    for (const item of added) tx.objectStore("objects").put(item);
    tx.objectStore("libraries").put({...library, modified_at: now}); await transactionDone(tx);
    return {added, skipped, conflicts};
}
export async function deleteLibraryObject(objectId) { const db = await openLibraryStore(); const tx = db.transaction("objects", "readwrite"); tx.objectStore("objects").delete(objectId); await transactionDone(tx); }
export async function duplicateLibraryObject(objectId, name) {
    const clean = text(name, 128);
    if (!clean) throw Error("Object name is required.");
    return serializeLibraryWrite(async () => {
        const db = await openLibraryStore();
        const read = db.transaction("objects", "readonly");
        const item = await request(read.objectStore("objects").get(objectId));
        if (!item) throw Error("Library object not found.");
        const siblings = await listLibraryObjects(item.library_id);
        if (siblings.some(candidate => candidate.id !== item.id && candidate.object_type === item.object_type
            && candidate.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) {
            throw Error(`${typeLabel(item.object_type)} "${clean}" already exists in this library.`);
        }
        const now = new Date().toISOString();
        const duplicate = jsonClone(item);
        duplicate.id = id("object");
        duplicate.name = clean;
        duplicate.version = "1.0.0";
        duplicate.created_at = now;
        duplicate.modified_at = now;
        duplicate.payload.name = clean;
        if (duplicate.object_type === "device_template") duplicate.payload.id = duplicate.id;
        duplicate.content_hash = await contentHash(duplicate.payload);
        duplicate.versions = [revisionRecord(duplicate, now, `Duplicated from ${item.name}.`)];
        const tx = db.transaction(["objects", "libraries"], "readwrite");
        tx.objectStore("objects").add(duplicate);
        const libraryStore = tx.objectStore("libraries");
        const library = await request(libraryStore.get(item.library_id));
        if (library) libraryStore.put({...library, modified_at: now});
        await transactionDone(tx);
        return duplicate;
    });
}
export async function renameLibraryObject(objectId, name, version, changelog = "") {
    const clean = text(name, 128);
    const requestedVersion = text(version, 32);
    if (!clean) throw Error("Object name is required.");
    if (!SEMVER.test(requestedVersion)) throw Error("Version must use semantic version format, for example 1.2.0.");
    return serializeLibraryWrite(async () => {
        const db = await openLibraryStore();
        const read = db.transaction("objects", "readonly");
        const item = await request(read.objectStore("objects").get(objectId));
        if (!item) throw Error("Library object not found.");
        const siblings = await listLibraryObjects(item.library_id);
        if (siblings.some(candidate => candidate.id !== item.id && candidate.object_type === item.object_type
            && candidate.name.toLocaleLowerCase() === clean.toLocaleLowerCase())) {
            throw Error(`${typeLabel(item.object_type)} "${clean}" already exists in this library.`);
        }
        const currentVersions = (item.versions || []).map(record => normalizedRevision(record, item));
        if (currentVersions.some(record => record.version === requestedVersion)) {
            throw Error(`Version ${requestedVersion} already exists for ${item.name}.`);
        }
        const now = new Date().toISOString();
        const renamed = {...jsonClone(item), name: clean, version: requestedVersion, modified_at: now,
            payload: {...jsonClone(item.payload), name: clean}};
        renamed.content_hash = await contentHash(renamed.payload);
        renamed.versions = [...currentVersions, revisionRecord(renamed, now, changelog || `Renamed from ${item.name}.`)];
        const updates = [renamed];
        if (item.object_type === "udt") {
            let sequence = 0;
            for (const candidate of siblings) {
                if (candidate.id === item.id) continue;
                const rewritten = renameTypeReferencesInPayload(candidate.object_type, candidate.payload, item.name, clean);
                if (!rewritten.changed) continue;
                const next = {...jsonClone(candidate), payload: rewritten.payload, modified_at: now};
                const versions = (candidate.versions || []).map(record => normalizedRevision(record, candidate));
                let automaticVersion;
                do { automaticVersion = automaticReferenceVersion(candidate, ++sequence); }
                while (versions.some(record => record.version === automaticVersion));
                next.version = automaticVersion;
                next.content_hash = await contentHash(next.payload);
                next.versions = [...versions, revisionRecord(next, now, `Updated UDT reference after ${item.name} was renamed to ${clean}.`)];
                updates.push(next);
            }
        }
        const tx = db.transaction(["objects", "libraries"], "readwrite");
        const store = tx.objectStore("objects");
        for (const update of updates) store.put(update);
        const libraryStore = tx.objectStore("libraries");
        const library = await request(libraryStore.get(item.library_id));
        if (library) libraryStore.put({...library, modified_at: now});
        await transactionDone(tx);
        return {item: renamed, references_updated: updates.length - 1};
    });
}
export async function updateLibraryObjectMetadata(objectId, patch) {
    const db = await openLibraryStore();
    const tx = db.transaction("objects", "readwrite");
    const store = tx.objectStore("objects");
    const item = await request(store.get(objectId));
    if (!item) {
        tx.abort();
        throw Error("Library object not found.");
    }
    const next = metadataPatch(item, patch);
    store.put(next);
    await transactionDone(tx);
    return next;
}
export async function createLibraryObjectRevision(objectId, patch) {
    const requestedVersion = text(patch?.version, 32);
    if (!SEMVER.test(requestedVersion)) throw Error("Version must use semantic version format, for example 1.2.0.");
    return serializeLibraryWrite(async () => {
        const db = await openLibraryStore();
        const read = db.transaction("objects", "readonly");
        const item = await request(read.objectStore("objects").get(objectId));
        if (!item) throw Error("Library object not found.");
        const versions = (item.versions || []).map(record => normalizedRevision(record, item));
        if (versions.some(record => record.version === requestedVersion)) {
            throw Error(`Version ${requestedVersion} already exists for ${item.name}.`);
        }
        const next = metadataPatch(item, patch);
        if (patch?.payload) {
            const validated = sanitizeLibraryObject({...item, ...patch, payload: patch.payload}, item.library_id);
            next.payload = validated.payload;
            // Hash before opening the write transaction: WebCrypto is asynchronous
            // and an IndexedDB transaction may otherwise become inactive.
            next.content_hash = await contentHash(next.payload);
        }
        next.version = requestedVersion;
        next.versions = [...versions, revisionRecord(next, next.modified_at, patch?.changelog)];
        const tx = db.transaction(["objects", "libraries"], "readwrite");
        tx.objectStore("objects").put(next);
        const libraryStore = tx.objectStore("libraries");
        const library = await request(libraryStore.get(item.library_id));
        if (library) libraryStore.put({...library, modified_at: next.modified_at});
        await transactionDone(tx);
        return next;
    });
}
export async function restoreLibraryObjectRevision(objectId, sourceVersion, newVersion, changelog = "") {
    const db = await openLibraryStore();
    const read = db.transaction("objects", "readonly");
    const item = await request(read.objectStore("objects").get(objectId));
    if (!item) throw Error("Library object not found.");
    const source = (item.versions || []).map(record => normalizedRevision(record, item))
        .find(record => record.version === sourceVersion);
    if (!source) throw Error(`Version ${sourceVersion} was not found.`);
    const snapshot = source.snapshot;
    return createLibraryObjectRevision(objectId, {
        ...snapshot,
        version: newVersion,
        changelog: changelog || `Restored from ${sourceVersion}.`,
    });
}
export function objectVersions(item) {
    return (item?.versions || []).map(record => normalizedRevision(record, item))
        .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)));
}
export async function createSnapshot(reason, project, profileId = "default") { const db = await openLibraryStore(); const snapshot = {id: id("snapshot"), profile_id: profileId, reason: text(reason, 256) || "Project change", created_at: new Date().toISOString(), project: jsonClone(project)}; const tx = db.transaction("snapshots", "readwrite"); tx.objectStore("snapshots").add(snapshot); await transactionDone(tx); return snapshot; }
export async function listSnapshots() { const db = await openLibraryStore(); const tx = db.transaction("snapshots", "readonly"); return request(tx.objectStore("snapshots").getAll()); }
export async function getSnapshot(snapshotId) { const db = await openLibraryStore(); const tx = db.transaction("snapshots", "readonly"); return request(tx.objectStore("snapshots").get(snapshotId)); }
export function exportPackage(library, selectedIds, objects) {
    const planned = dependencyPlan(selectedIds, objects);
    return {
        format: "TIAEngineeringAssistant",
        schema_version: LIBRARY_SCHEMA_VERSION,
        kind: "engineering_library",
        metadata: {
            name: library.name,
            description: library.description || "",
            categories: [...new Set(planned.map(item => item.category).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
            created_at: new Date().toISOString(),
        },
        objects: planned.map(item => jsonClone(item)),
    };
}
export function parsePackage(raw) {
    if (typeof raw !== "string" || new TextEncoder().encode(raw).byteLength > MAX_JSON_BYTES) throw Error("Library file is empty or exceeds 10 MB.");
    let data;
    try { data = JSON.parse(raw); } catch { throw Error("Library file is not valid JSON."); }
    if (!plain(data) || data.format !== "TIAEngineeringAssistant" || data.kind !== "engineering_library" || data.schema_version !== LIBRARY_SCHEMA_VERSION || !Array.isArray(data.objects)) throw Error("Unsupported engineering-library format or schema.");
    const ids = new Set(), names = new Set();
    const objects = data.objects.map(item => {
        const clean = sanitizeLibraryObject(item);
        // Validate and preserve immutable revisions. The old parser silently
        // discarded exported version history during transfer to another PC.
        if (Array.isArray(item.versions)) {
            if (item.versions.length > 256) throw Error("Too many object revisions.");
            const seenVersions = new Set();
            clean.versions = item.versions.map(record => {
                if (!plain(record) || !plain(record.snapshot) || !SEMVER.test(record.version))
                    throw Error("Malformed library revision.");
                if (seenVersions.has(record.version)) throw Error("Duplicate revision version.");
                seenVersions.add(record.version);
                const snapshot = sanitizeLibraryObject({
                    ...record.snapshot,
                    object_type: clean.object_type,
                    version: record.version,
                });
                if (snapshot.object_type !== clean.object_type)
                    throw Error("Revision object type mismatch.");
                return {
                    version: record.version,
                    created_at: text(record.created_at, 64),
                    changelog: text(record.changelog, 2000),
                    content_hash: text(record.content_hash, 128),
                    snapshot,
                };
            });
            if (clean.versions.length && !seenVersions.has(clean.version))
                throw Error("Current version is missing from revision history.");
        }
        if (ids.has(clean.id)) throw Error("Duplicate library object ID.");
        const name = `${clean.object_type}:${clean.name.toLocaleLowerCase()}`;
        if (names.has(name)) throw Error(`Duplicate imported object name: ${clean.name}.`);
        ids.add(clean.id);
        names.add(name);
        return clean;
    });
    const categories = Array.isArray(data.metadata?.categories)
        ? [...new Set(data.metadata.categories.map(value => text(value, 128)).filter(Boolean))]
        : [];
    return {...data, metadata: {...data.metadata, categories}, objects};
}
