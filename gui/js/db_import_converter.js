// Read-only DB import conversion. Reuse the UDT member converter so Array,
// Struct, initial values and HMI attributes follow identical safety rules.
import {convertTiaUdtDetail} from "./udt_import_converter.js";

const RETAIN = new Set(["retain", "true"]);
const NON_RETAIN = new Set(["nonretain", "non_retain", "non-retain", "noretain", "false"]);

export function convertTiaDbDetail(detail) {
    if (!detail || detail.kind !== "db" || !detail.name ||
        !Array.isArray(detail.members) || !detail.members.length) {
        throw Error("TIA did not export usable DB declarations.");
    }
    // DB editor only models global DB static members, not instance DB
    // FB interfaces, constants, temporary memory or arbitrary sections.
    for (const row of detail.members) {
        if (String(row.section || "").toLowerCase() !== "static")
            throw Error("Unsupported DB section " + (row.section || "(missing)") +
                ". Only Static declarations of a global DB can be imported.");
    }
    const topRetain = new Map();
    const sanitizedMembers = detail.members.map(row => {
        const metadata = {...(row.metadata || {})};
        const raw = String(metadata.remanence || "").trim().toLowerCase();
        const actual = RETAIN.has(raw) ? true : NON_RETAIN.has(raw) ? false : null;
        if (raw && actual === null)
            throw Error(row.path + ": unsupported remanence " + raw);
        if (row.level === 0) {
            if (actual === null)
                throw Error(row.path + ": TIA XML does not clearly establish "
                    + "whole-DB retain settings. Import was blocked.");
            topRetain.set(row.path, actual);
        } else if (actual !== null) {
            const parent = row.path.split(".", 1)[0];
            if (!topRetain.has(parent) || topRetain.get(parent) !== actual)
                throw Error(row.path + ": nested retention differs from the "
                    + "parent declaration; import blocked to avoid data loss.");
        }
        delete metadata.remanence;
        return {...row, metadata};
    });
    const modes = new Set(topRetain.values());
    const parsed = convertTiaUdtDetail({...detail, kind:"udt", members:sanitizedMembers});
    const retain = modes.size === 1 ? [...modes][0] : false;
    if (modes.size > 1) {
        for (const member of parsed.fields) member.retain = topRetain.get(member.name);
    }
    return {name:parsed.name, retain, members:parsed.fields};
}
