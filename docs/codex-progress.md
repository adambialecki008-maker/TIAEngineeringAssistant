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

## Verified-owner Instance DB preview — 2026-10-16

- Updated the Instance DB inventory guidance to describe the existing,
  evidence-based Openness owner metadata. An owner is never inferred from a
  DB name.
- When Openness directly reports an FB name/type/number and the local project
  contains the matching verified FB snapshot, each Instance DB now exposes a
  collapsed read-only table of that FB's Static declarations. It preserves
  nested Struct members and observed IEC child fields and labels the view as a
  local derivation, not an independent declaration or TIA write.
- If the owner snapshot is missing, unverified or numbered differently, the
  UI explicitly withholds the structure preview.
- Validation: `pytest -q` — 526 passed; `node --check` for the Instance DB UI
  and browser regression — passed. Playwright Chromium will run in GitHub
  Actions after push.

## Read-only IEC instances in imported FB snapshots — 2026-10-16

- A system timer/counter instance in a read-only TIA FB snapshot now opens
  only its exported native-field projection. The UI labels it `System
  instance — Read-only` and does not render an editable declaration form.
- Attribute checkboxes and Delete/Move actions for that imported instance are
  disabled. Locally declared FB system instances retain their existing local
  declaration workflow.
- The browser regression covers a verified imported FB with an observed IEC
  child field and verifies that its preview has no inputs, selects or buttons.
- Validation: `pytest -q` — 526 passed; `node --check` for the member editor,
  FB UI and browser regression — passed. Playwright Chromium will run in
  GitHub Actions after push.
- GitHub Actions run `38891135388` passed: Python pytest, JavaScript checks
  and Playwright Chromium are green.

## PLC Code Review file-analysis core — 2026-10-16

- Added a read-only local analyzer for `.scl` and `.xml` PLC source files and
  the `/api/v1/code-review/analyze-files` endpoint. It accepts multiple files,
  enforces a 2 MiB per-file limit and never contacts TIA, Ollama or an external
  service.
- SCL parsing recognizes supported block headers and interface declarations.
  XML parsing is explicitly best-effort: it records recognizable Member and
  CompileUnit/Network structures and returns partial or failed verification
  rather than claiming unsupported SimaticML variants are fully parsed.
- Deterministic findings cover duplicate declarations and dependencies missing
  from the loaded file set. Missing project context is labelled accordingly.
- Validation: focused 3 tests and full `pytest -q` — 529 passed.

## PLC Code Review Analyze Files UI — 2026-10-16

- Added the `AI Code Review` navigation module with an Analyze Files workflow:
  multiple-file and browser-supported folder selection, local status/listing,
  deterministic findings, per-block expandable results and JSON download.
- The UI calls only the local read-only review endpoint. `Analyze from TIA`
  and Ollama review remain deliberately unavailable in this first vertical
  flow, rather than presenting placeholder output as analysis.

## PLC Code Review local Ollama suggestions - 2026-10-16

- Added the optional `/api/v1/code-review/ollama` workflow. It first performs
  the deterministic local scan, then sends bounded, numbered source chunks to
  the user's local Ollama server and validates its JSON output with Pydantic.
  The default model in the interface is `qwen2.5:3b`.
- AI results always retain the real source file, block and language from the
  parser, discard invented locations, and are explicitly labelled `AI
  suggestion — unverified`. The deterministic Analyze Files route still works
  with no Ollama process or installed model.
- XML input now rejects DTD/entity declarations before parsing. The GUI adds a
  separately-triggered local AI review button only after deterministic results
  exist; failures preserve those deterministic results.
- Regression coverage uses a mocked Ollama response, invalid JSON, safe XML
  rejection, and a Chromium workflow that exercises both GUI actions.
- Validation for this stage: `pytest -q` — 532 passed; JavaScript syntax
  checks passed; GitHub Actions run 38895785141 passed Python, JavaScript and
  Playwright Chromium. Implementation commit: `8a5df6e`.
- Remaining scope: Analyze from TIA is not duplicated here; broader SimaticML
  network/instruction parsing remains explicitly partial until representative
  TIA exports are available. AI suggestions are local-only and must be
  reviewed by an engineer before any PLC change.

## PLC Code Review from loaded TIA snapshots - 2026-10-16

