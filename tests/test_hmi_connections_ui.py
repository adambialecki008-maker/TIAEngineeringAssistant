"""DOM-level regression checks for the HMI connection UI without TIA."""
from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js unavailable")
def test_hmi_connection_cell_expands_only_multiple_connections():
    script = r"""
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(
    path.join(process.argv[1], "gui/js/tia.js"), "utf8");
const start = source.indexOf("    function hmiConnectionsCell(hmi) {");
const end = source.indexOf("    function renderExistingHmis()", start);
assert(start >= 0 && end > start);
const document = {createElement(tag) {
    return {tag, children: [], textContent: "", title: "",
        appendChild(child) {this.children.push(child);}};
}};
const render = vm.runInNewContext(
    "(" + source.slice(start, end).trim() + ")", {document});
assert.equal(render({connections: [], connection_read_status: "complete"})
    .textContent, "No connections");
assert.equal(render({connections: [], connection_read_status: "partial"})
    .textContent, "Connections unavailable");
const single = render({connections: [{name: "Only"}],
    connection_read_status: "complete"});
assert.equal(single.children.length, 1);
assert.equal(single.children[0].textContent, "Only");
const example = render({connections: [
    {name: "HMI_Connection_1", communication_driver: "SIMATIC S7 1500",
        partner: "PPFKA2"},
    {name: "Krata1", communication_driver: "OPC UA"}],
    connection_read_status: "complete"});
assert.equal(example.children[0].textContent, "HMI_Connection_1");
assert.equal(example.children[1].tag, "details");
assert.equal(example.children[1].children[0].textContent, "+1");
assert.equal(example.children[1].children[1].textContent.includes("PPFKA2"), true);
assert.equal(example.children[1].children[2].textContent.includes("OPC UA"), true);
const many = render({connections: ["A", "B", "C", "D"]
    .map(name => ({name})), connection_read_status: "complete"});
assert.equal(many.children[1].children[0].textContent, "+3");
"""
    result = subprocess.run(
        ["node", "-e", script, str(ROOT)], capture_output=True,
        text=True, check=False,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js unavailable")
def test_clone_source_remains_selectable_without_connection():
    script = r"""
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const elements = new Map();
function element(tag) {
    return {tag, value: "", textContent: "", disabled: false,
        options: [], checked: false,
        classList: {toggle() {}},
        appendChild(child) {
            if (this.tag === "select") this.options.push(child);
        },
        replaceChildren() {this.options = []; this.value = "";},
        addEventListener() {}, scrollIntoView() {},
        get selectedOptions() {
            return this.options.filter(item => item.value === this.value);
        }};
}
const ids = ["tia-hmi-clone-source", "tia-hmi-clone-plc",
    "tia-hmi-clone-connection", "tia-hmi-clone-device-name",
    "tia-hmi-clone-ip", "tia-hmi-clone-backup",
    "tia-hmi-clone-button", "tia-hmi-clone-status",
    "tia-hmi-device-menu"];
for (const id of ids)
    elements.set(id, element(id.includes("source") || id.includes("plc")
        || id.includes("connection") ? "select" : "div"));
const document = {getElementById(id) {return elements.get(id);},
    createElement: element};
const source = fs.readFileSync(path.join(process.argv[1],
    "gui/js/hmi_device_management.js"), "utf8");
const init = vm.runInNewContext(
    source.replace("export function", "function")
    + "\ninitHmiDeviceManagement", {document});
const base = {hmi_name: "HMI_RT_1", ip_address: "192.168.1.3",
    software_type: "Siemens.Engineering.Hmi.HmiTarget"};
const hmis = [
    {...base, device_name: "No_Link", connections: [], plc_connections: []},
    {...base, device_name: "HMI_00_Main", connections: [
        {name: "HMI_Connection_1", communication_driver: "SIMATIC S7 1500"},
        {name: "Krata1", communication_driver: "OPC UA"}],
        plc_connections: ["HMI_Connection_1", "Krata1"]},
];
const ui = init({getHmis: () => hmis, getPlcs: () => [],
    getProcessId: () => 23464, postJson() {}, refreshProject() {}});
const sourceSelect = elements.get("tia-hmi-clone-source");
assert.equal(sourceSelect.options[1].disabled, false);
ui.openFor(hmis[0]);
assert.equal(sourceSelect.value, "0");
assert.equal(elements.get("tia-hmi-clone-button").disabled, true);
ui.openFor(hmis[1]);
const connection = elements.get("tia-hmi-clone-connection");
assert.equal(connection.options.length, 3);
assert.equal(connection.options[1].value, "HMI_Connection_1");
assert.equal(connection.options[2].disabled, true);
assert.equal(connection.value, "HMI_Connection_1");
"""
    result = subprocess.run(
        ["node", "-e", script, str(ROOT)], capture_output=True,
        text=True, check=False,
    )
    assert result.returncode == 0, result.stderr
