# Library transfer, project profiles and recovery

## Where data is stored

- **Engineering Libraries** (UDTs, DBs, templates, categories and revisions) and recovery
  snapshots use the browser's IndexedDB database `tiaEngineeringAssistant.libraries`.
- **Local projects/profiles** use separate `localStorage` keys,
  `tiaEngineeringAssistant.projectConfig.profile.<id>`. The active profile ID
  and the profile index are stored separately. Libraries are shared across
  profiles; UDTs, DBs, I/O mappings and device templates in the *current project*
  are independent.
- On first load, the legacy `tiaEngineeringAssistant.projectConfig` is copied
  into the Default project and retained once at
  `tiaEngineeringAssistant.projectConfig.legacyBackup`. The legacy key is
  subsequently mirrored for backward compatibility *only* with the Default
  project. The recovery copy is never overwritten.
- Switching project profiles clears the chosen TIA PLC binding.
  **No profile operation writes to an open TIA project.**

Browser origin matters: switching hostnames (127.0.0.1 vs localhost), ports,
browser profiles, or incognito contexts creates a different data store.

## Transfer between computers

1. In **Data & Libraries**, select the source Engineering Library and
   tick the desired objects. Use **Export Library** to preview all automatically
   included UDT dependencies and save the JSON.
2. On the destination PC, open the same app origin in its normal browser
   profile. Use **Import Library** to load the file and inspect the preview.
3. **Import as new library** creates a separate local library in one IndexedDB
   transaction and requires a unique library name.
4. **Selective import into existing library** lets you tick individual objects,
   choose a destination, and resolve every name/content conflict:
   - **Keep Existing** does not modify that object.
   - **Rename Imported** creates a new object and updates incoming UDT/DB
     references for renamed UDTs.
   - **Import as New Version** updates the destination object at a new SemVer
     and retains previous revisions.
   - **Replace after approval** updates the destination object only after
     the full preview and explicit confirmation; history remains available.
   Validation checks dependencies, cycles, names and versions before any
   write. IndexedDB commits all selected writes atomically.
5. For the current project (not the reusable library), use **Project Backup**
   to export full/selected data. Partial backups may only be safely merged.
   Full backups can replace the active profile after a recovery snapshot.

**Do not assume a green CI run means that a live TIA Portal import works.**
Library transfer only changes local browser storage. Select/verify the PLC
and perform a separate manual, backed-up TIA export/import/compile test.

## Recovering configuration

1. Open **Recovery snapshots** *while the correct project profile is active*.
   Snapshot listing is restricted to that profile; pre-profile snapshots
   belong to Default. Preview and export a snapshot before restoring.
2. A project backup **Replace** snapshots the current active project before
   overwriting it, clears the TIA binding, and needs manual target selection.
3. **Merge** adds missing objects only; conflicts remain unchanged.
4. If a failed profile migration is suspected, inspect the original
   `tiaEngineeringAssistant.projectConfig.legacyBackup` in the browser's
   localStorage and import it via a project backup only after review.
5. If the browser profile is lost or site data is cleared, local IndexedDB
   cannot be reconstructed automatically. Keep exported JSON files off-machine.

## JSON structure and verification

The library package has `format: "TIAEngineeringAssistant"`,
`kind: "engineering_library"`, `schema_version: 1`, `metadata`, and
`objects`. Each object contains its type, name, normalized PLC members and
optional version history. The import parser validates unique IDs/names,
Struct/Array members, SemVer revisions and duplicates. Hashes of imported
active payloads are recomputed at the destination.

**Round-trip validation:** CI includes a two-context Playwright test of JSON
export/import and Struct/Array dependencies. A separate local TIA V21
validation is described in `docs/tia-v21-manual-smoke.md`.
