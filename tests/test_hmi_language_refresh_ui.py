"""Run language refresh with a mock DOM; no TIA or Ollama calls."""
from pathlib import Path
import shutil
import subprocess

import pytest


def test_post_import_language_refresh_preserves_verified_quota():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node required for UI regression")
    source = (Path(__file__).resolve().parents[1] / "gui/js/tia.js").read_text("utf-8")
    populate = source.split("    function populateHmiTranslationLanguages(", 1)[1].split(
        "    function openHmiTranslation(", 1)[0]
    refresh = source.split("    async function refreshProjectLanguages(", 1)[1].split(
        "    function renderEmptyPlcs(", 1)[0]
    functions = "function populateHmiTranslationLanguages(" + populate
    functions += "async function refreshProjectLanguages(" + refresh
    script = r'''
const assert = require('node:assert/strict');
let count = 10;
let fail = false;
let projectLanguages = [];
const selectedHmiForTranslation = {};
const select = value => ({value, replaceChildren() {}, appendChild() {}});
const hmiSourceLanguageSelect = select('en-US');
const hmiTargetLanguageSelect = select('pl-PL');
const document = {createElement: () => ({})};
const projectLanguageLabel = item => item.culture;
const selectedProcessId = () => 123;
const setHmiTranslationStatus = () => {};
const invalidateHmiPreview = (reset = true) => { if (reset) count = 0; };
const getJson = async () => {
    if (fail) throw new Error('language read failed');
    return [{culture: 'en-US', is_active: true}, {culture: 'pl-PL', is_active: true}];
};
FUNCTIONS
(async () => {
    await refreshProjectLanguages(true);
    assert.equal(count, 10);
    assert.equal(hmiSourceLanguageSelect.value, 'en-US');
    assert.equal(hmiTargetLanguageSelect.value, 'pl-PL');
    fail = true;
    await refreshProjectLanguages(true);
    assert.equal(count, 10, 'language refresh failure cannot erase confirmed writes');
    fail = false;
    await refreshProjectLanguages();
    assert.equal(count, 0, 'normal selection refresh resets quota');
})().catch(error => { console.error(error); process.exitCode = 1; });
'''.replace("FUNCTIONS", functions)
    result = subprocess.run([node, "-e", script], capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
    importer = source.split("async function importReviewedHmiTexts()", 1)[1].split(
        "async function refreshProjectLanguages(", 1)[0]
    assert "await refreshProjectLanguages(true);" in importer


def test_xml_rescan_keeps_unfinished_list_first():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node required for UI regression")
    source = (Path(__file__).resolve().parents[1] / "gui/js/tia.js").read_text("utf-8")
    code = source.split("            const previousOrder =", 1)[1].split(
        "            hmiTextListsData = data;", 1)[0]
    script = '''
const assert = require('node:assert/strict');
let hmiTextListsData = {lists: [{name: 'A'}, {name: 'B'}]};
const data = {lists: [{name: 'B', eligible_missing_entries: 10},
    {name: 'A', eligible_missing_entries: 5}]};
''' + "const previousOrder =" + code + '''
assert.deepEqual(data.lists.map(item => item.name), ['A', 'B']);
assert.equal(data.lists[0].eligible_missing_entries, 5);
'''
    result = subprocess.run([node, "-e", script], capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
