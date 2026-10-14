# UDT / global DB import — TIA Portal V21

## Supported workflow

The source editor supports **independent checkbox selection of multiple UDTs
and global DBs**. Only selected items and missing required UDT dependencies
are considered for generation/import; unselected independent DBs are excluded.

The preflight is read-only. It compares selected objects and required type
dependencies with the **selected target PLC** in the running TIA project.
Possible decisions include:

- **Missing**: eligible for create-only import.
- **Existing and compatible**: reuse the existing UDT as a DB dependency;
  do not recreate it.
- **Conflicting or unverifiable**: block the affected item and its dependent
  objects; do not silently override compatibility checks.
- **Existing equivalent object**: skip rather than overwrite.
- **Unrelated independent object**: can remain eligible even if a different
  dependency conflicts.

Missing UDT dependencies are imported in dependency order before their DBs.
Compatible existing UDTs are reused. Retentive DB sections must use valid
SCL syntax, e.g. `VAR RETAIN`, not separate `RETAIN` and `VAR` lines.

## Safety guarantees and limitations

- Import into a **backed-up test copy** first, with the target PLC offline.
- The user must acknowledge the backup and confirm import.
- Import is **create-only**: existing UDTs/DBs are never overwritten.
- A batch is **not atomic**. If the DB import fails, earlier generated UDTs
  may remain in the open project. Check TIA before retrying.
- Preflight and apply repeat collision/identity checks; an unknown
  compatibility result must never be treated as a verified match.
- No PLC download or generation of Safety blocks is performed.
- Inspect and compile the resulting DB/UDT in TIA even when the adapter
  reports import success.

## Manual smoke test

1. Open a backed-up project in TIA V21; select the target PLC.
2. Define `UDT_Motor` and `DB_Motors` with an array of `UDT_Motor`.
3. Select only `DB_Motors` for import; inspect **Generate source**.
4. If `UDT_Motor` already exists and is compatible, the preflight must
   select **reuse** for the UDT and **create** for the missing DB.
5. If the UDT is absent, confirm it is included as a required dependency.
6. Inspect the read-only preflight report and explicit backup acknowledgement
   before importing.
7. Confirm the objects exist in the correct PLC, then compile in TIA.
8. Re-run preflight: previously imported objects must not be overwritten.
9. For a mismatched existing UDT, confirm the dependent DB is blocked and
   the diagnostics identify the reason.

## Local validation

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_plc_structure_import.py -q
.\.venv\Scripts\python.exe -m pytest -q
dotnet build .\openness_adapter\TiaOpennessAdapter.csproj
```

The automated tests use mock adapters for many paths. The user has confirmed
successful manual UDT/DB imports in TIA V21 on a test project. A successful
manual sample is not blanket production validation for all target configurations.