- The AI Code Review page now includes Analyze loaded TIA blocks. It feeds
  original XML retained by read-only FB/FC snapshots into the existing local
  deterministic analysis route, rather than creating a second Openness reader.
- The action requires locally loaded snapshots with original XML, does not
  contact TIA Portal again and cannot write to the project. Its browser
  regression verifies the no-contact snapshot workflow alongside Analyze Files
  and the optional Ollama review.

## PLC Code Review dependency rules - 2026-10-16

- Deterministic diagnostics now identify multi-instance cycles that are fully
  demonstrated by loaded FB declarations, plus IEC timer/counter instances
  outside FB Static and instruction names used as data types.
- The rules use the existing Siemens type registry and loaded source only;
  missing project context remains an unresolved warning rather than an
  invented error. Focused regression: 7 tests passed.

## PLC Code Review Markdown report - 2026-10-16

- Analyze Files now exports the current deterministic or AI-augmented report
  as readable Markdown as well as JSON. The report preserves source/block,
  location, evidence, detection method and verification status without
  embedding uploaded source code.

## Whole-project TIA export session-lifetime fix - 2026-10-16

- Restored the read-only `Export file for LLM review` capability without an
  environment-variable bypass. The adapter now captures `SoftwareContainer`
  content once and aborts the entire traversal when Openness reports a disposed
  or nonrecoverable session, including during reflective HMI enumeration.
- This prevents the former unsafe behaviour of catching a disposed-object
  exception and continuing to access Device/HMI/PLC objects from that session.
  The Python API reports the last logged export operation for diagnosis.
- Offline validation confirms the adapter builds and the ZIP/API contracts;
  real V21 Portal lifetime behaviour still requires a disposable-project test.

## Whole-project TIA export GraphicList exclusion - 2026-10-16

- A confirmed V21 `GraphicList.Export` `NonRecoverableException` is now
  treated as an unsupported presentation asset only for the exact
  `Hmi.TextGraphicList.GraphicList` type. It is recorded in `TIA_MISSING.tsv`;
  PLC/HMI traversal continues for other objects.
- All other `NonRecoverableException` and every disposed-object error retain
  the fail-closed behaviour. A live V21 retest is required because TIA closed
  during the reported export and cannot be proven safe by mocks.


## AI Code Review real-format parser hardening — 2026-10-16

- Siemens SCL analysis now accepts quoted block/declaration names, ARRAY[...] OF
  references and parameterized STRING/WSTRING without inventing an ARRAY dependency.
- SimaticML analysis uses explicit SW.Blocks.* / SW.Types.* tags and the nested
  AttributeList/Name/ProgrammingLanguage metadata when present. TIA snapshots
  with non-descriptive filenames resolve to their actual exported block name.
- Nested STRUCT members retain qualified declaration paths. Read-only Siemens
  IEC timer/counter internal XML projections are not counted as independently
  declared members or false duplicate names.
- Multi-instance cycle detection uses only FB Static declarations and resolves
  FB names case-insensitively; non-Static references cannot create cycles.
- Multi-block XML and multi-header SCL explicitly yield partial/unsupported
  results rather than silently attributing contents to the wrong block.
- Added offline tests for these concrete edge cases. Existing TIA import, HMI,
  Openness adapter and original PLC files are unchanged; analysis is read-only.



## AI Code Review SCL UDT bodies and SimaticML interface isolation — 2026-10-16

- Read-only SCL analyzer now recognizes UDT TYPE/STRUCT bodies without a VAR
  section, including nested Struct declarations and ARRAY OF dependencies.
  A truncated/unclosed Struct is marked partial, never treated as verified.
- SimaticML declaration scan is restricted to a block's actual
  AttributeList/Interface/Sections subtree. Source-network / CompileUnit
  members are not confused with data declarations or missing UDT dependencies.
- Legacy small XML fixtures with direct Section children remain supported.
  Missing interface data in a recognized SimaticML export is explicitly
  reported as partial; the parser never guesses a declaration from ladder
  networks.
- Added dedicated offline regression tests. Existing TIA Openness import,
  HMI translations, and user files are unchanged. No writes to PLCs.

## LAD/FBD FlgNet topology-only inspection — 2026-10-16

- AI Code Review now exposes a read-only structured model of Siemens XML FlgNet
  network nodes (Access, Part, Call) and explicit wires (NameCon, IdentCon,
  Powerrail, OpenCon), preserving UId, component symbol, part/call name, port
  and network-specific programming language.
