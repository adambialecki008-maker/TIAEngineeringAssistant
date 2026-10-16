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
// Program XML is intentionally kept opaque and never translated or regenerated.
export function convertTiaFbDetail(detail) {
    if (!detail || String(detail.kind || "").toUpperCase() !== "FB" || !detail.name
        || !Array.isArray(detail.members)) {
        throw Error("TIA did not export usable Function Block declarations.");
    }
    const rawLanguage = String(detail.programming_language || "").trim().toUpperCase();
    const language = rawLanguage === "KOP" ? "LAD" : rawLanguage;
    if (!["SCL", "LAD", "FBD"].includes(language))
        throw Error(detail.name + " uses " + (language || "an unknown language")
            + ". Only SCL, LAD and FBD FBs are supported.");
    if (!String(detail.source_xml || "").trim())
        throw Error(detail.name + ": original TIA source XML is unavailable; import is blocked to avoid losing logic.");
    const grouped = Object.fromEntries([...SECTIONS.values()].map(key => [key, []]));
    const reasons = [];
    for (const row of detail.members) {
        try { grouped[sectionKey(row)].push(row); }
        catch (error) {
            reasons.push(error.message);
        }
    }

    const converted = {
        name:detail.name, number:detail.number ?? null, language,
        source_mode: "tia_read_only",
        source_xml: detail.source_xml,
        interface_verified: reasons.length === 0,
        unverified_reasons: reasons,
    };
    for (const key of new Set(SECTIONS.values())) {
        const rows = grouped[key];
        if (!rows.length) {
            converted[key] = {name: key === "inout" ? "InOut" : key[0].toUpperCase() + key.slice(1), members:[]};
            continue;
        }
        // Exported children of a native TON/TOF/TP/CTU/CTD/CTUD
        // are a read-only view, NOT separate declarations or user Structs.
        // Only use rows actually exported by TIA; never invent PT/ET/etc.
        const nativeChildren = new Map();
        const declarableRows = [];
        let systemRoot = null;
        const observedPaths = new Set();
        let parsed;
        try {
            for (const row of rows) {
                if (row.level === 0) {
                    systemRoot = row.system_instance === true ? row.path : null;
                    declarableRows.push(row);
                    if (systemRoot) nativeChildren.set(normalized(systemRoot), []);
                    continue;
                }
                if (systemRoot && row.path?.startsWith(systemRoot + ".")) {
                    const segments = String(row.path).split(".");
                    const rootSegments = String(systemRoot).split(".");
                    const key = normalized(row.path);
                    if (segments.length !== row.level + 1
                        || segments[segments.length - 1] !== row.name
                        || rootSegments.length !== 1 || observedPaths.has(key)) {
                        throw Error(row.path + ": invalid native system child path.");
                    }
                    const parent = segments.slice(0, -1).join(".");
                    if (parent !== systemRoot && !observedPaths.has(normalized(parent))) {
                        throw Error(row.path + ": missing native system child parent.");
                    }
                    observedPaths.add(key);
                    nativeChildren.get(normalized(systemRoot)).push({
                        path: row.path, name: row.name, data_type: row.data_type || "",
                        level: row.level, offset: row.offset || "",
                        comment: row.comment || "", metadata: row.metadata || {},
                    });
                    continue;
                }
                declarableRows.push(row);
            }
            parsed = convertTiaUdtDetail({kind:"udt", name:detail.name, members:declarableRows});
        }
        catch (error) {
            converted.interface_verified = false;
            converted.unverified_reasons.push(key + ": " + error.message);
            converted[key] = {name: key === "inout" ? "InOut" : key[0].toUpperCase() + key.slice(1), members:[]};
            continue;
        }
        const rawSystem = new Set(rows.filter(row => row.system_instance === true && row.level === 0)
            .map(row => normalized(row.path)));
        for (const member of parsed.fields) {
            if (rawSystem.has(normalized(member.name))) {
                member.system_instance = true;
                member.system_preview = nativeChildren.get(normalized(member.name)) || [];
            }
        }
        converted[key] = {name: key === "inout" ? "InOut" : key[0].toUpperCase() + key.slice(1), members:parsed.fields};
    }
    return converted;
}
