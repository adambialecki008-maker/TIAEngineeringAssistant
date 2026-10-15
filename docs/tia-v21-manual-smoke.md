# Manual Siemens TIA Portal V21 smoke tests (requires Windows)

This checklist cannot run on Linux GitHub Actions. Use a **backup copy** of a
test PLC/HMI project; never use a production project. Do not download to a CPU.

1. Open the backed-up test project in TIA V21. Confirm Openness permissions,
   software version, target device and sufficient spare UDT/DB names.
2. Import a new UDT containing a Struct and an Array. Import a new global DB
   referencing that UDT. Compile the PLC; re-export XML and confirm declarations
   and addresses. Re-run import preview and expect only skip/reuse.
3. Existing UDT with identical declarations: **Compatible — reuse**.
   Existing matching DB: **Identical — skip**. Existing DB with verified
   XML `Remanence="Retain"` and requested Retain: expect Identical — skip.
   A mismatch or missing remanence must never result in an overwrite.
4. Edit an existing type so its declarations differ. Confirm conflict
   and no overwrite, then verify dependent DB imports are blocked while
   independent selected types can be created.
5. For HMI Project Texts, export XLSX, translate a test copy, import it,
   reopen/refresh TIA, re-export and compare the exact cells.
6. For HMI Text Lists, export XML, translate one selected list, explicitly
   approve as configured, import using Openness, refresh TIA and re-export
   to prove exact target-language values changed. A green web status
   alone is **not** proof of import.
7. Restart FastAPI and revisit Data & Libraries; check profiles persist and
   switching disconnects the TIA selection. Import an exported library
   JSON on a second browser profile and verify Struct/Array fields,
   UDT dependency order, revision history, snapshot recovery and conflicts.
8. Record the TIA project version, PLC and HMI model, adapter build output,
   each import confirmation, compile outcome and re-export evidence.

Do not mark this checklist PASS until it has been executed on an actual
Windows machine with TIA Portal and Siemens Openness DLLs installed.