- Structural warnings identify duplicated node UIds, references to absent
  *recognized* Parts and missing Parts/Wires. These warnings require TIA
  verification and do NOT assert faulty execution logic, invalid ladder
  semantics, or safe source regeneration.
- Does not modify existing FB/FC imports, translate LAD/FBD to SCL, infer flow
  direction or create files to import to TIA. Regression fixtures model
  documented Siemens FlgNet forms, not yet a validated V21 export suite.

## Visible FlgNet topology and Markdown export — 2026-10-16

- AI Code Review displays per-network read-only tables of the nodes and wire
  endpoints observed in FlgNet XML. The GUI clearly labels the result as
  topology only, not verified ladder or FBD execution logic.
- Download Markdown includes nodes, explicit connections and any structural
  warnings alongside the pre-existing diagnostics.
- Updated Chromium interaction test confirms network tables and generated
  Markdown, with all content added as inert text nodes (no HTML injection).

## FlgNet wire presentation clarification — 2026-10-16

- Wire endpoint display uses an unordered separator, not a directional arrow:
  Siemens export ordering is not a proven execution/signal-flow direction.
- Duplicate UId detection now uses a linear-time set pass rather than repeated
  scanning of all network nodes.

## PLC Code Review SCL comment safety and bounded Ollama payloads — 2026-10-16

- SCL declarations and block headers are scanned after masking both // and
  nested (* ... *) comments. Strings and quoted symbolic identifiers retain
  comment-looking text without accidental stripping; original line numbers
  remain intact for diagnostics.
- Unclosed block comments cause explicitly partial analysis rather than a
  misleading clean/verified result.
- Ollama source segmentation now splits even minified one-line XML into
  bounded chunks of at most 6000 characters, including line labels. At most
  12 chunks per file are analyzed; truncation remains explicitly reported.
- Added read-only regression tests for fake declarations in comments, quoted
  symbols, nested comments, and oversized single-line AI input.
- No Siemens Openness write, HMI translation, or PLC project modifications.

## Offline FB/FC observed call graph — 2026-10-16

- Added conservative read-only FB/FC call observations for SCL execution
  statements (after BEGIN) and explicit FlgNet CallInfo references.
- SCL resolves locally declared Static FB instances and named FC calls against
  the blocks actually uploaded; unloaded functions are marked "requires
  project context", not a compile error.
- Observed calls retain source, line/network, instance and resolution status
  and are shown in the AI Code Review GUI and Markdown exports.
- Skips comment-only calls, interface declarations, and instruction/library
  names not verified to represent user FB/FC blocks. No inference of LAD/FBD
  signal direction or machine behavior; no TIA write.
- Python regression covers two resolved SCL calls, partial uploads,
  observed FlgNet CallInfo, and declaration-only sources. Browser assertions
  cover the read-only call table and Markdown export.

## FB/FC named call-binding preflight (SCL) — 2026-10-16

- Reads multiline explicit named SCL call bindings (:= and =>) using balanced
  parentheses, including nested function calls and quoted strings.
- Compares observed names and directions only with the supplied callee's
  declared Input/Output/InOut interface, without inferring types or claiming
  that missing parameters are mandatory.
- Flags duplicate bindings, unknown names and obvious Input/Output direction
  mismatches as source-level warnings. For partial SimaticML declarations,
  results require confirmation in TIA; absent or incomplete call syntax is not
  diagnosed. Unloaded callees stay unresolved without fabricated errors.
- Per-call binding names are shown in GUI and exported in Markdown.
- Adds Python regression and browser coverage. Does not alter TIA, project
  blocks, source files or existing HMI/UDT/DB import behavior.

## Conservative offline FB/FC call type validation — 2026-10-16

- Named SCL arguments now retain the inferred **type category only**, not the
  raw source expression: explicit BOOL literals, typed numeric literals,
  multi-character STRING literals, and unambiguous top-level #Local variables.
- A read-only diagnostic flags only incompatible boolean/numeric/string
  categories against loaded Input/Output/InOut declarations. It does not
  claim INT/DINT/REAL conversions are incorrect, nor assign types to untyped
  numeric constants, one-character strings, functions or complex expressions.
- XML interface mismatches remain "requires TIA verification" and missing
  interface declarations do not generate speculative diagnostics.
