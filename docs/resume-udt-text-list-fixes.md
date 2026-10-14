# Resume: existing UDT reuse and HMI Text List import

Status: investigation; implementation not yet changed.
Branch: codex/fix-udt-reuse-text-list-import
Repository: https://github.com/adambialecki008-maker/TIAEngineeringAssistant
Base commit: c025b1c
Updated: 2026-10-14 (Europe/Warsaw)

## How to continue from browser ChatGPT
Open this repository and this branch, read this file, and continue the requested fixes below. Do not assume desktop-only files or a live TIA connection are available in the browser. Preserve existing user changes. Keep this document current and publish validated checkpoints to this branch so work can be resumed after an account limit. Do not merge incomplete work into main.

## Verified baseline and constraints
- Baseline: .venv/Scripts/python.exe -m pytest -q => 360 passed in 14.01s.
- Initial local changes are generated adapter bin/obj artifacts only. Keep them out of commits; do not reset/delete them.
- No AGENTS.md was found in repository or parent directories.
- Mock Openness/Ollama in unit tests. Do not write/import to a real TIA project automatically.
- Keep create-only/no-overwrite guards, backup acknowledgement, fresh preflight token, explicit selected-object approval, selected PLC/HMI scope, and XML/XLSX safety checks.
- User requested commit and full tests/.NET build in the attached specification. Earlier requests authorize Git push; this task specifically requests durable browser continuation.

## Findings so far
- engine/tia/source_import.py:_compare_existing returns conflict before live structure export if local definition has comments/start values/HMI attributes/DB retain. This conflates unknown metadata with proven structural mismatch.
- Existing configured but unchecked UDT references are also blocked unless comparison returns identical.
- engine/tia/source_import.py:_include_required_udts skips already-existing references; transitive existing UDT compatibility and stable preflight snapshots need review.
- openness_adapter/TiaStructureImport.cs creates only manifest entries, rechecks name collisions under ExclusiveAccess, verifies presence, but has no explicit post-generation compiler check.
- HMI XML import/progress is not investigated yet. Relevant files: engine/tia/hmi_text_list_translation.py, openness_adapter/TiaService.cs, gui/js/tia.js, and tests/test_hmi_text_list_translation.py.

## Next steps
1. Read source_import.py, structures.py/xml_parser.py/models.py and existing import tests. Distinguish structural match, mismatch, and unknown metadata; diagnose precise member mismatch and recursively verify required UDT references.
2. Review official Siemens V21 documentation/local assemblies before changing Openness code. Reuse compatible UDTs without generating their source; verify created DB in the selected PLC and compile it.
3. Investigate XML Text List import and frontend progress using realistic XML fixtures. Ensure reviewed translations are actually retained after re-export and report progress/failures without false success.
4. Add meaningful regressions, run targeted tests, full pytest, JS checks, .NET build, and browser mocks where possible.
5. Update this file with actual changes, exact test results, remaining risks, and the resume command. Commit/push source and docs only. Clearly separate mocks from real TIA verification.

## Original user specification
# ADDITIONAL CRITICAL BUG — EXISTING UDT BLOCKS ALL DEPENDENT DB IMPORTS

Fix this issue as part of the same task. Do not postpone it.

## ACTUAL FAILURE OBSERVED IN TIA PORTAL V21

The user already has `UDT_Motor` in the selected TIA Portal project.

The application tries to import `DB_Motors2`, which depends on `UDT_Motor`.

Current preflight result:

```text
Missing: 0
Identical/skipped: 0
Conflicts: 1
Blocked dependencies: 1
Required UDTs added: none
Nothing eligible for creation.
```

UDT_Motor:
```text
Conflict — skip

Existing source has attributes/RETAIN/start values that
this read-only comparison cannot fully verify;
manual TIA review required. No overwrite.
```

DB_Motors2:
```text
Blocked dependency — skip

Dependency unavailable or mismatched:
UDT_Motor (conflict/blocked).
No import for this object.
```

**THIS BEHAVIOR IS PREVENTING THE USER FROM IMPORTING A NEW DB EVEN THOUGH THE REQUIRED UDT ALREADY EXISTS IN TIA.**

## REQUIRED BEHAVIOR

Implement proper dependency resolution based on actual UDT compatibility.

### CASE A — UDT already exists and is compatible

- Detect `UDT_Motor` in the actual target PLC.
- Read its structure using Siemens TIA Openness V21.
- Compare its data members, data types, array dimensions, nested UDT references and other compatibility-relevant properties with the required UDT definition.
- If compatible, mark it:

  `Existing compatible UDT — reuse, no import required`

