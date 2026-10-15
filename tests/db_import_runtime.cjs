"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const udtSource = fs.readFileSync("gui/js/udt_import_converter.js", "utf8")
    .replaceAll("export function ", "function ");
const dbSource = fs.readFileSync("gui/js/db_import_converter.js", "utf8")
    .replace(/^import .*;\s*$/gm, "").replaceAll("export function ", "function ");
const sandbox = vm.createContext({});
vm.runInContext(udtSource + "\n" + dbSource +
    "\nglobalThis.convertDb = convertTiaDbDetail;", sandbox);
const convert = sandbox.convertDb;
const row = (path, type, remanence, section = "Static") => ({
    path, name:path.split(".").at(-1), level:path.split(".").length - 1,
    data_type:type, section, metadata:remanence === undefined ? {} :
        {remanence}, comment:"",
});
const detail = rows => ({kind:"db", name:"DB_Process",
    group_path:"", members:rows});
const run = (name, fn) => {fn(); console.log("PASS " + name);};
run("RETTAIN with nested Struct, Array and UDT references", () => {
    const source = detail([
        row("Machine", "Struct", "Retain"),
        row("Machine.Drive", '"UDT_Motor"'),
        row("Machine.Speeds", "Array[-2..4] of Real"),
    ]);
    source.members[1].comment = "A nested drive";
    const original = JSON.stringify(source);
    const result = convert(source);
    assert.equal(result.name, "DB_Process");
    assert.equal(result.retain, true);
    assert.equal(result.members[0].struct_members[0].data_type, "UDT_Motor");
    assert.equal(result.members[0].struct_members[1].array_lower_bound, -2);
    assert.equal(result.members[0].struct_members[0].comment, "A nested drive");
    assert.equal(JSON.stringify(source), original);
});
run("explicit NON_RETAIN", () => {
    assert.equal(convert(detail([row("Ready", "Bool", "NonRetain")])).retain, false);
});
run("missing XML retain must be confirmed manually", () => {
    const source = detail([row("Ready", "Bool")]);
    assert.throws(() => convert(source), /select retain or non_retain/i);
    assert.equal(convert(source, false).retain, false);
    assert.equal(convert(source, true).retain, true);
});
run("explicit XML conflict cannot be silently overridden", () => {
    assert.throws(() => convert(detail([row("Ready", "Bool", "Retain")]), false),
        /disagrees/i);
});
run("mixed member remanence is blocked", () => {
    assert.throws(() => convert(detail([
        row("A", "Bool", "Retain"), row("B", "Bool", "NonRetain"),
    ])), /mixed/i);
});
run("mixed explicit and unknown metadata requires confirmation", () => {
    const source = detail([row("A", "Bool", "Retain"), row("B", "Bool")]);
    assert.throws(() => convert(source), /select retain or non_retain/i);
    assert.equal(convert(source, true).retain, true);
    assert.throws(() => convert(source, false), /disagrees/i);
});
run("unsafe DB sections are rejected", () => {
    assert.throws(() => convert(detail([row("In", "Bool", "Retain", "Input")])),
        /only static/i);
});
run("invalid or unexpected XML attributes are rejected", () => {
    const unsafe = detail([row("Valve", "Bool", "Retain")]);
    unsafe.members[0].metadata.at = "%I0.0";
    assert.throws(() => convert(unsafe), /unsupported tia metadata/i);
});
run("nested Array elements cannot be imported as declarations", () => {
    assert.throws(() => convert(detail([
        row("Motors", "Array[0..2] of Bool", "NonRetain"),
        {...row("Motors", "Bool"), path:"Motors[0]", name:"Motors[0]", level:0},
    ]), true), /expanded array|invalid/i);
});
run("not a DB", () => {
    assert.throws(() => convert({kind:"udt", name:"UDT_X", members:[
        row("A", "Bool", "Retain"),
    ]}), /usable db/i);
});
console.log("TIA DB read-only conversion: PASS");
