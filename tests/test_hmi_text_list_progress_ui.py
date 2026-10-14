"""Exercise real XML progress polling with mocked network/timers, no TIA writes."""
import json
from pathlib import Path
import shutil
import subprocess

import pytest


def test_xml_progress_updates_during_post_and_cannot_overwrite_final_result():
    node = shutil.which("node")
    if not node:
        pytest.skip("Node is needed for the XML UI progress regression")
    source = (Path(__file__).resolve().parents[1] / "gui/js/tia.js").read_text("utf-8")
    start = source.index("    async function postTextListWithProgress(")
    function = source[start:source.index("    async function prepareHmiTextList()", start)]
    script = r'''
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const timers = new Map();
let id = 0;
const window = {
    setInterval(callback, delay) {
        assert.equal(delay, 1000);
        timers.set(++id, callback);
        return id;
    },
    clearInterval(timer) { timers.delete(timer); },
};
function deferred() {
    let resolve, reject;
    const promise = new Promise((ok, bad) => { resolve = ok; reject = bad; });
    return {promise, resolve, reject};
}
let post = deferred();
let get = null;
let sent;
const status = {textContent: "Preparing XML"};
const unified = {textContent: ""};
const getJson = async path => {
    assert.match(path, /^\/api\/v1\/tia\/hmis\/translation-progress\/[a-f0-9]{32}$/);
    return get ? get.promise : {stage: "translating", completed: 1, total: 3, elapsed_seconds: 2};
};
const postJson = async (path, payload) => {
    sent = {path, payload};
    return post.promise;
};
const build = new Function("crypto", "window", "getJson", "postJson",
    "hmiReviewQueueActive", "hmiUnifiedStatus", FUNCTION + "\nreturn postTextListWithProgress;");
const request = build(crypto, window, getJson, postJson, true, unified);
const flush = () => new Promise(resolve => setImmediate(resolve));
(async () => {
    const pending = request("/api/v1/tia/hmis/text-lists/prepare", {max_rows: 3}, "Auto Status", status);
    assert.match(sent.payload.progress_id, /^[a-f0-9]{32}$/);
    assert.equal(sent.payload.max_rows, 3);
    timers.values().next().value();
    await flush();
    assert.ok(status.textContent.includes("Ollama translation"));
    assert.ok(status.textContent.includes("1 / 3"));
    assert.equal(unified.textContent, status.textContent);
    get = deferred();
    timers.values().next().value();
    await flush();
    post.resolve({review_id: "prepared", approved_count: 3});
    assert.equal((await pending).review_id, "prepared");
    assert.equal(timers.size, 0);
    status.textContent = "Awaiting explicit approval";
    get.resolve({stage: "ready", completed: 3, total: 3, elapsed_seconds: 5});
    await flush();
    assert.equal(status.textContent, "Awaiting explicit approval");
    get = null;
    post = deferred();
    const rejected = request("/api/v1/tia/hmis/text-lists/import", {review_id: "prepared"}, "Auto Status", status);
    post.reject(new Error("XML verification failed"));
    await assert.rejects(rejected, /XML verification failed/);
    assert.equal(timers.size, 0);
    console.log("XML progress async regression passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
'''
    result = subprocess.run([node, "-e", "const FUNCTION = " + json.dumps(function) + ";\n" + script],
                            capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
    assert "XML progress async regression passed" in result.stdout


def test_automatic_xml_stop_during_prepare_never_starts_tia_import():
    """Stop during read-only Ollama prepare must prevent an XML write."""
    node = shutil.which("node")
    if not node:
        pytest.skip("Node.js required for XML stop-state regression")
    source = (Path(__file__).resolve().parents[1] / "gui/js/tia.js").read_text("utf-8")
    function = source.split(
        "async function startAutomaticXmlBatches({confirmed = false} = {})", 1
    )[1].split("function pauseAutomaticXmlBatches()", 1)[0]
    script = r"""
const assert = require("node:assert/strict");
let hmiXmlAutoRunning = false, hmiTextListBusy = false;
let hmiBatchRunning = false, hmiXmlAutoPauseRequested = false;
let hmiUnifiedPauseRequested = false, hmiUnifiedStopRequested = false;
let hmiXmlAutoVerified = 0, hmiCombinedApprovedCount = 0;
let hmiTextListImportedCount = 0;
const verifiedHmiTextListsScanKey = "valid";
const hmiBatchSizeInput = {value:"3"};
const hmiBatchTotalInput = {value:"3"};
const hmiXmlAutoStatus = {textContent:""};
const hmiXmlAutoProgress = {textContent:""};
const hmiTextListsData = {lists:[{name:"Status", eligible_missing_entries:3}]};
function hmiTranslationSelection() {return {ollama_model:"test", hmi_name:"HMI_RT_1"};}
function hmiScanKey() {return "valid";}
function hmiScopeEnabled(scope) {return scope === "text_lists";}
function eligibleXmlEntries() {return 3;}
function updateHmiTranslateButtonState() {}
function discardHmiTextListReview() {}
function discardHmiReview() {}
function appendHmiRunIssue() {}
function renderUnifiedHmiProgress() {}
async function scanHmiTextLists() {return true;}
let resolvePrepare, importCalls = 0;
async function postTextListWithProgress(path) {
    if (path.endsWith("/prepare")) {
        return await new Promise(resolve => {resolvePrepare = resolve;});
    }
    importCalls++;
    throw new Error("A new TIA import must NOT start after Stop");
}
async function startAutomaticXmlBatches({confirmed = false} = {})""" + function + r"""
(async () => {
    const pending = startAutomaticXmlBatches({confirmed: true});
    assert.equal(typeof resolvePrepare, "function");
    // User presses Stop while Ollama is preparing a read-only batch.
    hmiUnifiedPauseRequested = true;
    hmiUnifiedStopRequested = true;
    resolvePrepare({
        review_id:"prepared", approved_count:1, skipped:[],
        rows:[{entry_index:0, proposal:"Translated"}],
    });
    const state = await pending;
    assert.equal(state, "paused");
    assert.equal(importCalls, 0);
    assert.equal(hmiCombinedApprovedCount, 0);
    assert.equal(hmiXmlAutoRunning, false);
    assert.equal(hmiTextListBusy, false);
})().catch(error => {console.error(error); process.exitCode = 1;});
"""
    result = subprocess.run([node, "-e", script], capture_output=True,
                            text=True, timeout=20)
    assert result.returncode == 0, result.stdout + result.stderr
