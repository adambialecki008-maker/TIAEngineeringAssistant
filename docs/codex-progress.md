# Codex development progress

## FB/FC declaration drafts and TIA block analysis

- Reoriented the program-block area around TIA snapshots. SCL, LAD, KOP and
  FBD Function Blocks are read from TIA with their original XML preserved;
  program logic is neither translated, generated nor written back.
- Kept a local declaration editor for a snapshot's interface only. Changes to
  FB Input, Output, InOut, Static, Temp and Constant are explicitly marked as
  local drafts, can be discarded back to the imported interface, and never
  modify TIA. Expanded section state survives a render/checkpoint refresh.
- Added FC snapshots and the same declaration editor for Input, Output, InOut,
  Temp and Constant. The FC model rejects Static, IEC system instances and
  retain settings; Instance DBs remain FB-only. Function and FB names cannot
  collide in an offline project.
- FB Static retains IEC-instance and verified multi-instance type support;
  both are local declaration drafts and depend only on verified TIA snapshots.
- Disabled FB SCL source generation so UDT/global-DB generation stays
  available without regenerating or altering any FB/FC program logic.
- Validation: targeted FB/FC tests — 21 passed; full `pytest -q` — 497
  passed; all non-Playwright Node scenarios passed (including 41 HMI state
  machine scenarios). Browser-specific Node tests could not start because the
  local checkout has no `playwright` package installed.
- Commit: `ca07e88` (`feat(program): add local FB and FC declaration drafts`).
- Remaining: parse actual Instance DB-to-FB links from verified TIA exports,
  add richer dependency/preflight reporting for FB/FC declaration drafts, and
  validate browser flows once the local Playwright dependency is available.

## Read-only Instance DB inventory

- Added an Instance DB inventory in the FB/FC area. It accepts only adapter
  entries whose concrete TIA block kind is `InstanceDB`, stores them per local
  profile, and performs no TIA write.
- The model deliberately keeps `function_block` empty and its relationship
  `Unverified`: the current read-only adapter inventory identifies Instance
  DBs but does not provide reliable owning-FB metadata. The UI never guesses
  from names or matching layouts.
- Validation: dedicated model/API tests — 2 passed; full `pytest -q` — 499
  passed.
- Commit: `e2a4c99` (`feat(tia): add read-only instance DB inventory`).
- Remaining: obtain an evidenced Openness/XML owner relation before rendering
  a verified FB-to-Instance-DB link or enabling structural previews from it.

## FB/FC declaration dependency checks

- Added project validation for nested declaration references: an FB can refer
  to another FB only through `Static` multi-instance members; an FC cannot
  contain FB multi-instances at all. Name collisions between FC and FB are
  also rejected.
- FB and FC views now summarize UDT dependencies and surface an FC reference
  to an FB as a problem before any future export/import path could use it.
- Validation: dependency tests — 17 passed; full `pytest -q` — 500 passed.
- Commit: `e8c1081` (`feat(program): validate FB and FC declaration dependencies`).
- Remaining: use verified TIA relation metadata for Instance DB ownership and
  extend preflight reports with this same dependency graph.

## Read-only LAD/KOP Function Block snapshots

- Extended the TIA FB inventory/import flow to include consistent `LAD` and
  `KOP` blocks alongside SCL. The importer requests and stores the original
  XML only for LAD/KOP, preserving their network logic as an opaque snapshot;
  it never translates that logic to SCL or writes to TIA.
- Added explicit FB source modes and interface verification. A read-only
  LAD/KOP snapshot shows its original XML and declarations in the local model.
  Any declaration that cannot be converted losslessly marks the interface
  **Unverified**, keeping the source while blocking export and multi-instance
  use.
- Verified LAD/KOP snapshots now appear as multi-instance type candidates in
  the Static section of local SCL FBs. Project dependency validation rejects
  unverified snapshots as multi-instance targets.
- Source generation fails closed for a read-only LAD/KOP snapshot: it reports
  that the original logic cannot safely be emitted as SCL.
- Validation: targeted model/API/editor tests — 38 passed; Node syntax checks
  for all changed browser modules passed; full regression — 491 passed.
- Commit: `8708240` (`feat(fb): preserve LAD and KOP snapshots`).

## Read-only Function Block import and compact engineering controls

- Added a read-only TIA Function Block import on the **Function Blocks** tab.
  It inventories only consistent SCL FBs, exports the selected declaration,
  verifies that the active process/PLC/profile did not change, validates it
  locally, and then stores the copy in the active project profile. TIA is not
  modified.
- The conversion preserves Input, Output, InOut, Static, Temp and Constant
  declarations through the same lossless Struct/Array converter as UDTs. It
  supports registered IEC system instances only in Static; nested internal
  fields and unsupported declaration shapes stop the import safely.
- Added a local validation endpoint for FB imports and kept ordinary program
  block/structure API responses backward compatible: `system_instance` is
  emitted only when it is true.
- Made Overview controls (profiles, TIA connection and active PLC) and all
  Device/IO engineering sections collapsible while preserving mounted controls
  and their state.
- Validation: `pytest -q` — 487 passed; `node --check` for changed browser
  modules passed. No real TIA write was performed.
- Commit: `d1db2ba` (`feat(fb): import SCL function blocks from TIA`).
- Remaining: actual Openness creation/import of FB and Instance DB remains
  deliberately unsupported until it can be validated with TIA Portal V21.

## IEC instances in Function Blocks

- Added a context-only path for Siemens system instances in the `Static`
  section of local Function Blocks. UDT and global DB editors remain blocked
  from using these types.
- The available IEC instance list is filtered by the active PLC family from the
  shared Siemens type registry. No internal IEC fields are generated.
- Validation: `node --check gui/js/member-editor.js`, `node --check gui/js/fb.js`;
  `pytest -q tests/test_member_editor.py tests/test_function_block.py
  tests/test_siemens_type_registry.py` — 9 passed.
- Commit: pending.
- Remaining: make the FB model carry explicit system-instance metadata, add
  FB dependency validation and implement local Instance DB previews.

## FB multi-instance dependencies

- Project validation now rejects duplicate FB names and circular references
  created by Static members whose type names are local FBs.
- Validation: `pytest -q tests/test_function_block.py` — 4 passed.
- Commit: pending.
- Remaining: offline Instance DB model and structural preview.

## Offline Instance DB

- Added an Instance DB model tied to exactly one local Function Block.
- Its preview is derived from the FB Static section; the DB has no independent
  editable interface and carries an explicit unverified-TIA marker.
- Validation: `pytest -q tests/test_function_block.py` — 5 passed.
- Commit: pending.
- Remaining: safe SCL generation for FB declarations and offline export.

## Safe FB SCL generation

- Added declaration-only SCL generation for supported FB sections, reusing the
  existing member generator for UDTs, arrays, structs, comments and attributes.
- IEC instance declarations fail closed with a TIA-compilation-unverified error.
- Validation: `pytest -q tests/test_function_block.py tests/test_scl_bundle_export.py` — 11 passed.
- Commit: pending.
- Remaining: extend offline source ZIP and preflight dependency reporting for FBs.

## FB project source integration

- Safe FB declarations now participate in the offline project source preview.
- Validation: `pytest -q tests/test_function_block.py tests/test_udt_db_without_plc_family.py` — 11 passed.
- Commit: pending.
- Remaining: ZIP manifest and preflight dependency reporting for FBs; real TIA import remains intentionally unsupported.
