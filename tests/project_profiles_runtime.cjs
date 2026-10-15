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
    dbs: [], device_config: {templates: [], groups: [], mappings: [], mapping_mode: "device"},
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
assert.equal(a.projectConfig.tia_target.plc_name, "PLC_1"); // Start-up compatibility
assert.equal(a.getActiveProjectProfileId(), "default");
assert.equal(JSON.parse(localStorage.getItem(
    "tiaEngineeringAssistant.projectConfig.legacyBackup")).tia_target.plc_name, "PLC_1");
const second = a.createProjectProfile("Machine 2");
assert.throws(() => a.createProjectProfile("machine 2"), /already exists/);
a.switchProjectProfile(second.id);
assert.equal(a.projectConfig.tia_target, null); // Switch disconnects TIA
assert.equal(a.projectConfig.udts.length, 0);
a.projectConfig.plc_family = "S7-1200";
a.projectConfig.udts.push({name: "Other", fields: []});
a.saveProjectConfig();
assert.equal(JSON.parse(localStorage.getItem("tiaEngineeringAssistant.projectConfig")).udts[0].name, "LEGACY_Motor");
const copy = a.duplicateProjectProfile(second.id, "Machine 2 copy");
assert.equal(JSON.parse(localStorage.getItem("tiaEngineeringAssistant.projectConfig.profile." + copy.id)).tia_target, null);
a.switchProjectProfile(copy.id);
assert.equal(a.projectConfig.udts[0].name, "Other");
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
console.log("project_profiles_runtime: PASS");