- Added tests for definite mismatches, safe matches, unresolved expressions,
  duplicate local declarations and incomplete TIA exports.
- Original uploaded files and TIA project are never changed.

## Conservative SCL VAR_TEMP usage diagnostics — 2026-10-16

- Added read-only source-level observations for top-level VAR_TEMP declarations
  absent from a complete parsed SCL block's executable body. Comments and
  single-quoted string literals are excluded; unqualified name occurrences
  prevent false unused diagnostics.
- Added read-before-first-assignment checks only for straight-line bodies made
  entirely of simple, single-line assignments and scalar temporary variables.
  IF/CASE, calls, multiline statements and unknown control flow disable this
  check; there is no LAD/FBD dataflow inference.
- Source-file and line locations are preserved. Findings are marked
  "source-level observation", not proof of runtime behavior.
- Regression tests cover comments, text literals, IF/call safeguards,
  initialization order, self-reference and incomplete blocks.
- Analysis stays offline and read-only; no edits to original PLC data.

## Point 2: SCL nested call-site scanner — 2026-10-16

- Added a bounded lexical scanner that detects named user FB/FC calls within
  IF expressions, assignments, nested call arguments and several expressions
  per source line, not just at the beginning of a statement.
- Observed SCL calls now preserve parent call and nesting depth; the same
  loaded-interface name/direction/type checks apply to nested call bindings.
- Conservative identification only: known loaded FC/FB names, explicitly named
  FC_/FB_ calls or declared Static FB instances. System instructions, strings,
  comments and dotted method expressions are never treated as user calls.
- Multiline and malformed calls retain explicit incomplete argument status;
  uncertain input does not trigger a guessed parameter mismatch.
- Added regression cases for nested calls, multiple calls, unprefixed known
  functions, quoted/commented text and incomplete syntax, plus GUI/Markdown
  nesting assertions.
- Still read-only. No compile claims or automatic source modifications.

## Point 2 review closure: visible argument certainty — 2026-10-16

- GUI and Markdown now explicitly display "Not fully verified" for SCL
  call sites with incomplete or positional argument syntax, and "Not inspected"
  for FlgNet call arguments.
- Removed the obsolete beginning-of-line SCL call regex and no-op scanner
  branch so a single nested-call pipeline defines the result.
- Added regression for nested malformed call, incomplete binding suppression
  and verified nested diagnostic.
- Point 2 supported offline scope: complete for recognized user FB/FC calls
  and explicit named SCL bindings; the full Siemens SCL grammar and TIA Portal
  compiler behavior remain outside the lexical scanner.

## Point 3: Conservative SCL variable and interface flow — 2026-10-16

- Added isolated read-only control-flow parser for complete SCL bodies:
  straight-line assignments, nested IF/ELSIF/ELSE and CASE/ELSE.
- Guaranteed assignment is merged by intersection at every branch join.
  Variable reads in conditions/RHS are checked against assignments guaranteed
  on all incoming paths, with no speculative analysis of loops/calls.
- Detects unused top-level VAR_TEMP and unused VAR_INPUT by complete-body
  identifier occurrence, plus an informational output-not-written observation
  when a supported, complete body has no direct output assignment.
- Per-block variable usage summaries include static read/write occurrences,
  guaranteed assigned-on-exit status and a coverage indicator. Unsupported
  source becomes partial and suppresses all read-before-write findings.
- This does not prove runtime scheduling, execution counts, or full Siemens SCL
  semantic correctness. Nothing is written to TIA.

## Point 3 UI coverage + false-positive safeguards — 2026-10-16

- Added per-variable SCL read/write tables to AI Code Review, each with explicit
  complete/partial analysis coverage and guaranteed exit-assignment status.
  Summaries export into Markdown and are included in existing JSON.
- IF/ELSIF and CASE predicates containing function calls or parenthesized
  expressions cause partial dataflow: no definite-initialization claims.
- Updated old control-flow regression expectation: a TEMP read after IF without
  ELSE is now correctly flagged because the uninitialized path is explicit.
- Added Chromium coverage of variable tables and Markdown representation.

## SimaticML empty Interface parsing — 2026-10-16

- Fixed ElementTree element truth-value ambiguity when detecting
  AttributeList/Interface; uses explicit is None fallback, preserving empty
  Interface semantics. Added regression ensuring CompileUnit members are not
  misread as declarations of an empty block.

