# Engineering Libraries — JSON transfer and selective import

## Export

1. Open **Data & Libraries** and expand **Engineering Library**.
2. Select the source library; select the objects to transfer.
3. Use **Export Library** to inspect the automatically included dependent UDTs.
4. Download the JSON and keep a copy outside the browser profile.

The exported format is `TIAEngineeringAssistant`, `kind` =
`engineering_library`, `schema_version` = `1`; it includes library
`metadata` and ordered `objects` with their payloads and revision history.
A new export timestamps its package metadata, but does not change the
engineering declarations. Validate semantic equality by excluding generated
library/object identifiers and intentionally changing timestamps.

Example (abbreviated):
```json
{
  "format": "TIAEngineeringAssistant",
  "kind": "engineering_library",
  "schema_version": 1,
  "metadata": {"name": "Motors", "categories": ["General"]},
  "objects": [
    {"id": "source-udt", "object_type": "udt", "name": "UDT_Motor",
     "version": "1.0.0",
     "payload": {"name": "UDT_Motor",
       "fields": [{"name": "Ready", "data_type": "Bool"}]}},
    {"id": "source-db", "object_type": "db", "name": "DB_Motors",
     "version": "1.0.0",
     "payload": {"name": "DB_Motors", "retain": false,
       "members": [{"name": "Motor", "data_type": "UDT_Motor"}]}}
  ]
}
```
Actual exports also contain detailed metadata, hashes and revision records.
Do not edit object IDs/version records by hand.

## Transfer to a separate computer or browser

1. Open the application at the intended destination origin.
2. Expand **Data & Libraries → Import Library** and choose the exported JSON.
3. Inspect the preview: member trees, requested objects and dependencies.
4. Choose one of two import modes.

**Import as New Library** creates a new local library, objects, categories and
revision history in one IndexedDB transaction. The name must not collide
case-insensitively with a local library.

**Import Selected Objects into Existing Library**: select a destination library
and individual source objects. Preview the dependency closure and resolve each
conflicting object:

| Decision | Effect |
| --- | --- |
| Keep Existing | Retain the local object and skip the incoming conflict |
| Rename Imported | Create a new local object under an unused name and update references of incoming dependent objects |
| Import as New Version | Add a distinct SemVer revision to an existing object while retaining history |
| Replace | Explicitly approve replacing the current definition; past revisions remain recoverable |

Review the final plan and confirm. Check **Added / Skipped / Revised / Conflicts**
in the result. If the destination library changes while previewing, re-run the
preview and do not try to force the stale operation.

## Rejection and recovery

The importer rejects corrupted/unsupported JSON, missing members, duplicate
names/IDs, invalid SemVer, cycles, unresolved dependencies, unsupported member
metadata and conflicts with no decision. JSON files over 10 MB are rejected.

For an unsuccessful import, inspect the displayed error; existing library
objects should remain unchanged by an aborted transaction. If you intentionally
replace a definition, use **Versions** to inspect or restore a previous
revision. Do not assume importing into the browser changes anything in TIA
Portal; TIA writes require a separate confirmed preflight.

Automated checks: `tests/library_store_runtime.cjs` and
`tests/library_transfer_browser.cjs`. The browser test transfers objects
between independent IndexedDB contexts.
