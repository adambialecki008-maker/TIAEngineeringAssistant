## Permanent Overview context and uniform collapsed panels — 2026-10-16

- Kept "Engineering context — getting started" permanently visible as an
  information card, not a `details` accordion; an old saved closed state no
  longer hides its instructions.
- Matched every top-level closed engineering panel to the same visual styling
  used by Application UDTs: background, height, padding, font weight and size,
  border, radius and blue chevron. Applies to the Overview profile/TIA controls,
  PLC, UDT, DB, FB/FC, Source preview and Data & Libraries panels.
- Kept nested UDT/DB/IEC declarations and HMI-specific accordions unchanged.
- Added Playwright checks for static visible context and equivalent computed
  closed-header visual metrics on all main tabs. No PLC source or TIA project
  changed.

## Collapsible engineering menus and heading typography — 2026-10-16

- Applied a shared top-level disclosure pattern to Overview, PLC tags/program/
  data structures/Create PLC, UDT and global DB editors and TIA imports, both
  FB/FC creation and TIA imports, offline dependency analysis, Instance DB
  inventory, and all three Source preview cards.
- Existing controls are moved unchanged into native `<details>` panels.
  No handler/ID is removed; local new FB/FC forms and their lists now share
  the same collapsible section. Users can toggle with mouse or keyboard,
  and the open state survives refresh in a separate optional UI preference.
- Main UDT/DB editors and source selection/output begin expanded; supplementary
  engineering modules begin collapsed. Nested variable and PLC tree behavior
  remains independent.
- Standardized application font, page and section heading sizes/weights across
  all tabs, explicitly unifying the three first-page Overview sections.
  Removed the legacy inline 1.1rem/600 typography on local project-profile
  and Data & Library summaries.
- Updated browser tests to open real UI panels before interacting instead of
  bypassing visibility. Added 18-section topology, computed typography,
  keyboard-toggle and state persistence regression.
- Full GitHub Actions `38868927559`: **523 pytest PASS**, JavaScript
  syntax **PASS**, Playwright **PASS**. No TIA code/logic was modified.

## New FB/FC declaration creation — 2026-10-16

- Added `Add new FB` and `Add new FC` forms alongside existing read-only
  TIA import on the FB/FC tab. Name, optional number and LAD/FBD/SCL label can
  be selected without an attached TIA process or Active PLC.
- New local drafts have `source_mode=local`, `created_locally=true`,
  `interface_verified=false`, no XML/program code and all valid section shells.
  They persist in the active project profile and backups. Legacy and TIA
  snapshots remain distinguishable.
- Editable local FB: Input, Output, InOut, Static, Temp, Constant;
  Static also supports Retain and IEC system instance declarations.
  Editable local FC: Input, Output, InOut, Temp, Constant; no Static or
  Instance DB.
- Added explicit backend validation for new local FB/FC, unique names across
  FB/FC, optional numeric block IDs and duplicate member-name checks across
  declaration sections. TIA-snapshot-only validation endpoints remain unchanged.
- New local blocks cannot be claimed as TIA-verified, exported as runnable
  FB/FC code, or written to a real TIA project.
- CI run `38866798072`: **522 pytest PASS**, JS syntax **PASS**, and
  full Playwright **PASS**, including new local FB/FC create/edit/isolation
  regression. Windows adapter build and real-TIA writes were not performed.

## Native IEC read-only XML projections and full CI (2026-10-16)

- The FB import converter now treats actual XML children beneath native Siemens
  timer/counter instances as a typed read-only `system_preview`. The parent
  stays a single native declaration; no synthetic fields, Structs or UDTs are
  generated. Missing internal XML children remain explicitly unavailable.
- Native fields appear under the existing member chevron as a read-only table,
  including exported data type, path, start value and comment when available.
  Changes to a parent type/name discard its old source-derived projection.
- Regression includes a fixture with `TON_TIME` and exported
  `PT/ET/IN/Q` rows, a browser import-conversion test and an assertion that
  the editable declaration count stays one.
- Verified on GitHub Actions run 38864775882 for commit `85d4e4de`:
  **510 Python passed**, JavaScript syntax **PASS**, Playwright **PASS**.
- Still requiring a Windows TIA Portal V21 smoke test: .NET adapter build,
  native instance export variations and direct Instance DB owner metadata.
  No running TIA project was modified.

## Direct GitHub improvements — FB/FC UX and offline dependencies (2026-10-16)

- Condensed FB/FC declarations into one sectioned engineering view with stable
  expansion, inline status chips and optional technical details. Legacy local
  declarations remain editable as drafts while marked TIA-unverified.
- Normalized localized ladder-language metadata to LAD in the app without
  altering the original source XML or blocking older snapshots.
- Updated Playwright tests to open the intentionally collapsed Overview and
  I/O panels. Added a dedicated FB/FC browser regression.
- Fixed Instance DB snapshots to coexist with the existing UDT/global DB
  project validation and export paths. Added read-only direct ownership metadata
  from Siemens Openness (InstanceOfName, InstanceOfType, InstanceOfNumber).
  Runtime behavior must still be checked on a Windows TIA V21 test project.
- Added offline dependency reporting from UDT through FB/FC and Instance DB,
  explicitly identifying unverified associations and blocking all TIA writes.
- Never used destructive Git operations or modified a running TIA project.

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
  local checkout has no `playwright` package installed. The repository CI
  installs it transiently, but this workstation has no `npm` or `npx` binary
  available to reproduce that install locally.
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
