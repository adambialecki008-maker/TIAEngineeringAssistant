"use strict";
// Execute production diagnosis functions, with no browser or TIA process.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const source = fs.readFileSync(
    path.join(__dirname, "../gui/js/source_import_diagnostics.js"), "utf8"
);
(async () => {
    const {describeSourceImport} = await import("data:text/javascript;base64,"
        + Buffer.from(source).toString("base64"));
    const base = {kind:"db", name:"DB_Motors2", status:"unknown"};
    const raw = 'Existing structure export unavailable: 502: '
        + "Siemens.Engineering.EngineeringTargetInvocationException: "
        + "Error when calling method 'Export' of type 'Siemens.Engineering.SW.Blocks.GlobalDB'."
        + "\\n\\nInconsistent blocks and PLC data types (UDT) cannot be exported."
        + "\\n at TiaService.ExportPlcStructure(...)"
        + "\\n Manual TIA review required; dependent imports remain blocked.";
    const inconsistent = describeSourceImport({...base, reason:raw});
    assert.match(inconsistent.problem, /DB_Motors2/);
    assert.match(inconsistent.cause, /niespójność bloku lub typu danych PLC/);
    assert.match(inconsistent.cause, /Nie oznacza to automatycznie błędu kompilacji/);
    assert.equal(inconsistent.checklist, true);
    for (const name of ["Visible in HMI", "Accessible from HMI/OPC UA",
        "Writable from HMI/OPC UA", "Retain", "Start values"]) {
        assert.ok(inconsistent.issueLines.some(item => item.includes(name)), name);
    }
    assert.match(inconsistent.action, /Porównaj powyższe ustawienia/);
    assert.match(inconsistent.action, /TIA default/);
    assert.doesNotMatch(inconsistent.action, /Skompiluj wymagane/i);
    assert.ok(!inconsistent.cause.includes("EngineeringTargetInvocationException"));
    assert.equal(inconsistent.technical,raw);

    const generic = describeSourceImport({...base, reason:
        'Existing structure export unavailable: 502: Timeout while exporting'});
    assert.match(generic.problem, /DB_Motors2/);
    assert.match(generic.cause, /odrzucił eksport/);
    assert.match(generic.technical, /Timeout/);
    assert.equal(generic.issueLines.length, 0);
    assert.equal(generic.checklist, undefined);
    const retain = describeSourceImport({...base, reason:
        'DB member declarations match, but exported TIA XML does not explicitly confirm Remanence=Retain for Motors.'});
    assert.match(retain.problem, /RETAIN/);
    const other = describeSourceImport({...base,status:"conflict",reason:
        'Ready: start_value differs (application=FALSE, TIA=TRUE). No overwrite.'});
    assert.match(other.issueLines.join(" "), /Ready.*wartość początkowa/);
    const hmi = describeSourceImport({...base,status:"conflict",reason:
        'Ready: hmi_accessible differs (application=True, TIA=False). No overwrite.'});
    assert.match(hmi.issueLines.join(" "), /Dostęp z HMI/);
    const clean = describeSourceImport({...base,status:"identical",reason:
        'Declared DB structure matches. Identical — skip. No import or overwrite.'});
    assert.match(clean.problem, /zgodny/);
    assert.match(clean.action,/nie trzeba nic importować/i);
    const blocked = describeSourceImport({...base,status:"blocked",reason:
        'Dependency unavailable or mismatched: UDT_Motor (unknown). No import.'});
    assert.match(blocked.cause,/UDT_Motor/);
    const warning = describeSourceImport({kind:"udt",name:"UDT_Motor",status:"compatible",
        reason:"Existing compatible UDT — reuse, no import required.",
        metadata_warnings:["Cmd.Start: comments differ; existing comment retained."]});
    assert.match(warning.technical,/Cmd.Start: comments differ/);
    console.log("Preflight Polish diagnostic scenarios: PASS");
})().catch(error => {console.error(error);process.exitCode=1;});
