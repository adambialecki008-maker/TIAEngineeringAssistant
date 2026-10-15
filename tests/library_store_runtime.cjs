"use strict";
// Exercises the pure production library rules without IndexedDB, TIA or browser I/O.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../gui/js/library_store.js"), "utf8");
const boundary = source.indexOf("function request(");
const packageBoundary = source.indexOf("export function exportPackage(");
assert.ok(boundary > 0, "Expected IndexedDB boundary in library_store.js");
assert.ok(packageBoundary > boundary, "Expected package boundary in library_store.js");
const production = (source.slice(0, boundary) + source.slice(packageBoundary)).replace(/\bexport\s+/g, "");
const context = {assert, console, crypto: require("node:crypto").webcrypto, TextEncoder};
vm.createContext(context);
vm.runInContext(`${production}\n
globalThis.runLibraryStoreTests = async () => {
    assert.equal(normalizeLibraryName("  Test  "), "test");
    assert.equal(normalizeLibraryName("TEST"), "test", "Library names compare case-insensitively");
    const udtMotor = sanitizeLibraryObject({
        id: "udt-motor", object_type: "udt", name: "UDT_Motor", category: "Custom machinery",
        payload: {fields: [{name: "Running", data_type: "Bool"}]}
    });
    const dbMotors = sanitizeLibraryObject({
        id: "db-motors", object_type: "db", name: "DB_Motors",
        payload: {members: [{name: "Motor", data_type: "UDT_Motor"}]}
    });
    assert.equal(udtMotor.category, "Custom machinery", "Custom categories must remain intact");
    assert.deepEqual(dependencyPlan([dbMotors.id], [dbMotors, udtMotor]).map(item => item.id), ["udt-motor", "db-motors"]);
    assert.deepEqual(analyzeDependencies([dbMotors.id], [dbMotors, udtMotor]).missing, []);
    const missingDb = sanitizeLibraryObject({
        id: "db-missing", object_type: "db", name: "DB_Missing",
        payload: {members: [{name: "Value", data_type: "UDT_NotInLibrary"}]}
    });
    assert.deepEqual(analyzeDependencies([missingDb.id], [missingDb]).missing, ["UDT_NotInLibrary"]);
    const packageData = exportPackage({name: "Motors"}, [dbMotors.id], [dbMotors, udtMotor]);
    assert.deepEqual(packageData.metadata.categories, ["Custom machinery", "General"]);
    assert.equal(parsePackage(JSON.stringify(packageData)).objects.length, 2);
    const existingConflicting = sanitizeLibraryObject({
        id: "existing-motor", object_type: "udt", name: "UDT_Motor",
        payload: {fields: [{name: "Running", data_type: "Int"}]}
    });
    const proposedConflict = planSelectiveLibraryImport([dbMotors.id], [dbMotors, udtMotor], [existingConflicting]);
    assert.equal(proposedConflict.unresolved.length, 1, "Conflicts require an explicit decision");
    assert.throws(() => planSelectiveLibraryImport([dbMotors.id], [dbMotors, udtMotor],
        [existingConflicting], {[udtMotor.id]: {action: "rename", name: "UDT_Motor"}}), /different name/);
    const proposedRenamed = planSelectiveLibraryImport([dbMotors.id], [dbMotors, udtMotor],
        [existingConflicting], {[udtMotor.id]: {action: "rename", name: "UDT_Motor_Custom"}});
    assert.equal(proposedRenamed.unresolved.length, 0);
    assert.equal(proposedRenamed.candidates.find(item => item.source.id === dbMotors.id).payload.members[0].data_type,
        "UDT_Motor_Custom", "Renames rewrite incoming DB references");
    const proposedKeep = planSelectiveLibraryImport([dbMotors.id], [dbMotors, udtMotor],
        [existingConflicting], {[udtMotor.id]: {action: "keep"}});
    assert.equal(proposedKeep.candidates.length, 1, "Keep existing only imports the DB");
    assert.throws(() => planSelectiveLibraryImport([dbMotors.id], [dbMotors, udtMotor],
        [existingConflicting], {[udtMotor.id]: {action: "version", version: "bad"}}), /SemVer/);
    const versionPlan = planSelectiveLibraryImport([dbMotors.id], [dbMotors, udtMotor],
        [existingConflicting], {[udtMotor.id]: {action: "version", version: "2.0.0"}});
    assert.equal(versionPlan.candidates.length, 2);
    assert.equal(versionPlan.candidates[0].version, "2.0.0");
    const untouched = JSON.stringify(existingConflicting);
    planSelectiveLibraryImport([dbMotors.id], [dbMotors, udtMotor],
        [existingConflicting], {[udtMotor.id]: {action: "replace", version: "3.0.0"}});
    assert.equal(JSON.stringify(existingConflicting), untouched, "Planning never mutates persisted objects");
    const firstHash = await contentHash({b: 2, a: 1});
    const secondHash = await contentHash({a: 1, b: 2});
    assert.equal(firstHash, secondHash, "Object hashing must be key-order independent");
    assert.throws(() => sanitizeLibraryObject({
        object_type: "udt", name: "Broken", payload: {fields: [
            {name: "x", data_type: "Bool"}, {name: "X", data_type: "Bool"}
        ]}
    }), /Duplicate member/);
    const first = sanitizeLibraryObject({id: "one", object_type: "udt", name: "First", payload: {fields: [{name: "next", data_type: "Second"}]}});
    const second = sanitizeLibraryObject({id: "two", object_type: "udt", name: "Second", payload: {fields: [{name: "previous", data_type: "First"}]}});
    assert.throws(() => dependencyPlan([first.id], [first, second]), /Circular library dependency/);
    const revisionOne = {snapshot: {payload: {fields: [{name: "Running", data_type: "Bool", comment: "old"}]}}};
    const revisionTwo = {snapshot: {payload: {fields: [
        {name: "Running", data_type: "Bool", comment: "new"},
        {name: "Speed", data_type: "DInt"},
    ]}}};
    assert.deepEqual(compareRevisionSnapshots(revisionOne, revisionTwo), [
        {path: "Running", change: "Changed", detail: "comment"},
        {path: "Speed", change: "Added", detail: "DInt"},
    ], "Revision comparison must expose member-level changes");
    const renamedReferences = renameTypeReferencesInPayload("db", {
        name: "DB_Motors",
        members: [
            {name: "Motor", data_type: "UDT_Motor"},
            {name: "Motors", data_type: "Array", array_element_type: "UDT_Motor", array_lower_bound: 1, array_upper_bound: 4},
            {name: "Nested", data_type: "Struct", struct_members: [{name: "Child", data_type: "UDT_Motor"}]},
        ],
    }, "UDT_Motor", "UDT_Drive");
    assert.equal(renamedReferences.changed, true, "Renaming a UDT must find dependent DB members");
    assert.equal(renamedReferences.payload.members[0].data_type, "UDT_Drive");
    assert.equal(renamedReferences.payload.members[1].array_element_type, "UDT_Drive");
    assert.equal(renamedReferences.payload.members[2].struct_members[0].data_type, "UDT_Drive");
};`, context);

context.runLibraryStoreTests()
    .then(() => console.log("library_store_runtime: PASS"))
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