## Point 4 native FlgNet network details — 2026-10-16

- Added read-only extraction of Access constant kinds/values, Part template
  metadata, CallInfo parameters/instance and per-pin wire peer lists.
- Carries the FlgNet namespace version and coverage state, flags unexpected
  parts/endpoints as partial, warns about malformed/duplicate wires.
- GUI and Markdown show instruction names, explicit operands, call parameters,
  instance and wire membership, without claiming execution or signal direction.
- External reference: published SimaticML FlgNet/v4 example (Contact/Eq/Move,
  local/literal constants, explicit pins) at
  https://github.com/eliasrhoden/tia-statemachine/blob/main/simatic_ML_format.md.
- **Not yet validated** against a genuine exported XML from the user's
  TIA Portal V21. This is required before claiming Point 4 fully verified.

## Point 4 Access wiring and V21 acceptance gate — 2026-10-16

- Graph connection projection also attaches IdentCon wire membership to
  Access symbol/constant nodes, so a reviewer can trace a signal back
  from either a named instruction pin or the referenced operand.
- Added test for multi-component symbol and literal constant connected to
  an FBD gate, with explicit wire UIds and reference membership.
- Wrote a separate V21 acceptance procedure; without a real V21 export
  from the target TIA project, the gate remains unverified.

## Void return and compact FB/FC cards — 2026-10-16

- Fixed false "Unresolved dependency" for a native FC Output Ret_Val
  of type Void; Void is an allowed FC return marker only, not a
  general PLC declaration type or missing UDT.
- Each FB/FC now renders as a native keyboard-accessible details card with
  its identity, language, number and verification status always visible.
  The interface declarations, Details, source XML and actions are inside
  the fold and hidden by default.
- Disclosure state is kept per active project profile, block name and kind
  across editor re-renders. Existing per-section expansion state remains.
- Added regression coverage for FC Void XML, invalid Void operands,
  collapsed/restored FB/FC cards and local-editor changes.

## AI review fallback and shared disclosure styling — 2026-10-16

- FB/FC cards now share the same standard engineering disclosure header/arrow through shared CSS classes. Custom chevron removed.
- Local Ollama status now reports incomplete JSON output as partial/unavailable without losing deterministic results.

## Point 5 completed: project overview, triage priorities and filters — 2026-10-16

- Backend assigns certainty-aware priority P0–P3 and exposes project-wide
  summary totals, severity/method/verification counts and per-source breakdown.
  Unverified AI findings can never be P0; the report remains read-only.
- GUI shows project scorecard, per-file priority matrix and sortable-by-priority
  findings with filters for priority, severity, AI/rule detection, source and
  free-text search. Clear filters and result counts are provided.
- Parsed block details remain available behind a separate disclosure section.
  Report warnings have a dedicated expandable list.
- JSON and Markdown exports include the full report regardless of active
  on-screen filters; Markdown has the project overview and priority-ranked
  findings in a deterministic order.
- Backend and Chromium regression cover counts, priority integrity, filtering,
  Markdown export and AI enrichment. Actual TIA/Ollama integration is separate.

## One-block budgeted local AI (2026-10-16)

- Local Ollama review is optional and limited to exactly one selected SCL
  block per click. Raw exported LAD/FBD XML is not sent to the model.
- Source excerpt limited to 2400 characters with original line labels,
  metadata reduced to 16 declarations, context capped at 2048 tokens,
  generated output capped at 256 tokens.
- First request timeout 35 s; invalid-JSON retry timeout 15 s.
  Connection/timeout errors preserve deterministic results without retrying.
- GUI includes an explicit SCL block selector and disables AI for XML-only
  TIA snapshots. No project writes. Live Ollama model speed unverified.

## Point 6: approved SCL copy workflow — 2026-10-16

- Read-only Code Review findings for SCL lines now offer "Prepare SCL change".
- A proposal panel selects the exact original source and line range. Replacement
  is explicitly user-edited; a natural-language AI suggestion is never injected
  into executable PLC source as an unreviewed patch.
- The backend validates SHA-256 of original bytes and exact replaced lines,
  rejects unsafe names/non-SCL files/stale selections, preserves source line
  endings, checks block identity and returns an in-memory unified diff.
- The approval checkbox only becomes active after a successful preview; any
  edited input invalidates approval. Download creates a separate reviewed.scl
  copy only. No file system writes, TIA calls or automatic import.
