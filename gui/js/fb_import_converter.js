import {convertTiaUdtDetail} from "./udt_import_converter.js";

const SECTIONS = new Map([
    ["input", "input"], ["output", "output"], ["inout", "inout"],
    ["static", "static"], ["temp", "temp"], ["constant", "constant"],
]);

function normalized(value) {
    return String(value || "").trim().toLocaleLowerCase();
}

function sectionKey(row) {
    const key = SECTIONS.get(normalized(row.section));
    if (!key) throw Error((row.path || row.name || "Member") + ": unsupported FB section "
        + (row.section || "(missing)"));
    return key;
}

// Convert only declarations which can be represented without changing their
// shape. The existing UDT converter supplies the lossless Struct/Array and
// attribute checks, keeping FB import aligned with UDT and global DB import.
// LAD/KOP network XML is intentionally kept opaque and never translated.
export function convertTiaFbDetail(detail) {
    if (!detail || String(detail.kind || "").toUpperCase() !== "FB" || !detail.name
        || !Array.isArray(detail.members)) {
        throw Error("TIA did not export usable Function Block declarations.");
    }
    const language = String(detail.programming_language || "").trim().toUpperCase();
    if (!["SCL", "LAD", "KOP"].includes(language))
        throw Error(detail.name + " uses " + (language || "an unknown language")
            + ". Only SCL, LAD and KOP FBs are supported.");
    const readOnly = language !== "SCL";
    if (readOnly && !String(detail.source_xml || "").trim())
        throw Error(detail.name + ": original LAD/KOP XML is unavailable; import is blocked to avoid losing logic.");
    const grouped = Object.fromEntries([...SECTIONS.values()].map(key => [key, []]));
    const reasons = [];
    for (const row of detail.members) {
        try { grouped[sectionKey(row)].push(row); }
        catch (error) {
            if (!readOnly) throw error;
            reasons.push(error.message);
        }
    }

    const converted = {
        name:detail.name, number:detail.number ?? null, language,
        source_mode: readOnly ? "tia_read_only" : "local",
        source_xml: readOnly ? detail.source_xml : null,
        interface_verified: reasons.length === 0,
        unverified_reasons: reasons,
    };
    for (const key of new Set(SECTIONS.values())) {
        const rows = grouped[key];
        if (!rows.length) {
            converted[key] = {name: key === "inout" ? "InOut" : key[0].toUpperCase() + key.slice(1), members:[]};
            continue;
        }
        let parsed;
        try { parsed = convertTiaUdtDetail({kind:"udt", name:detail.name, members:rows}); }
        catch (error) {
            if (!readOnly) throw error;
            converted.interface_verified = false;
            converted.unverified_reasons.push(key + ": " + error.message);
            converted[key] = {name: key === "inout" ? "InOut" : key[0].toUpperCase() + key.slice(1), members:[]};
            continue;
        }
        const rawSystem = new Set(rows.filter(row => row.system_instance === true && row.level === 0)
            .map(row => normalized(row.path)));
        for (const member of parsed.fields) {
            if (rawSystem.has(normalized(member.name))) member.system_instance = true;
        }
        // A system member must be an opaque top-level declaration. Its XML
        // children describe Siemens internals and cannot become editable data.
        for (const row of rows) {
            if (row.system_instance === true && row.level !== 0) {
                if (!readOnly) throw Error(row.path + ": system-instance internals cannot be imported as editable fields.");
                converted.interface_verified = false;
                converted.unverified_reasons.push(row.path + ": system-instance internals are opaque.");
            }
        }
        converted[key] = {name: key === "inout" ? "InOut" : key[0].toUpperCase() + key.slice(1), members:parsed.fields};
    }
    return converted;
}
