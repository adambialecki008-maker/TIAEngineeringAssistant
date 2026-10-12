"""Regression tests for the collapsible PLC member hierarchy.

The hierarchy module does not require the TIA adapter or a browser.
A Node runtime is used for behavior checks when available.
"""
from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]


def test_both_plc_member_tables_use_shared_renderer():
    source = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")
    assert 'from "./plc_member_tree.js"' in source
    assert "renderPlcMemberRows(plcProgramBlockDetailBody, members)" in source
    assert "renderPlcMemberRows(plcStructureDetailBody, detail.members)" in source
    assert 'row.hidden = !tree.isVisible(index)' in source
    assert 'button.setAttribute("aria-expanded", String(expanded))' in source
    assert 'button?.addEventListener("click"' in source


def test_nested_ton_and_struct_toggle_without_hiding_siblings():
    if not shutil.which("node"):
        pytest.skip("Node.js unavailable: pure JS hierarchy behavior test")
    module = ROOT / "gui" / "js" / "plc_member_tree.js"
    script = r"""
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const content = readFileSync(process.argv[1], "utf8");
const url = "data:text/javascript;base64," + Buffer.from(content).toString("base64");
const { createPlcMemberTree } = await import(url);
const rows = [
    {name:"Enable", section:"Input", level:0},
    {name:"Timer", section:"Static", level:0, data_type:"TON"},
    {name:"IN", section:"Static", level:1},
    {name:"ET", section:"Static", level:1},
    {name:"Settings", section:"Static", level:0, data_type:"Struct"},
    {name:"Nested", section:"Static", level:1, data_type:"Struct"},
    {name:"Value", section:"Static", level:2},
    {name:"Counter", section:"Static", level:0},
    {name:"Finished", section:"Output", level:0},
];
const tree = createPlcMemberTree(rows);
assert.deepEqual([0,1,4,5,7,8].map(i => tree.hasChildren(i)),
    [false,true,true,true,false,false]);
assert.equal(tree.isVisible(2), false);
assert.equal(tree.isVisible(6), false);
assert.equal(tree.isVisible(7), true);
assert.equal(tree.isVisible(8), true);
assert.equal(tree.toggle(1), true);
assert.equal(tree.isVisible(2), true);
assert.equal(tree.isVisible(3), true);
tree.toggle(4);
assert.equal(tree.isVisible(5), true);
assert.equal(tree.isVisible(6), false);
tree.toggle(5);
assert.equal(tree.isVisible(6), true);
tree.toggle(4);
assert.equal(tree.isVisible(6), false);
tree.toggle(4);
assert.equal(tree.isVisible(6), true);
assert.equal(tree.toggle(7), false);
assert.equal(tree.isExpanded(7), false);
assert.equal(tree.isVisible(999), false);
"""
    subprocess.run(
        ["node", "--input-type=module", "--eval", script, str(module)],
        check=True, capture_output=True, text=True, timeout=15,
    )