- Live compile in TIA Portal and real source validation remain user-controlled
  acceptance gates. Local Ollama remains one SCL block/short excerpt.

## Replace slow local AI review with offline LLM export — 2026-10-16

- Removed Code Review Ollama API and GUI review action; HMI translation remains available.
- Added Export file for LLM review to create a local ZIP of loaded PLC declarations, native FB/FC XML snapshots, user-selected SCL/XML, generated (uncompiled) UDT/DB SCL, manifest SHA-256 and deterministic structural analysis.
- Source completeness is explicit: missing blocks and full-project limitation documented; no fabricated logic and no connection to any hosted model.
- Added backend and browser tests for ZIP validity, scope, path safety, no AI endpoint and deterministic preservation.

## Entire open TIA project -> LLM readable review archive (2026-10-16)

- Corrected earlier loaded-profile-only export. The button now requires a TIA process and invokes a single Openness project-level traversal.
- Added read-only bulk V21 adapter command for all project devices/PLCs and supported HMI objects. Recursively exports PLC FB/FC/OB/DB, PLC types and tag tables; inventories hardware.
- Failed/unsupported exports are listed in TIA_MISSING.tsv; manifest explicitly refuses to claim full native TIA project fidelity.
- ZIP includes original XML/TSV, inventory, missing-object report, SHA-256 and a bounded deterministic review without invoking a local LLM.
- Added API tests using simulated Openness exports and browser integration tests; real TIA V21 adapter build and practical export remain an acceptance gate.

## Remove unused Create PLC UI — 2026-10-16

- Removed Create PLC card (hardware catalog, model/family selector, new-device fields and create action) from PLC tab.
- Removed dead GUI create-PLC handlers and catalog startup logic, leaving existing PLC selection, inventory, program analysis, HMI and full TIA project LLM export unaffected.
- PLC tags, PLC program and PLC data structures remain available.
- Added regression assertions that creation controls are absent.

- Retained ET 200 Openness catalog support while removing its former UI selector; regression tests updated to match the narrower screen scope.
- Existing PLC rename/delete APIs continue to use /api/v1/tia/plcs and are intentionally untouched.

## Correct Analyze Files removal / restore Create PLC — 2026-10-16

- Corrected earlier mistaken removal of the Create PLC hardware creation UI:
  restored original HTML, JavaScript handlers and tests from the preceding commit.
- Removed the **Analyze Files** card (manual SCL/XML uploads, folder selection,
  Analyze and associated JSON/Markdown download buttons) from PLC Code Review.
- Retained the **Export file for LLM review** action targeting the whole open
  TIA Portal project through Siemens Openness, and **Analyze from TIA**.
- Removed GUI-only, now-orphaned manual SCL patch panel while leaving the
  backend preview endpoint unchanged for compatibility.
- Updated Chromium regression to verify removed UI, restored Create PLC,
  TIA snapshot analysis and the whole-project ZIP download.

## Fast PLC inventory and verified active target - 2026-10-16

- Split the Overview refresh into a fast, read-only PLC inventory and a
  follow-up detailed context scan. The first call only identifies PLC targets;
  it does not enumerate all blocks, tag tables, resource attributes or HMI
  device items before rendering the PLC table.
- The detailed scan remains sequential, so the app does not attach two
  concurrent Openness sessions to the same TIA project. If it fails, the
  already-rendered PLC inventory remains available and the HMI/details area
  shows the error.
- A persisted Active PLC is now marked as awaiting TIA verification and stays
  red. It turns green only after the fast inventory confirms the matching
  device and PLC name in the currently selected TIA project. PLC reads are
  disabled until that confirmation.

## LLM export: exclude unstable HMI GraphicLists - 2026-10-16

- Removed every LLM-export traversal entry point for HMI `GraphicLists` and
  added a type guard before generic HMI enumeration. These presentation assets
  are not relevant to PLC code review and must never be opened or exported.
- The unsupported-items report explicitly records that GraphicLists were
  intentionally excluded. Disposal and nonrecoverable errors for every other
  object still abort the export rather than reusing an invalid Openness session.
- This addresses the reported `GraphicList` disposed-enumerator failure, but
  needs a real TIA Portal V21 retest to establish whether it prevents the
  Portal shutdown on the affected project.
