# Codex development progress

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
- Commit: pending.
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
