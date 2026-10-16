import registry from "../data/siemens-type-registry.json" with {type: "json"};

export const SIEMENS_TYPE_REGISTRY = Object.freeze(registry);

function normalized(value) {
    return String(value ?? "").trim().toLocaleLowerCase();
}

function knownEntry(value) {
    const key = normalized(value);
    return registry.types.find(entry => normalized(entry.name) === key
        || (entry.aliases || []).some(alias => normalized(alias) === key)) || null;
}

export function isBuiltInSystemType(value) {
    return knownEntry(value) !== null;
}

export function getTypeMetadata(value) {
    return knownEntry(value);
}

export function getPlcDataTypes(plcFamily) {
    return registry.types
        .filter(entry => entry.declarable && (!plcFamily || entry.families.includes(plcFamily)))
        .map(entry => entry.name);
}

export function getSystemInstanceTypes(plcFamily) {
    return registry.types.filter(entry => entry.kind.endsWith("_instance")
        && (!plcFamily || entry.families.includes(plcFamily)));
}

// Compatibility export, derived from the canonical registry.
export const PLC_DATA_TYPES = Object.freeze(Object.fromEntries(
    registry.families.map(family => [family, getPlcDataTypes(family)])
));

function checkDataType(dataType, path, allowedTypes, udtNames, problems) {
    const type = normalized(dataType);
    if (type === "array" || type === "struct") return;
    const entry = knownEntry(type);
    if (entry && !entry.declarable) {
        problems.push(`${path}: ${dataType} is a native ${entry.kind.replaceAll("_", " ")} and has no verified declaration syntax.`);
    } else if (!allowedTypes.has(type) && !udtNames.has(type)) {
        problems.push(`${path}: ${dataType}`);
    }
}

function checkMember(member, path, allowedTypes, udtNames, problems) {
    const memberPath = `${path}.${member.name}`;
    if (member.data_type === "Array") {
        if (member.array_element_type) checkDataType(member.array_element_type, `${memberPath}[]`, allowedTypes, udtNames, problems);
        return;
    }
    if (member.data_type === "Struct") {
        for (const child of member.struct_members ?? []) checkMember(child, memberPath, allowedTypes, udtNames, problems);
        return;
    }
    checkDataType(member.data_type, memberPath, allowedTypes, udtNames, problems);
}

export function findIncompatibleDataTypes(config, targetPlcFamily) {
    const allowedTypes = new Set(getPlcDataTypes(targetPlcFamily).map(normalized));
    const udtNames = new Set(config.udts.map(udt => normalized(udt.name)));
    const problems = [];
    for (const udt of config.udts) {
        for (const field of udt.fields) checkMember(field, udt.name, allowedTypes, udtNames, problems);
    }
    for (const db of config.dbs) {
        for (const member of db.members) checkMember(member, db.name, allowedTypes, udtNames, problems);
    }
    return problems;
}
