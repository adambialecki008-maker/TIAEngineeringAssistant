## Python regression alignment for one-level Library panels — 2026-10-16

- Replaced the outdated Python assertion that required a nested
  `importSection` disclosure with checks for the single outer Import Library
  panel, visible JSON workflow and preserved Selective import operation.
- Added assertions that Recovery snapshots uses its outer disclosure and a
  directly visible saved-snapshot list.
- Playwright continues to check actual file selection and visibility; no
  application behavior or TIA logic was changed in this commit.

## Fix redundant Library / Recovery disclosures — 2026-10-16

- Data & Libraries > Import Library now uses only its outer collapsible card.
  JSON upload, preview and import controls appear immediately when it opens.
  The `#library-import-panel` ID and handler lifetimes are preserved.
- Selective import is a separate operation and stays independently collapsible.
- Recovery snapshots similarly shows its only saved-snapshot list directly
  under its top-level disclosure; the count and actions remain available.
- Added Playwright checks for one-click visibility and real JSON file preview.
  No TIA logic, files or project were modified.

## PLC status and FB/FC import layout — 2026-10-16

- Removed the redundant green `Active PLC set to...` banner below the PLC sections.
  Active PLC selection and summary remain unchanged in Overview and the header;
  other operation statuses and error messages remain visible.
- Both FB and FC import controls use matching 14px typography and a responsive
  CSS grid. Buttons are now simply `Load` and stay to the right of the selected
  block without wrapping, including on narrow screens.
- Corrected obsolete references to a nonexistent TIA Portal tab. Connection and
  Active PLC selection are under Overview.
- Extended Playwright with computed layout checks at 1440/950/620px and a
  regression check ensuring the bottom PLC success message is not displayed.
  No changes to PLC/TIA write flows.

## Compact main headings and single-object panels — 2026-10-16

- Made top-level engineering bars uniformly 54px high, 15px text, shared
  padding, colors, borders and chevrons; extended this to I/O Engineering.
- Removed redundant nested accordion for single UDT/DB, device template,
  Instance DB and native PLC tags/program inventory; single DB Static is static.
- Multi-object views and nested Struct/Array and FB/FC declaration trees keep
  their independent fold controls. Engineering context remains permanently
  visible, with no chevron and no persisted close preference.
- No TIA write operations or adapter changes. Browser regression included.
- CI status: see GitHub Actions for this branch.

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
## Single-level engineering disclosures and HMI workflow folding — 2026-10-16

- Replaced the obsolete nested Import Library and Recovery snapshots accordions
  with their already-existing top-level panels. File import controls and saved
  snapshot lists now appear after one intentional disclosure action.
- Removed the second fold from PLC tags and PLC program inventory while keeping
  all existing identifiers and refresh handlers. Single UDT/DB rendering was
  already direct; Struct, Array and multi-object trees remain foldable.
- Made the three HMI translation workflow steps native shared-style disclosures.
  They start collapsed, work with mouse and keyboard, and retain their nested
  HMI-specific lists and translation editor unchanged. A browser interaction
  check confirmed Step 1 opens and closes while its controls remain available.
- Removed the redundant green PLC/HMI discovery banner; Overview/header and
  the actual inventories continue to provide the selected-context status.
- Code commit: `e0ae757` (`fix(ui): simplify engineering disclosures`).
- Validation: focused UI tests **43 passed**; full `pytest -q` **524 passed**;
  all frontend/test JavaScript passed `node --check`; the CI Node runtime
  suites passed, including **41 HMI state-transition scenarios**. Local
  Playwright package is not installed; the pushed GitHub Actions browser job
  remains the authoritative Chromium verification.

## Offline FB/FC and Instance DB dependency diagnostics — 2026-10-16

- The read-only dependency report now identifies declaration types that are
  neither locally available UDTs/FBs nor registered Siemens types. They are
  surfaced as manual-review items; the app never invents a replacement type.
- Instance DB ownership reported directly by Openness is now checked against
  the local FB inventory, verified interface state and available block number.
  Missing, unverified or inconsistent owners remain explicitly unresolved.
- Section/member paths in the report use the same display labels as the UI
  (`Input`, `Static`, and so on). No Openness call or TIA write occurs.
- Commit: `23fe241` (`feat(program): report unresolved block dependencies`).
- Validation: focused dependency/FB/Instance DB tests **25 passed**; full
  `pytest -q` **525 passed**; `node --check gui/js/program_dependencies.js`
  passed. Playwright validation will run in GitHub Actions after push.

## Structured offline dependency findings — 2026-10-16

- The read-only UDT/DB/FB/FC/Instance DB dependency report now returns each
  unresolved finding as an object, declaration path, issue category and detail.
  Unknown types therefore identify their exact declaration, while incomplete
  Instance DB ownership remains explicitly marked for manual review.
- The Offline dependency analysis panel renders these findings in an accessible
  four-column table under its existing disclosure. It performs no TIA write and
  does not infer missing Siemens or local objects.
- Regression coverage verifies the API shape and the visible browser table.
- Validation: `pytest -q` — 525 passed; `node --check` for the report module
  and browser regression — passed. Playwright Chromium will run in GitHub
  Actions after push.

## Nested FB/FC declaration dependencies — 2026-10-16

- FB and FC declaration validation now walks nested `Struct` members. The FB
  dependency graph also resolves the element type of `Array` declarations, so
  a nested or array multi-instance cannot bypass the section, verification or
  cycle checks.
- The local FB/FC summaries use the same traversal and show full declaration
  paths such as `Nested.Motor → FB_Dependency`. No block source, LAD/FBD/SCL
  network or TIA project is created, regenerated or written.
- Regression coverage includes a nested/array circular FB relationship, a
  nested forbidden FC IEC instance, and browser-visible nested multi-instance
  analysis.
- Validation: `pytest -q` — 526 passed; `node --check` for FB/FC UI and the
  browser regression — passed. Playwright Chromium will run in GitHub Actions
  after push.

