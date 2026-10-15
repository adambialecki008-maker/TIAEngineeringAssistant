"use strict";
// Simulate only UI state transitions, never any real Siemens/TIA backend call.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(
    path.join(__dirname, "..", "gui", "js", "tia.js"), "utf8"
);
function extract(start, end) {
    const first = source.indexOf(start);
    if (first < 0) throw Error("Missing production source: " + start);
    const last = source.indexOf(end, first + start.length);
    if (last < 0) throw Error("Missing boundary: " + end);
    return source.slice(first, last);
}
const production = [
    extract("function pauseUnifiedHmiTranslation()",
        "function startHmiRunReport()"),
    extract("async function prepareNextReviewedHmiBatch()",
        "async function approveReviewedHmiQueueBatch()"),
    extract("async function approveReviewedHmiQueueBatch()",
        "async function continueReviewedQueueAutomatically()"),
    extract("async function continueReviewedQueueAutomatically()",
        "async function skipReviewedHmiQueueBatch()"),
    extract('hmiReviewEachBatch?.addEventListener("change", () => {',
        "const changeHmiScope"),
    extract("hmiBatchResumeButton?.addEventListener(",
        "hmiBatchPauseButton?.addEventListener("),
];
const resumeRenderer = extract("if (hmiBatchResumeButton) {",
    "if (hmiBatchPauseButton) {");
