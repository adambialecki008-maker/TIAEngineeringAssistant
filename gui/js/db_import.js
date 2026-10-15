import {projectConfig, saveProjectConfig, getActiveProjectProfileId} from "./state.js";
import {getJson, postJson} from "./api.js";
import {convertTiaUdtDetail} from "./udt_import_converter.js";
import {convertTiaDbDetail} from "./db_import_converter.js";

// A DB may refer to UDTs nested inside Structs or as Array elements.
const PRIMITIVES = new Set([
    "bool", "byte", "word", "dword", "lword", "char", "wchar",
    "sint", "usint", "int", "uint", "dint", "udint", "lint", "ulint",
    "real", "lreal", "time", "ltime", "s5time", "date", "time_of_day",
    "ltime_of_day", "date_and_time", "l_date_and_time", "dtl",
    "tod", "ltod", "dt", "ldt",
    "timer", "counter", "any", "variant", "void", "string", "wstring",
]);
function isPrimitive(value) {
    const clean = String(value || "").trim().toLowerCase();
    return PRIMITIVES.has(clean) || /^(w?string)\s*\[\s*\d+\s*\]$/i.test(clean);
}
function references(members) {
    const names = new Set();
    function visit(rows) {
        for (const row of rows || []) {
            const kind = row.data_type === "Array" ? row.array_element_type : row.data_type;
            if (kind && kind !== "Struct" && !isPrimitive(kind))
                names.add(String(kind).replace(/^"(.+)"$/, "$1"));
            visit(row.struct_members);
        }
    }
    visit(members);
    return [...names];
}
// Compare PLC declarations rather than incidental editor UI attributes.
// Reusing a name with a different UDT layout would corrupt DB semantics.
function declarationShape(fields) {
    return (fields || []).map(field => [
        String(field.name).toLowerCase(),
        String(field.data_type).toLowerCase(),
        String(field.array_element_type || "").toLowerCase(),
        field.array_lower_bound ?? null, field.array_upper_bound ?? null,
        declarationShape(field.struct_members),
    ]);
}
function url(target, extra = {}) {
    return new URLSearchParams({
        process_id:target.process_id, device_name:target.device_name,
        plc_name:target.plc_name, ...extra,
    }).toString();
}
function targetIdentity() {
    const process = Number(document.getElementById("tia-process")?.value);
    const selected = projectConfig.tia_target;
    if (!Number.isInteger(process) || process < 1 || !selected?.device_name ||
        !selected?.plc_name) throw Error("Select a TIA process and Active PLC first.");
    // The active TIA target, not the Create PLC family selector, identifies the source.
    return {process_id:String(process), device_name:selected.device_name,
        plc_name:selected.plc_name, profile_id:getActiveProjectProfileId()};
}
const sameTarget = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function initDbTiaImportUi(renderAll) {
    const scan = document.getElementById("tia-db-scan");
    const select = document.getElementById("tia-db-select");
    const load = document.getElementById("tia-db-load");
    const status = document.getElementById("tia-db-import-status");
    if (!scan || !select || !load || !status) return;

    let available = [], udtInventory = [], scannedTarget = null, busy = false;
    function report(message, error = false) {
        status.textContent = message;
        status.classList.toggle("error", error);
        status.classList.toggle("success", !error);
    }
    function requireSameTarget() {
        if (!scannedTarget || !sameTarget(scannedTarget, targetIdentity()))
            throw Error("Active PLC or project profile changed. Scan DBs again.");
    }
    scan.addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        scan.disabled = true;
        load.disabled = true;
        available = [];
        udtInventory = [];
        scannedTarget = null;
        select.replaceChildren();
        try {
            const target = targetIdentity();
            const data = await getJson("/api/v1/tia/plc-structures?" + url(target));
            if (!sameTarget(target, targetIdentity()))
                throw Error("Active PLC or profile changed during DB scan.");
            available = (data.data_blocks || []).filter(item =>
                item.name && item.is_consistent === true &&
                String(item.block_kind).toLowerCase() === "globaldb");
            udtInventory = data.udts || [];
            scannedTarget = target;
            for (let i = 0; i < available.length; i++) {
                const option = document.createElement("option");
                option.value = String(i);
                option.textContent = available[i].name + " [" +
                    (available[i].group_path || "root") + "]";
                select.append(option);
            }
            load.disabled = available.length === 0;
            report(available.length + " consistent global DB(s) available for read-only import. " +
                "Instance DBs and inconsistent blocks are excluded.");
        } catch (error) {
            report(error.message, true);
        } finally {
            busy = false;
            scan.disabled = false;
        }
    });
    load.addEventListener("click", async () => {
        if (busy || !scannedTarget) return;
        busy = true;
        load.disabled = true;
        try {
            requireSameTarget();
            const selected = available[Number(select.value)];
            if (!selected) throw Error("Select a global TIA DB.");
            if (projectConfig.dbs.some(db => db.name.toLowerCase() ===
                selected.name.toLowerCase()))
                throw Error(selected.name + " already exists in the local editor. Nothing was overwritten.");
            const detail = await getJson("/api/v1/tia/plc-structure?" +
                url(scannedTarget, {kind:"db", group_path:selected.group_path || "",
                    name:selected.name}));
            requireSameTarget();
            if (detail.kind !== "db" || detail.name !== selected.name ||
                detail.group_path !== (selected.group_path || ""))
                throw Error("Exported TIA DB identity changed. Nothing imported.");
            const db = convertTiaDbDetail(detail);
            await postJson("/api/v1/db-specifications", db);
            requireSameTarget();

            const stagedUdts = [], resolved = new Set(), visiting = new Set();
            async function resolveUdt(rawName) {
                const key = rawName.toLocaleLowerCase();
                if (isPrimitive(rawName) || resolved.has(key)) return;
                if (visiting.has(key))
                    throw Error("Circular UDT dependency detected: " + rawName);
                const existing = projectConfig.udts.find(item =>
                    item.name.toLowerCase() === key);
                const matches = udtInventory.filter(item => item.name.toLowerCase() === key);
                if (matches.length !== 1 || matches[0].is_consistent !== true)
                    throw Error("Missing, inconsistent or ambiguous TIA UDT dependency: " +
                        rawName + ". No DB was imported.");
                visiting.add(key);
                try {
                    const source = matches[0];
                    const exported = await getJson("/api/v1/tia/plc-structure?" +
                        url(scannedTarget, {kind:"udt", group_path:source.group_path || "",
                            name:source.name}));
                    requireSameTarget();
                    if (exported.kind !== "udt" || exported.name !== source.name ||
                        exported.group_path !== (source.group_path || ""))
                        throw Error("Exported TIA UDT identity changed: " + source.name);
                    const udt = convertTiaUdtDetail(exported);
                    if (existing && JSON.stringify(declarationShape(existing.fields)) !==
                        JSON.stringify(declarationShape(udt.fields))) {
                        throw Error("Local UDT " + udt.name +
                            " differs from the active TIA definition. " +
                            "Import was blocked; no existing UDT was overwritten.");
                    }
                    for (const dependency of references(udt.fields))
                        await resolveUdt(dependency);
                    if (!existing) {
                        await postJson("/api/v1/udt-specifications", udt);
                        requireSameTarget();
                        stagedUdts.push({...udt, tia_source:{
                            ...scannedTarget, group_path:source.group_path || "", name:source.name,
                        }});
                    }
                    resolved.add(key);
                } finally {
                    visiting.delete(key);
                }
            }
            for (const dependency of references(db.members))
                await resolveUdt(dependency);
            requireSameTarget();
            const duplicateUdt = stagedUdts.find(udt => projectConfig.udts.some(item =>
                item.name.toLowerCase() === udt.name.toLowerCase()));
            if (duplicateUdt || projectConfig.dbs.some(item =>
                item.name.toLowerCase() === db.name.toLowerCase()))
                throw Error("Local objects changed during import. Nothing was overwritten.");
            if (stagedUdts.length && !confirm(
                "Import " + db.name + " and " + stagedUdts.length +
                " required UDT(s) into the local editor? Existing UDTs stay unchanged. " +
                "No writes will be made to TIA Portal.")) {
                report("Import cancelled. The local project and TIA were not modified.");
                return;
            }
            // All remote reads, conversions, validation and approval complete
            // before any local project change. A save failure rolls back in RAM.
            const dbEntry = {...db, tia_source:{
                ...scannedTarget, group_path:selected.group_path || "", name:selected.name,
            }};
            projectConfig.udts.push(...stagedUdts);
            projectConfig.dbs.push(dbEntry);
            try { saveProjectConfig(); }
            catch (error) {
                projectConfig.udts.splice(projectConfig.udts.length - stagedUdts.length);
                projectConfig.dbs.pop();
                throw error;
            }
            renderAll();
            report(db.name + " imported into the local editor (" +
                db.members.length + " top-level members; " + stagedUdts.length +
                " dependency UDT(s) added). TIA Portal was NOT modified.");
        } catch (error) {
            report(error.message, true);
        } finally {
            busy = false;
            load.disabled = available.length === 0;
        }
    });
}
