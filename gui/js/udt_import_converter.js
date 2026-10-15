// Lossless-or-reject conversion from exported TIA PLC structure metadata.
// Only safely representable UDT members may enter the editable SCL model.
// A rejected import NEVER mutates the stored configuration or the TIA project.
const ARRAY = /^array\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*of\s+(.+)$/i;

function metadataFlag(raw, field) {
    if (raw == null || raw === "") return null;
    if (/^true$/i.test(String(raw))) return true;
    if (/^false$/i.test(String(raw))) return false;
    throw Error(field + ": unsupported exported boolean " + String(raw));
}

function parseType(raw, label) {
    const rawType = String(raw || "").trim();
    if (!rawType) throw Error(label + ": empty exported type");
    if (rawType.toLowerCase() === "struct") return {data_type:"Struct"};
    const array = rawType.match(ARRAY);
    if (array) {
        const lower = Number(array[1]), upper = Number(array[2]);
        if (lower < -32768 || upper > 32767 || lower > upper) {
            throw Error(label + ": unsupported array bounds");
        }
        const element = array[3].trim().replace(/^"([^"]+)"$/, "$1");
        if (!element || /[\[\]]/.test(element)) {
            throw Error(label + ": unsupported nested array element");
        }
        return {
            data_type:"Array",array_lower_bound:lower,
            array_upper_bound:upper,array_element_type:element,
        };
    }
    if (/^array\b/i.test(rawType) || /[\[\]]/.test(rawType)) {
        throw Error(label + ": unsupported array declaration");
    }
    return {data_type:rawType.replace(/^"([^"]+)"$/, "$1")};
}

export function convertTiaUdtDetail(detail) {
    if (!detail || detail.kind !== "udt" || !detail.name
        || !Array.isArray(detail.members) || !detail.members.length) {
        throw Error("TIA did not export a usable UDT member declaration.");
    }
    const root = [], stack = [], seen = new Set();
    for (const row of detail.members) {
        const path = String(row.path || "").trim(), name = String(row.name || "").trim();
        const level = row.level;
        if (!name || !path || !Number.isInteger(level) || level < 0
            || path.split(".").at(-1) !== name) {
            throw Error("Invalid TIA UDT member path or level.");
        }
        // Expanded ARRAY elements in exported XML are not declarations;
        // importing them as editable fields would corrupt the UDT.
        if (/[\[\]]/.test(path)) {
            throw Error(path + ": expanded Array element cannot be imported as a member.");
        }
        const parts = path.split(".");
        if (parts.length !== level + 1 || parts.some(p=>!p)) {
            throw Error(path + ": ambiguous nesting in TIA export.");
        }
        const folded = path.toLowerCase();
        if (seen.has(folded)) throw Error(path + ": duplicate declaration.");
        seen.add(folded);
        if (level > stack.length || (level > 0
            && stack[level - 1]?.path.toLowerCase() !==
                parts.slice(0, -1).join(".").toLowerCase())) {
            throw Error(path + ": missing or unordered parent declaration.");
        }
        const type = parseType(row.data_type, path);
        const meta = row.metadata || {};
        // A source property the editor cannot round-trip is not discarded.
        const unsupported = Object.keys(meta).filter(key =>
            !["start_value","hmi_visible","hmi_accessible","hmi_writable"].includes(key)
            && meta[key] != null && meta[key] !== "");
        if (unsupported.length) {
            throw Error(path + ": unsupported TIA metadata "
                + unsupported.join(", ") + " — import blocked to avoid data loss.");
        }
        const start = meta.start_value == null || meta.start_value === ""
            ? null : String(meta.start_value).trim();
        if (start === "<complex XML>") {
            throw Error(path + ": complex initial value cannot be round-tripped.");
        }
        const member = {
            name,
            comment:row.comment || null,
            ...type,
            start_value:start,
            hmi_visible:metadataFlag(meta.hmi_visible,path+".hmi_visible"),
            hmi_accessible:metadataFlag(meta.hmi_accessible,path+".hmi_accessible"),
            hmi_writable:metadataFlag(meta.hmi_writable,path+".hmi_writable"),
            array_element_type:type.array_element_type ?? null,
            array_lower_bound:type.array_lower_bound ?? null,
            array_upper_bound:type.array_upper_bound ?? null,
            struct_members:type.data_type==="Struct"?[]:null,
        };
        if (level===0) root.push(member);
        else {
            const parent=stack[level-1]?.member;
            if (!parent || parent.data_type!=="Struct") {
                throw Error(path + ": nested expansion of a non-Struct member "
                    + "cannot be imported safely.");
            }
            parent.struct_members.push(member);
        }
        stack.length=level;
        stack.push({path,member});
    }
    const check = list => {
        for (const member of list) {
            if (member.data_type==="Struct") {
                if (!member.struct_members.length) {
                    throw Error(member.name+": empty Struct cannot be edited.");
                }
                check(member.struct_members);
            }
            if (member.start_value && ["Struct","Array"].includes(member.data_type)) {
                throw Error(member.name+": complex initial values cannot be preserved.");
            }
        }
    };
    check(root);
    return {name:detail.name,fields:root};
}