- Do NOT regenerate, overwrite or import the UDT.
- Resolve the dependency as satisfied.
- Allow `DB_Motors2` to be independently imported.
- Generate the DB SCL source referencing the existing `UDT_Motor`.
- Compile/validate the resulting DB.

### CASE B — UDT does not exist

- Include the missing UDT automatically in the import plan.
- Import it before the dependent DB.
- Verify UDT creation before proceeding.

### CASE C — UDT exists but is genuinely incompatible

- Identify the exact mismatch: member name, data type, array bounds, nested type, or another compatibility-critical property.
- Show meaningful diagnostics.
- Block only the incompatible UDT and objects depending on it.
- Never overwrite existing objects automatically.

### CASE D — UDT exists but some metadata cannot be compared

**Unknown compatibility must not automatically be mislabeled as a proven conflict.**

Investigate why current comparison cannot verify attributes, RETAIN or start values.

Determine which properties genuinely affect the validity of a DB referencing an existing UDT.

Improve the Openness comparison to retrieve the required information wherever supported.

Separate:

- Verified structural match.
- Verified structural mismatch.
- Unavailable or unverifiable metadata.

Do not require byte-for-byte identical XML exports when TIA adds generated or non-semantic metadata.

If compatibility still cannot be verified automatically, display exactly what is unknown and provide a controlled manual verification workflow for the existing type, without pretending the comparison succeeded. Do not silently bypass structural safety checks.

## CRITICAL DESIGN REQUIREMENT

**Importing a new DB that references an existing compatible UDT must work without importing the UDT again.**

A selected DB should require an available compatible type, not necessarily a newly created type.

Dependency resolution should follow:

```text
Selected DB
    |
    v
Required UDT
    |
    +-- Exists and compatible
    |      |
    |      +--> REUSE existing UDT
    |               |
    |               +--> IMPORT selected DB
    |
    +-- Does not exist
    |      |
    |      +--> CREATE UDT
    |               |
    |               +--> IMPORT selected DB
    |
    +-- Exists but incompatible
           |
           +--> BLOCK dependent DB
                with exact mismatch report
```

## INVESTIGATE

Pay particular attention to:

- `engine/tia/source_import.py`
- `openness_adapter/TiaStructureImport.cs`
- `openness_adapter/TiaService.cs`
- `functions/tia_source_generator.py`
- `gui/js/source_import.js`
- UDT XML export and structure comparison.
- Siemens TIA Openness external source generation.
- Existing `Conflict`, `Identical`, `Blocked` and `Missing` classification logic.

Find why `UDT_Motor` is treated as conflicting merely because its attributes cannot be fully compared.

Check whether the current code uses overly strict equality, incomplete XML inspection, or conflates an existing source with an existing PLC data type.

## TESTS REQUIRED

1. Existing compatible UDT + missing DB → DB import allowed.
2. Existing compatible UDT is NOT imported or overwritten.
3. Missing UDT + missing DB → UDT created before DB.
4. Incompatible UDT + dependent DB → correctly blocked.
5. Unrelated DB remains eligible despite another UDT conflict.
6. Nested UDTs and arrays work correctly.
7. Incomplete metadata is reported separately from verified incompatibility.
8. Existing DB is never silently overwritten.
9. Selected checkboxes are respected; unselected DBs are never generated or imported.
10. Created DB is verified in the selected PLC and can be compiled in TIA.

## EXPECTED RESULT FOR THE REPORTED CASE

Assuming the existing `UDT_Motor` is structurally compatible:

```text
UDT_Motor
Status: EXISTING — COMPATIBLE
Action: REUSE

DB_Motors2
Status: MISSING — READY TO IMPORT
Dependency: UDT_Motor (satisfied)
Action: CREATE

Eligible for creation: 1
Conflicts: 0
Blocked dependencies: 0
```

The **Import to TIA Portal** button should become available after the required backup acknowledgement and successful preflight.

## FINAL INSTRUCTION

Fix BOTH major issues in this task:

1. XML Text Lists translations are not actually appearing in TIA and progress is missing.
2. Existing compatible UDTs incorrectly block dependent DB imports.

Do not merely modify expected test outputs or suppress conflict messages.

Implement the actual functional corrections across Python, C#, Openness and JavaScript as needed.

Commit the changes and run the full tests and .NET build.

Clearly distinguish mocked validation from real TIA Portal V21 verification.

**The final result must enable actual creation of `DB_Motors2` using the already existing compatible `UDT_Motor`, without overwriting that UDT.**
