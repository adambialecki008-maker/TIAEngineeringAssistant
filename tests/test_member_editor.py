import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from engine.main import app


ROOT = Path(__file__).resolve().parents[1]


def test_member_editor_validates_nested_members_and_udt_cycles():
    if not shutil.which("node"):
        pytest.skip("Node.js is required for the shared editor validation test")

    script = r"""
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const file = process.argv[1];
const source = readFileSync(file, "utf8")
    .replace(/^import[\s\S]*?;\s*/gm, "");
const setup = [
    'const projectConfig = { plc_family: "S7-1500", udts: [',
    '{ name: "UDT_Motor", fields: [{ name: "State", data_type: "Bool" }] },',
    '{ name: "UDT_Status", fields: [{ name: "Motor", data_type: "UDT_Motor" }] },',
    '{ name: "Empty", fields: [] }',
    '] };',
    'const getPlcDataTypes = () => ["Bool", "Word"];',
    'const getSystemInstanceTypes = () => [{name: "IEC_TIMER"}];',
    'const createButton = () => {};',
    'const createDataTypeSelect = () => {};',
    'const createInput = () => {};',
    'const createTextCell = () => {};',
].join("\n");
const editor = await import("data:text/javascript;base64,"
    + Buffer.from(setup + source).toString("base64"));
const field = (name, data_type) => ({
    name, data_type, comment: null, array_element_type: null,
    array_lower_bound: null, array_upper_bound: null, struct_members: null,
});
const array = (name, element, lower, upper) => ({
    ...field(name, "Array"), array_element_type: element,
    array_lower_bound: lower, array_upper_bound: upper,
});
const struct = (name, members) => ({
    ...field(name, "Struct"), struct_members: members,
});
const nested = [struct("Cmd", [
    struct("Inner", [field("Ready", "Bool")]),
    array("Motors", "UDT_Motor", 1, 10),
])];
assert.equal(editor.validateMemberList(nested), null);
assert.match(editor.formatMemberType(nested[0].struct_members[1]),
    /10 elements/);
assert.match(editor.validateMemberList(
    [struct("Cmd", [field("Ready", "Bool"), field("ready", "Word")])]),
    /duplicate/i);
assert.match(editor.validateMemberList(
    [array("Motors", "UDT_Motor", 10, 1)]), /bounds/i);
assert.match(editor.validateMemberList(
    [array("Motors", "MissingUDT", 1, 10)]), /element type/i);
assert.match(editor.validateMemberList(
    [array("Motors", "Empty", 1, 10)]), /element type/i);
const before = JSON.stringify(nested);
assert.match(editor.validateMemberList(
    [struct("Link", [array("ToStatus", "UDT_Status", 0, 1)])],
    "UDT_Motor"), /cycle/i);
assert.equal(JSON.stringify(nested), before);
"""
    subprocess.run(
        [
            "node",
            "--input-type=module",
            "--eval",
            script,
            str(ROOT / "gui" / "js" / "member-editor.js"),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )


def test_source_preview_uses_edited_nested_struct_and_array_bounds():
    member = lambda name, data_type, **extra: {
        "name": name,
        "data_type": data_type,
        **extra,
    }
    payload = {
        "plc_family": "S7-1500",
        "udts": [{
            "name": "UDT_Motor",
            "fields": [
                member("Cmd", "Struct", struct_members=[
                    member("Start", "Bool"),
                    member("Stop", "Bool"),
                    member("Reset", "Bool"),
                ]),
                member("Sts", "Struct", struct_members=[
                    member("Running", "Bool", comment="Motor running"),
                    member("Fault", "Word"),
                    member("Ready", "Bool"),
                ]),
            ],
        }],
        "dbs": [{
            "name": "DB_Motors",
            "members": [
                member(
                    "Motors",
                    "Array",
                    array_element_type="UDT_Motor",
                    array_lower_bound=1,
                    array_upper_bound=10,
                ),
            ],
        }],
    }
    response = TestClient(app).post("/api/v1/project-source", json=payload)

    assert response.status_code == 200
    source = response.json()["source"]
    assert "Cmd : Struct" in source
    assert "Start : Bool;" in source
    assert "Sts : Struct" in source
    assert "Running : Bool;" in source
    assert "// Motor running" in source
    assert 'Motors : Array[1..10] of "UDT_Motor";' in source
