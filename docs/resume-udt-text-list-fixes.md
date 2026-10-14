# Resume: existing UDT reuse and HMI Text List import

Status: code fixes completed, committed and pushed; all automated checks passed. Real TIA write/import verification remains user-operated on a backup.
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

## Completed functional fix 1: existing UDT reuse
- source_import.py reads the actual selected PLC type structure before classification. Compatible ordered declarations are reused, with separate metadata warnings; unavailable structure is unknown rather than conflict. Exact member/type/order mismatch remains conflict.
- Required configured UDTs are compared transitively even if unchecked/already existing. Referenced live types without local member definitions are exported and checked for consistency. Apply token includes semantic observed structure; a changed reused type invalidates approval.
- xml_parser.py reads explicit start/HMI/remanence/AT metadata and avoids treating array element start values as declarations or inherited child comments as parent comments. UDT/array informative expansions do not cause extra-member conflicts.
- C# batch import still generates only missing manifest objects under no-overwrite guards. Each created DB is located in the selected PLC and compiled through ICompilable; Python requires both creation and compile confirmations.
- UI separates compatible/reuse, unknown/manual review, conflict and blocked; explicitly reports retained existing UDT metadata.
- Verification: targeted pytest tests/test_plc_structure_import.py tests/test_generate_structure_selection_ui.py tests/test_tia_openness.py => 62 passed in 2.20s. node --check gui/js/source_import.js passed. dotnet build openness_adapter/TiaOpennessAdapter.csproj --no-restore => 0 warnings, 0 errors.
- These are mocked Openness tests plus compilation against locally installed Siemens V21 assemblies. No real TIA write/import was executed. Live verification must confirm DB_Motors2 creation with the existing UDT_Motor and unchanged UDT.
- Compatibility scope is DB declaration structure. Existing UDT defaults/HMI/retention/comments are retained and reported; they are never claimed identical to requested metadata. Unknown structural layout remains blocked; inspect/export/repair the existing type in TIA and re-run preflight (no unchecked override).

## Follow-up: live array dependency references
- Final control found live Array of String[n]/WString[n] and multidimensional arrays could be treated as complete UDT names by the transitive resolver. Dependency parsing now extracts only the element type; complete bounds remain in structural comparison.
- Three additional mocked regressions passed: tests/test_plc_structure_import.py => 39 passed in 1.91s.
- First final full suite before this follow-up: 383 passed in 13.45s; .NET build 0 warnings/errors and JS checks passed. Final full-suite rerun after this follow-up: 386 passed in 11.98s (0 failed, 0 skipped).

## Completed functional fix 2: native V21 Text List XML and progress
- Real read-only exports revealed changing DocumentInfo/Created timestamps, hexadecimal engineering IDs, and ordinary body/p/br line breaks. The old snapshot treated export timestamps as content changes and rejected line-break lists as rich formatting.
- Fingerprint ignores only DocumentInfo/Created and generated hex IDs on known engineering tags. It still checks list identity, entry order, values, languages, leaf text, structure, references and other metadata.
- Plain unstyled body/p/br is mapped to newlines and written back using real br elements; source/other-language strings stay protected. Styled text, fields/OpenLinks, multiple paragraphs and unmapped content remain blocked.
- New target-language items mint unused hexadecimal IDs, avoiding collision with existing A-F IDs.
- Prepare and import use the existing translation-progress endpoint. UI polls manual/automatic XML preparation, QA, import and independent re-export; verified totals increase only after confirmed re-export. Timers stop on success/error and late polls cannot replace the final result.
- Targeted checks: XML translation/inventory/auto-review/batch UI/scope tests => 72 passed in 2.03s; XML translation plus asynchronous Node progress regression => 36 passed in 2.17s. node --check gui/js/tia.js passed.
- Real TIA READ-ONLY check: process 23464, project OpennnesTest_Torowisko, HMI_00_Main/HMI_RT_1. Two consecutive exports of 33 lists have 33 stable fingerprints. Parsed 154 plain entries (15 with line breaks), 97 eligible missing targets, all 33 lists plain-supported. Imports/writes performed: zero.

## Real TIA limitation discovered
- Selected PLC S7-1500/1515F-2PN / PPFKA2 contains UDT_Motor with IsConsistent=False. Siemens V21 explicitly refuses its export: "Inconsistent blocks and PLC data types (UDT) cannot be exported." DB_Motors2 was not found in the read-only inventory.
- Do NOT claim this particular live UDT is compatible or that DB_Motors2 has been created. The application reports unknown/blocked until the user repairs/compiles this existing UDT in TIA and its structure can be exported. No automatic modification of the existing type was performed.

## Final verification and commits
- Final full suite: .venv/Scripts/python.exe -m pytest -q => 386 passed in 11.98s, 0 failed, 0 skipped.
- Final .NET build of the changed adapter: dotnet build openness_adapter/TiaOpennessAdapter.csproj --no-restore => succeeded, 0 warnings, 0 errors (3.13s). Later follow-up changed only Python dependency parsing/tests.
- node --check gui/js/tia.js and gui/js/source_import.js passed. git diff --check passed.
- UI progress regression executes the real JS helper using Node with mocked network/timers; unit/API Openness and Ollama tests are mocked. No full browser end-to-end import was executed.
- Functional commits: a01700f (compatible UDT reuse/DB compile), c8d9c01 (native XML/progress), 94f06e5 (live array dependencies). All are pushed to codex/fix-udt-reuse-text-list-import. Main was not merged automatically.
- Existing generated adapter bin/obj changes remain local and were excluded from commits.

## Remaining work / manual verification
No unfinished implementation is known from the reported bugs. Real TIA write verification is still required; browser ChatGPT must not assume it has access to the desktop TIA process.
1. On a TIA backup, repair/compile existing UDT_Motor until Siemens can export it. Check target for DB_Motors2 only; verify compatible/reuse and a DB-only creation plan. Acknowledge backup and explicitly approve import. Check DB compilation and unchanged UDT. Unknown structure must remain blocked; never force reuse.
2. For HMI, restart the backend and refresh the page, select the same HMI/source/target, scan, prepare 1-2 XML entries including a line break, review/approve import, and verify the target language in TIA and re-export. Use the actual target language view rather than only the source language. Test automatic batches only after this manual test succeeds.
3. If a real test fails, record exact diagnostics, use focused mocked regressions, fix the cause incrementally, commit/push each completed fix to this branch and update this document. Never retry an uncertain TIA write blindly.

## Browser continuation prompt
Continue work in repository adambialecki008-maker/TIAEngineeringAssistant on branch codex/fix-udt-reuse-text-list-import. Read docs/resume-udt-text-list-fixes.md first. Both code fixes and automated checks are complete; remaining real TIA checks and the actual inconsistent UDT limitation are recorded there. Use the user's new live diagnostics to guide any follow-up. Preserve no-overwrite/XML safety checks, avoid unrelated refactoring, and publish each tested functional fix plus an updated checkpoint to this branch.

## Siemens references consulted
- [V21 interface XML declarations and WithDefaults](https://docs.tia.siemens.cloud/r/en-us/v21/tia-portal-openness-api-for-automation-of-engineering-workflows/export/import/importing/exporting-data-of-a-plc-device/blocks/xml-structure-of-the-block-interface-section)
- [V21 compilation services and diagnostics](https://docs.tia.siemens.cloud/r/en-us/v21/tia-portal-openness-api-for-automation-of-engineering-workflows/tia-portal-openness-api/functions-for-projects-and-project-data/compiling-a-project)

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
