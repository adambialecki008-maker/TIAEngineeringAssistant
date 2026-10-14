# UDT/DB import pilot — TIA Portal V21

This is a **controlled proof of concept**, not a production import workflow.

## Scope and safety

- Exactly **one UDT and one global DB** from the local UDT/Data Blocks editor.
- The target PLC must already exist in the selected open TIA project.
- The connected PLC must be offline during generation from external source.
- The plan endpoint is **read-only**. It verifies the live TIA project and scans
  the selected PLC for existing UDT and DB names.
- A backup/copy acknowledgement and an additional interactive confirmation
  are required before the apply endpoint is called.
- Before writing, the adapter repeats collision checks (including objects
  inside user folders). Overwriting existing objects is prohibited.
- Imports are performed in dependency order: UDT first, then DB.
- **NOT ATOMIC**: if DB generation fails, an unsaved generated UDT may remain
  in the open TIA project. Inspect and resolve manually; do not blindly retry.
- A successful result means the adapter found both generated objects and
  received a project-save confirmation. Compile the PLC in TIA to verify.
- This workflow **does not** download to the PLC or generate Safety blocks.
- Siemens' external source importer is limited to ASCII in this pilot; using
  non-ASCII comments or identifiers produces a validation error.

## Local test

1. Open **a separate backed-up copy** of a TIA Portal V21 project.
2. Make sure the target CPU is offline.
3. In the application, connect to TIA and select the correct target PLC.
4. Under **UDT**, define `UDT_Motor`; under **Data Blocks**, define
   `DB_Motors` with `Motors : Array[1..10] of UDT_Motor`.
5. In **Source preview**, click **Generate source** and inspect it.
6. Click **Check target and prepare import**. Confirm it reports the correct
   project/PLC and the exact two object names.
7. Only if satisfied, tick **I confirm the open TIA project is a
   test/backup copy**, then click **Import to TIA Portal** and approve.
8. Inspect the generated UDT in PLC data types and DB in Program blocks.
   Compile the PLC in TIA. Record compiler errors verbatim if any.
9. If the import fails, inspect the **open TIA project for partial state**
   before trying again. Do not overwrite or delete existing objects.

## Tests

```powershell
git pull --ff-only
.\.venv\Scripts\python.exe -m pytest tests/test_plc_structure_import.py -q
.\.venv\Scripts\python.exe -m pytest -q
dotnet build .\openness_adapter\TiaOpennessAdapter.csproj
```

Windows TIA Openness V21 and Siemens DLLs are required for meaningful adapter
compilation and end-to-end verification. Unit tests mock the external adapter.
Report the actual local test and compiler results; no end-to-end TIA import
has been performed by the author of this pilot.
