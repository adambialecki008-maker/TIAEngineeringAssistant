// Read-only DB import conversion. Reuse the UDT member converter so Array,
// Struct, initial values and HMI attributes follow identical safety rules.
import {convertTiaUdtDetail} from "./udt_import_converter.js";

const RETAIN = new Set(["retain", "true"]);
const NON_RETAIN = new Set(["nonretain", "non_retain", "non-retain", "noretain", "false"]);

export function convertTiaDbDetail(detail, retainChoice = null) {
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
    if (retainChoice !== null && typeof retainChoice !== "boolean")
        throw Error("Retain choice must be explicit RETAIN or NON_RETAIN.");
    const flags = new Set();
    const sanitizedMembers = detail.members.map(row => {
        const metadata = {...(row.metadata || {})};
        if (row.level === 0) {
            const raw = String(metadata.remanence || "").trim().toLowerCase();
            if (RETAIN.has(raw)) flags.add(true);
            else if (NON_RETAIN.has(raw)) flags.add(false);
            else if (raw) throw Error(row.path + ": unsupported remanence " + raw);
            else flags.add(null);
        } else if (metadata.remanence) {
            // Per-member remanence has no equivalent in the current whole-DB
            // editor. Only matching whole-DB attributes may be dropped.
            const raw = String(metadata.remanence).trim().toLowerCase();
            if (!RETAIN.has(raw) && !NON_RETAIN.has(raw))
                throw Error(row.path + ": unsupported nested remanence " + raw);
            flags.add(RETAIN.has(raw));
        }
        delete metadata.remanence;
        return {...row, metadata};
    });
    if (flags.has(true) && flags.has(false))
        throw Error("Mixed RETAIN/NON_RETAIN declarations cannot be represented as a whole-DB setting.");
    const known = flags.has(true) ? true : flags.has(false) ? false : null;
    if (known !== null && retainChoice !== null && known !== retainChoice)
        throw Error("Selected RETAIN mode disagrees with exported TIA remanence.");
    if ((known === null || flags.has(null)) && retainChoice === null)
        throw Error("TIA XML does not establish whole-DB RETAIN. Select RETAIN or NON_RETAIN after checking TIA.");
    const parsed = convertTiaUdtDetail({...detail, kind:"udt", members:sanitizedMembers});
    return {name:parsed.name, retain:known === null ? retainChoice : known,
        members:parsed.fields};
}
