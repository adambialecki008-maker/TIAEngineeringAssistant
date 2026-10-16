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
// shape.  The existing UDT converter supplies the lossless Struct/Array and
// attribute checks, keeping FB import aligned with UDT and global DB import.
export function convertTiaFbDetail(detail) {
    if (!detail || String(detail.kind || "").toUpperCase() !== "FB" || !detail.name
        || !Array.isArray(detail.members)) {
        throw Error("TIA did not export usable Function Block declarations.");
    }
    if (String(detail.programming_language || "").toUpperCase() !== "SCL") {
        throw Error(detail.name + " uses " + (detail.programming_language || "an unknown language")
            + ". The local FB editor safely imports SCL declarations only.");
    }
    const grouped = Object.fromEntries([...SECTIONS.values()].map(key => [key, []]));
    for (const row of detail.members) grouped[sectionKey(row)].push(row);

    const converted = {name:detail.name, number:detail.number ?? null, language:"SCL"};
    for (const key of new Set(SECTIONS.values())) {
        const rows = grouped[key];
        if (!rows.length) {
            converted[key] = {name: key === "inout" ? "InOut" : key[0].toUpperCase() + key.slice(1), members:[]};
            continue;
        }
        const parsed = convertTiaUdtDetail({kind:"udt", name:detail.name, members:rows});
        const rawSystem = new Set(rows.filter(row => row.system_instance === true && row.level === 0)
            .map(row => normalized(row.path)));
        for (const member of parsed.fields) {
            if (rawSystem.has(normalized(member.name))) member.system_instance = true;
        }
        // A system member must be an opaque top-level declaration. Its XML
        // children describe Siemens internals and cannot become editable data.
        for (const row of rows) {
            if (row.system_instance === true && row.level !== 0) {
                throw Error(row.path + ": system-instance internals cannot be imported as editable fields.");
            }
        }
        converted[key] = {name: key === "inout" ? "InOut" : key[0].toUpperCase() + key.slice(1), members:parsed.fields};
    }
    return converted;
}
