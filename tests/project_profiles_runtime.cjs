"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const raw = fs.readFileSync("gui/js/state.js", "utf8")
    .replace(/\bexport\s+/g, "");
const storage = new Map();
const localStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
};
const seed = {plc_family: "S7-1500", udts: [{name: "LEGACY_Motor", fields: []}],
    dbs: [], fbs: [{name: "FB_Legacy", static:{members:[]}}], device_config: {templates: [], groups: [], mappings: [], mapping_mode: "device"},
    tia_target: {device_name: "OldPLC", plc_name: "PLC_1"}};
localStorage.setItem("tiaEngineeringAssistant.projectConfig", JSON.stringify(seed));
const env = {localStorage, crypto: require("node:crypto").webcrypto, console};
vm.createContext(env);
vm.runInContext(raw + `
globalThis.api = {
    projectConfig, loadProjectConfig, saveProjectConfig, listProjectProfiles,
    getActiveProjectProfileId, createProjectProfile, duplicateProjectProfile, switchProjectProfile,
    renameProjectProfile, deleteProjectProfile,
};`, env);
const a = env.api;
a.loadProjectConfig();
assert.equal(a.projectConfig.udts[0].name, "LEGACY_Motor");
assert.equal(a.projectConfig.fbs[0].name, "FB_Legacy");
assert.equal(a.projectConfig.tia_target.plc_name, "PLC_1"); // Start-up compatibility
assert.equal(a.getActiveProjectProfileId(), "default");
assert.equal(JSON.parse(localStorage.getItem(
    "tiaEngineeringAssistant.projectConfig.legacyBackup")).tia_target.plc_name, "PLC_1");
const second = a.createProjectProfile("Machine 2");
assert.throws(() => a.createProjectProfile("machine 2"), /already exists/);
a.switchProjectProfile(second.id);
assert.equal(a.projectConfig.tia_target, null); // Switch disconnects TIA
assert.equal(a.projectConfig.udts.length, 0);
assert.equal(a.projectConfig.fbs.length, 0);
a.projectConfig.plc_family = "S7-1200";
a.projectConfig.udts.push({name: "Other", fields: []});
a.projectConfig.fbs.push({name: "FB_Other", static:{members:[]}});
a.saveProjectConfig();
assert.equal(JSON.parse(localStorage.getItem("tiaEngineeringAssistant.projectConfig")).udts[0].name, "LEGACY_Motor");
const copy = a.duplicateProjectProfile(second.id, "Machine 2 copy");
assert.equal(JSON.parse(localStorage.getItem("tiaEngineeringAssistant.projectConfig.profile." + copy.id)).tia_target, null);
a.switchProjectProfile(copy.id);
assert.equal(a.projectConfig.udts[0].name, "Other");
assert.equal(a.projectConfig.fbs[0].name, "FB_Other");
a.projectConfig.udts.push({name: "Only In Copy", fields: []});
a.saveProjectConfig();
a.switchProjectProfile(second.id);
assert.equal(a.projectConfig.udts.length, 1, "Duplicate must not share UDT arrays");
assert.throws(() => a.duplicateProjectProfile(second.id, "Machine 2 copy"), /already exists/);
a.renameProjectProfile(second.id, "Machine B");
a.switchProjectProfile("default");
assert.equal(a.projectConfig.udts[0].name, "LEGACY_Motor");
assert.equal(a.projectConfig.plc_family, "S7-1500");
a.switchProjectProfile(second.id);
assert.equal(a.projectConfig.udts[0].name, "Other");
assert.equal(a.projectConfig.plc_family, "S7-1200");
assert.throws(() => a.deleteProjectProfile(second.id), /Switch projects/);
a.switchProjectProfile("default");
a.deleteProjectProfile(second.id);
a.deleteProjectProfile(copy.id);
assert.equal(a.listProjectProfiles().length, 1);
assert.throws(() => a.deleteProjectProfile("default"), /cannot be deleted/);
assert.equal(JSON.parse(localStorage.getItem(
    "tiaEngineeringAssistant.projectConfig.legacyBackup")).udts[0].name, "LEGACY_Motor");
// Crash-safe migration: a persisted profile index with no Default payload
// must recover legacy data without deleting independently created profiles.
function scenario(legacy, initial) {
    const saved = new Map(Object.entries(initial || {}));
    if (legacy !== null) saved.set("tiaEngineeringAssistant.projectConfig", JSON.stringify(legacy));
    const localStorage = {
        getItem: key => saved.has(key) ? saved.get(key) : null,
        setItem: (key, value) => saved.set(key, String(value)),
        removeItem: key => saved.delete(key),
    };
    const env = {localStorage, crypto: require("node:crypto").webcrypto, console};
    vm.createContext(env);
    vm.runInContext(raw + `
globalThis.api = {loadProjectConfig, listProjectProfiles, getActiveProjectProfileId, projectConfig};`, env);
    return {api: env.api, saved};
}
const indexKey = "tiaEngineeringAssistant.projectProfiles";
const defaultKey = "tiaEngineeringAssistant.projectConfig.profile.default";
const interrupted = scenario(seed, {
    [indexKey]: JSON.stringify([{id: "default", name: "Default project"}, {id: "other", name: "Other"}]),
    "tiaEngineeringAssistant.projectConfig.profile.other": JSON.stringify({plc_family: "S7-1200"}),
});
interrupted.api.loadProjectConfig();
assert.equal(interrupted.api.projectConfig.udts[0].name, "LEGACY_Motor");
assert.equal(interrupted.api.listProjectProfiles().length, 2);
const originalDefault = interrupted.saved.get(defaultKey);
interrupted.api.loadProjectConfig();
assert.equal(interrupted.saved.get(defaultKey), originalDefault, "Repeated migration must be idempotent");
const partialIndex = scenario(seed, {
    [indexKey]: JSON.stringify([{id: "other", name: "Other"}]),
    "tiaEngineeringAssistant.projectConfig.profile.other": JSON.stringify({plc_family: "S7-1200"}),
});
assert.equal(partialIndex.api.listProjectProfiles().length, 2, "Recover Default without dropping other profiles");
assert.equal(JSON.parse(partialIndex.saved.get(defaultKey)).udts[0].name, "LEGACY_Motor");
const badIndex = scenario(seed, {[indexKey]: "{not json"});
assert.throws(() => badIndex.api.loadProjectConfig(), /index is corrupt/);
assert.equal(badIndex.saved.get(indexKey), "{not json", "Corrupt index must never be overwritten");
console.log("project_profiles_runtime: PASS");