const runtime = `
const assert = arguments[0];
function deferred() {
    let resolve, reject;
    const promise = new Promise((ok, no) => {resolve = ok; reject = no;});
    return {promise, resolve, reject};
}
const hmiReviewEachBatch = {checked:true, handlers:{},
    addEventListener(type, fn) {this.handlers[type] = fn;},
    change(checked) {this.checked = checked; this.handlers.change();}};
const hmiBatchResumeButton = {disabled:true, handlers:{},
    classList:{toggle() {}},
    addEventListener(type, fn) {this.handlers[type] = fn;},
    click() {
        assert.equal(this.disabled, false, "Resume must be enabled");
        this.handlers.click();
    }};
const hmiUnifiedStatus = {textContent:""};
const hmiBatchSizeInput = {value:"5"};
const hmiEditDetails = {open:false, scrollIntoView() {}};
const hmiEditCaption = {textContent:""};
const latestHmiScan = {missingUnique:100};
const hmiReviewQueueTypes = {project:true, text_lists:false};
const hmiReviewQueueExcludedProject = new Set();
const hmiReviewQueueBlockedLists = new Set();
let hmiReviewQueuePendingSkippedList = null;
let hmiReviewQueueActive = true;
let hmiReviewQueuePending = true;
let hmiReviewQueuePaused = false;
let hmiReviewQueueStopRequested = false;
let hmiReviewQueueOperation = null;
let hmiReviewQueueAutoContinue = false;
let hmiReviewQueueQuota = 10;
let hmiReviewQueueStartApproved = 0;
let hmiReviewQueueProjectExhausted = false;
let hmiReviewQueueCurrentScope = "project";
let hmiCombinedApprovedCount = 0;
let hmiUnifiedRunning = false;
let hmiUnifiedPauseRequested = false;
let prepareCalls = 0, imports = [], autoTransitions = [], manualResumes = 0;
let preparations = [];
function renderResume() {
    const busy = false;
    ${arguments[1]}
}
function updateHmiTranslateButtonState() {renderResume();}
function renderHmiBatchProgress() {}
function hmiScopeEnabled(scope) {return scope === "project";}
function nextEligibleTextList() {return null;}
function finishStoppedReviewedHmiQueue() {throw Error("Unexpected Stop");}
function finishReviewedHmiQueue(message) {throw Error("Premature finish: " + message);}
function appendHmiRunIssue() {throw Error("Unexpected failure");}
async function scanHmiTextLists() {throw Error("Unexpected XML scan");}
async function translateSelectedHmi() {
    ++prepareCalls;
    const d = deferred();
    preparations.push(d);
    return await d.promise;
}
async function prepareHmiTextList() {throw Error("XML is out of scope");}
async function importSelectedHmiBatch(options) {
    // Hold the TIA import/verification Promise open to simulate an active write.
    const d = deferred();
    imports.push({options, deferred:d});
    hmiReviewQueueOperation = "importing / verifying";
    updateHmiTranslateButtonState();
    const outcome = await d.promise;
    if (outcome === true) hmiCombinedApprovedCount += 5;
    return outcome;
}
async function translateAllSelectedHmi(options) {
    autoTransitions.push(options);
}
function showHmiRunReport() {}
async function resumeHmiBatchImport() {manualResumes++;}
${arguments[2]}
async function tick() {
    await Promise.resolve(); await Promise.resolve();
    await Promise.resolve(); await Promise.resolve();
    await Promise.resolve(); await Promise.resolve();
}
function reset({pending=true, paused=false}={}) {
    hmiReviewEachBatch.checked = true;
    hmiReviewQueueActive = true;
    hmiReviewQueuePending = pending;
    hmiReviewQueuePaused = paused;
    hmiReviewQueueStopRequested = false;
    hmiReviewQueueOperation = null;
    hmiReviewQueueAutoContinue = false;
    hmiReviewQueueQuota = 10;
    hmiReviewQueueStartApproved = 0;
    hmiReviewQueueProjectExhausted = false;
    hmiReviewQueueCurrentScope = "project";
    hmiCombinedApprovedCount = 0;
    hmiUnifiedRunning = false;
    hmiUnifiedPauseRequested = false;
    prepareCalls = 0; imports = []; autoTransitions = []; preparations = [];
    hmiUnifiedStatus.textContent = "";
    updateHmiTranslateButtonState();
}
async function run() {
    // A. Switch OFF with an approved review pending: exactly one auto import.
    reset();
    hmiReviewEachBatch.change(false);
    assert.equal(imports.length, 1);
    assert.equal(imports[0].options.automatic, true);
    assert.equal(hmiReviewQueueOperation, "importing / verifying");
    hmiReviewEachBatch.change(false); // Duplicate UI change during write.
    assert.equal(imports.length, 1, "No concurrent second TIA import");
    imports[0].deferred.resolve(true);
    await tick();
    assert.equal(autoTransitions.length, 1);
    assert.equal(autoTransitions[0].carriedVerified, 5);
    assert.equal(autoTransitions[0].preserveRunReport, true);
    assert.equal(hmiCombinedApprovedCount, 5);

    // B. Switch OFF while an already-requested import is in flight; then ON.
    // The verified write completes once and the NEXT batch returns to review.
    reset();
    void approveReviewedHmiQueueBatch({automatic:false});
    assert.equal(imports.length, 1);
    hmiReviewEachBatch.change(false);
    assert.equal(hmiReviewQueueAutoContinue, true);
    assert.equal(imports.length, 1);
    hmiReviewEachBatch.change(true);
    assert.equal(hmiReviewQueueAutoContinue, false);
    imports[0].deferred.resolve(true);
    await tick();
    assert.equal(autoTransitions.length, 0);
    assert.equal(prepareCalls, 1, "Next batch should be prepared for review");
    preparations[0].resolve(true);
    await tick();
    assert.equal(hmiReviewQueuePending, true);
    assert.equal(imports.length, 1, "New batch must await manual approval");
    assert.match(hmiUnifiedStatus.textContent, /Awaiting approval/);

    // C. Paused with a prepared review: OFF must NOT import automatically.
    // Resume is enabled and is the only action that launches the import.
    reset({paused:true});
    hmiReviewEachBatch.change(false);
    assert.equal(imports.length, 0);
    assert.equal(hmiReviewQueuePaused, true);
    assert.match(hmiUnifiedStatus.textContent, /PAUSED/);
    assert.equal(hmiBatchResumeButton.disabled, false);
    hmiBatchResumeButton.click();
    assert.equal(hmiReviewQueuePaused, false);
    assert.equal(imports.length, 1);
    imports[0].deferred.resolve(true);
    await tick();
    assert.equal(autoTransitions.length, 1);

    // D. Review changed while read-only Ollama preparation is IN FLIGHT.
    // If paused before it finishes, import must wait for an explicit Resume.
    reset({pending:false});
    void prepareNextReviewedHmiBatch();
    assert.equal(prepareCalls, 1);
    assert.equal(hmiReviewQueueOperation, "preparing");
    hmiReviewEachBatch.change(false);
    pauseUnifiedHmiTranslation();
    preparations[0].resolve(true);
    await tick();
    assert.equal(imports.length, 0, "Pause before finished prepare blocks write");
    assert.equal(hmiReviewQueuePending, true);
    assert.equal(hmiReviewQueuePaused, true);
    assert.equal(hmiBatchResumeButton.disabled, false);
    hmiBatchResumeButton.click();
    assert.equal(imports.length, 1);
    imports[0].deferred.resolve(true);
    await tick();
    assert.equal(autoTransitions.length, 1);

    // E. OFF while preparing, without Pause -> first safe batch auto-imports.
    reset({pending:false});
    void prepareNextReviewedHmiBatch();
    hmiReviewEachBatch.change(false);
    assert.equal(imports.length, 0);
    preparations[0].resolve(true);
    await tick();
    assert.equal(imports.length, 1);
    imports[0].deferred.resolve(true);
    await tick();
    assert.equal(autoTransitions.length, 1);

    // F. Toggling Review during an already-automatic run only applies
    // to the next run and never spawns a new import.
    reset({pending:false});
    hmiReviewQueueActive = false;
    hmiUnifiedRunning = true;
    hmiReviewEachBatch.change(false);
    hmiReviewEachBatch.change(true);
    assert.equal(imports.length, 0);
    assert.equal(prepareCalls, 0);
    assert.equal(autoTransitions.length, 0);
}
return run();
`;
const execute = new Function(runtime);
execute(assert, resumeRenderer, production.join("\n"))
    .then(() => console.log("HMI review checkbox transitions: PASS"))
    .catch(error => {console.error(error); process.exitCode = 1;});
