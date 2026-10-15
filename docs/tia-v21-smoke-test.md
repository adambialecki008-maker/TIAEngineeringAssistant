# Siemens TIA Portal V21 — manual integration smoke test

**Status: NOT EXECUTED in GitHub Actions.** This procedure requires a Windows
machine with TIA Portal V21, Siemens Openness installed and configured, and a
disposable PLC/HMI test project. Passing offline Node/Python/Playwright tests
does not establish that any TIA XML was imported successfully.

## Mandatory safety gates

1. Clone/archive the test TIA project and keep its backup outside the project
   folder. Record the project version, CPU type, HMI target and TIA process ID.
2. Confirm the destination is a **test project**, not production. Do not
   download to a live CPU/HMI.
3. The operator must explicitly approve **each write attempt** to TIA,
   including imports, project changes and saves. Preflight and reads require
   no TIA project writes.
4. List representative existing UDTs, DBs, Project Texts and HMI Text Lists,
   and export their XML/XLSX as a before-image.
5. Verify the Windows .NET Framework 4.8 adapter builds successfully. Keep
   `openness_adapter/bin` and `obj` out of Git commits.

## A. Read DB and UDT into the local editor (no TIA write)

1. Start the backend and connect to the open test TIA process.
2. On **Overview**, select the TIA process and the intended **Active PLC**. No PLC family selection is required for UDT/DB work.
3. In the UDT tab, use **Read UDT list from TIA** and import one UDT.
4. In the DB tab, use **Read DB list from TIA**. Only consistent **GlobalDB**
   records are eligible; InstanceDB and inconsistent blocks are excluded.
5. Select a DB referencing a nested UDT or `Array[lower..upper]` of UDT.
   Click **Import DB into editor**. Confirm the proposed dependency UDTs.
6. Check member names, nested declarations, Array bounds and comments against
   the TIA global DB. In Static, verify Retain on two different variables,
   plus individual Visible/Accessible/Writable checkboxes. Unknown Retain in
   the XML blocks import; there is no manual override in this screen.
7. Reload the browser. Confirm objects persisted only in the selected local
   profile. Repeat the import and confirm the existing local DB is not
   overwritten. Verify TIA XML and project contents are **unchanged**.

## Offline SCL package (no TIA connection)

In **Source preview**, select UDTs and/or DBs and click **Download UDT/DB SCL (ZIP)**.
The archive contains one numbered `.udt` or `.db` file per definition, with
required configured UDTs included automatically in dependency order.
`manifest.json` lists source file hashes (SHA-256), dependencies and
unresolved external type references. This is an offline export only: it does
not connect to Siemens Openness or guarantee compilable SCL.

Review the exported sources and resolve external types before a manually
approved create-only import into an archived test project. Duplicate names
across the configured UDT/DB definitions are rejected even when only one of
the duplicated objects is selected, so a dependency cannot silently resolve
to the wrong definition.

## B. UDT → DB create-only write with dependencies

1. Prepare a new UDT (with Struct, Array and nested UDT reference), plus a
   global DB referencing that UDT; choose new names not used by TIA.
2. Generate local source and run read-only **preflight**. Verify dependency
   order (nested UDT → parent UDT → DB), all requested names and no cycles.
3. Approve the explicit TIA write in the backed-up test project.
4. Before approving, open **Details → Declaration differences** on every
   conflict. Compare all missing, additional and changed member paths/types
   in the structured table or CSV report. Preflight must not overwrite.
   After review, import only approved missing objects and check that
   Openness confirms each created object and compiled DB.
5. Save, compile in TIA, inspect UDT/DB declarations and re-export XML.
6. Run the same preflight a second time. Existing identical DBs must report
   **Identical — skip** and compatible UDTs must be reused. No duplicates
   should be generated.
7. Generate a test optimized global DB with Static variables:
   `Ready: Bool` (NON_RETAIN), `Counter: DInt` (RETAIN) and
   `Settings: Struct` (RETAIN). Check grouped SCL `VAR`/`VAR RETAIN`
   declarations. Explicitly approve the create-only write, compile in TIA
   Portal V21 and re-export the DB XML. Confirm Retain and
   Visible/Accessible/Writable for each variable. This must remain a manual
   smoke test: automated CI cannot prove that TIA compiles mixed Retain.

8. Prepare a differently declared existing UDT/DB name. Preflight must block
   overwriting. The originally existing object must remain byte-for-byte or
   semantically equivalent to its before-export.

## C. HMI translations

1. With a test HMI selected, export **Project Texts XLSX** and record source
   and target culture columns. Prepare a small reviewed translation.
2. Explicitly approve the TIA import, perform the XLSX import, refresh TIA
   and re-export XLSX to compare exact target-language cells.
3. Separately export a **HMI Text List XML**, review a small translated
   subset, and explicitly approve the import. Refresh TIA and re-export XML.
4. Verify values in TIA and in re-exported files; a web progress indicator
   alone does not prove the PLC/HMI accepted the changes.
5. Confirm unrelated languages, text entries and lists have not changed.

## Evidence and pass criteria

Record each target identity, before/after XML/XLSX file, planned action,
approval, adapter output, compile result and re-export comparison. Mark an
individual case PASS only after inspecting the real TIA project. If an
unexpected write/conflict occurs, stop, do not retry automatically, and
restore the disposable project from the archive.

**Automated coverage (no real TIA):**
`tests/udt_import_runtime.cjs`, `tests/db_import_runtime.cjs`,
`tests/io_udt_browser.cjs`, `tests/db_import_browser.cjs`,
`tests/library_transfer_browser.cjs` and Python tests for
`/api/v1/tia/plc-structure` / create-only preflight.
