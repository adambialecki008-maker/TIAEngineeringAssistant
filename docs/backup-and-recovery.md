# Project backup and recovery

## Backup scope

In **Data & Libraries → Project Backup**, select the configuration sections to
export: PLC family, UDTs, DBs, templates, groups, mappings and mapping mode.
A complete selection produces a **full project backup**; a subset produces a
**partial backup**. Backup JSON is portable to a different browser profile.

Backups exclude the transient TIA target and HMI run state. Library objects
and their revision history live separately in IndexedDB and should be exported
as Engineering Library JSON as well.

## Before editing or importing

1. Select the correct local project profile.
2. Export a full project backup and all relevant Engineering Libraries.
3. Create a named **Recovery snapshot**.
4. Store these files outside the browser's site data (preferably with another
   offline copy). Closing a tab is not a backup.
5. If a TIA write is planned, additionally make a **TIA Portal project
   archive/backup** and use a disposable test project.

## Restore or merge

1. Expand **Project Backup** and load the saved JSON.
2. Review the preview and selected sections.
3. **Replace project from backup** is available only for a full backup.
   It requires confirmation and creates a recovery snapshot first.
4. **Merge** keeps existing definitions and adds only safe missing entries;
   review all conflicts before accepting. Partial backup → Merge only.
5. After restore, reselect the active TIA PLC explicitly; do not reuse a
   target selected in another project or computer.

## Snapshots and revision recovery

Expand **Recovery snapshots**. Snapshot records have a reason, time, project
payload and `profile_id`; the UI displays only records for the selected
profile. Historical snapshots without a profile ID are associated with
Default. Preview or export before restoring. Restore itself creates a
snapshot of the current configuration so an accidental change can be rolled
back. The operation never writes to TIA Portal.

Engineering Library revisions are separate: **Versions** compares snapshots,
and **Restore as new revision** keeps the old history rather than deleting it.
If an entire browser profile or origin is lost, IndexedDB cannot restore itself
from localStorage; recover from exported JSON files.

## Recovery scenarios

- **Invalid import JSON:** cancel. The library import is validated before a
  single IndexedDB write transaction; repair the source file offline.
- **Unexpected object change:** consult the library Versions panel and restore
  a previous version under a new SemVer.
- **Wrong project profile:** switch to the correct one before applying backups
  or snapshots. The TIA target must be selected again.
- **Interrupted legacy migration:** preserve all storage keys, inspect
  `tiaEngineeringAssistant.projectConfig.legacyBackup` and follow
  `profiles-and-migration.md`.
- **Cleared site data:** restore profile and library JSON from off-machine
  exports. No automatic cloud restoration exists.

Running CI alone is not proof of Siemens TIA project recoverability.
