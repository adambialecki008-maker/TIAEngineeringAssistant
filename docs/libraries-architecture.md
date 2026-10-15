# Engineering Libraries — architecture

## Scope and persistence

The **Data & Libraries** tab is an offline, browser-local engineering component.
It does **not** create, overwrite, compile, download or delete structures in TIA
Portal. The Siemens Openness adapter is used by separate, explicitly initiated
TIA operations.

- Browser database: IndexedDB `tiaEngineeringAssistant.libraries` (schema v2).
- Stores: `libraries`, `objects` (index `library_id`), `categories`,
  `snapshots`.
- Libraries, object revisions and categories are shared across local project
  profiles. Each project's working UDT/DB/device definitions are isolated by
  profile; snapshots carry `profile_id` (`default` for older snapshots).
- IndexedDB and localStorage are scoped to the **exact browser origin**.
  `localhost` and `127.0.0.1`, different ports, private windows and separate
  browser profiles may have different collections.

## Core modules and data flow

| Module | Responsibility |
| --- | --- |
| `gui/js/library_store.js` | Schema validation, dependency graph, SemVer history, IndexedDB transactions, import/export, snapshots |
| `gui/js/data_libraries.js` | Profile, library, import, backup and recovery UI |
| `gui/js/state.js` | Active project configuration, profile index and legacy migration |
| `gui/js/udt_import.js` / `gui/js/db_import.js` | Read-only TIA XML-to-local-editor flow |
| `gui/js/udt_import_converter.js` / `gui/js/db_import_converter.js` | Lossless-or-reject conversion of exported PLC declarations |

Definitions have `object_type` = `udt`, `db` or `device_template`,
`name`, `library_id`, `version`, `category`, description, tags, author,
manufacturer, source project, TIA version, compatible PLC families, timestamps,
`content_hash`, `payload` and `versions`.

- UDT `payload.fields`: ordered declarations, including nested
  `struct_members`, Array element type and integer lower/upper bounds.
- DB `payload.members`: the same tree, plus whole-DB `payload.retain`.
- Device template `payload.signals`: signal definitions and mappings.
- `versions`: SemVer, timestamp, changelog, content hash and immutable
  `snapshot`. Existing revisions must survive Replace/New Version.
- SHA-256 content hashes are computed over canonical JSON payload keys.

## Dependency and conflict model

UDT references are located recursively in `data_type` and
`array_element_type`, including members inside Structs. The dependency
planner exports dependencies *before* dependants and rejects cyclic graphs.
Unknown UDT references block selective import.

For selective import, `planSelectiveLibraryImport()` prepares a read-only
graph and explicit conflict decisions. `applySelectiveLibraryImport()`
rechecks current target objects immediately before its single IndexedDB write
transaction. Category/object/library updates commit together or abort together.
Importing a renamed UDT rewrites references in the incoming dependency set.
No local user object is silently overwritten.

## Engineering UI consistency

Overview owns the active local profile, TIA connection and Active PLC selection.
UDT and global DB editors use TIA-inspired declaration tables with `▸`/`▾`
chevrons and directly visible row actions. Accessible, Writable and Visible
properties use checkbox columns; a dash/indeterminate state means the
attribute is unspecified, not false. Right-click restores the default.

Global DBs have only **Static** declarations. Input, Output and InOut sections
belong to FB interfaces and instance DBs and are not synthesized.

For optimized global DBs, Retain may be set per top-level Static variable;
an omitted per-member Retain inherits the saved DB default. Retaining a
Struct, Array or UDT covers its entire value. Retain on nested Struct fields
is rejected before source generation. Mixed Retain settings produce
successive `VAR` and `VAR RETAIN` declarations in the original order.
The read-only DB import reads Retain from TIA XML and rejects ambiguity.
Source compilation must still be verified in real TIA Portal V21.

## Limitations

The library is not a TIA Global Library and does not preserve every Siemens
proprietary XML attribute. Import from live TIA is intentionally conservative:
unsupported sections, member metadata, array expansions, or ambiguous
remanence stop the local import rather than inventing data.

This architecture has been exercised by Node and isolated-browser Playwright
tests, **not** by a Windows/TIA V21 hardware integration test. See
`tia-v21-smoke-test.md`.
