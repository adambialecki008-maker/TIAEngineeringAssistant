# Local project profiles and legacy migration

## Project profiles on Overview

On **Overview**, use **Local project profiles** to create, select, rename, duplicate or delete
a local engineering project. Each profile has separate PLC family, UDTs, DBs,
device templates, groups and I/O mappings. Libraries remain shared.

- **Create project** starts a new empty configuration.
- **Duplicate project** copies configuration into a new independent profile,
  but deliberately does **not** copy the active TIA target.
- **Switch** saves the outgoing profile before selecting another. The target
  selection in the incoming profile is cleared and requires manual selection.
- **Rename** changes only the profile label.
- **Delete** is not supported for the Default or currently active profile.
  Create/export backups first; local deletion is not reversible.

**Overview** is also the single entry point for selecting the TIA process and Active PLC. There are no duplicated connection selectors in PLC, HMI or Data & Libraries.\n\nSelecting a profile **does not** import anything into an open TIA project, and
does not carry a live Siemens connection between profiles. Re-select the TIA
process and PLC and verify them before any separate write operation.

## Persistent keys (same browser origin)

| Key | Meaning |
| --- | --- |
| `tiaEngineeringAssistant.projectConfig.profile.<id>` | One project's JSON configuration |
| `tiaEngineeringAssistant.projectProfiles` | List of profile IDs and labels |
| `tiaEngineeringAssistant.activeProjectProfile` | Selected profile ID |
| `tiaEngineeringAssistant.projectConfig` | Legacy key, mirrored only for Default compatibility |
| `tiaEngineeringAssistant.projectConfig.legacyBackup` | Original legacy value preserved as recovery copy |

## One-way idempotent migration

At first startup, the app copies the existing legacy configuration to the
Default profile **before** writing the profile index. It retains a legacy
recovery copy and the original key. Repeated startups reuse the copied
configuration, rather than resetting or duplicating profiles.

Because localStorage is not transactional, migration also detects a partially
created profile index or payload: it recovers a missing Default configuration
from the old key without dropping separately created profiles. A malformed
profile index is rejected; it is **not** silently discarded and recreated.

Tests include `tests/project_profiles_runtime.cjs` for legacy migration,
repeat initialization, interrupted migration, duplicate isolation and the
required TIA target reset.

## Recovery after failure or a move

1. Do not clear browser site data or rename the origin.
2. Use DevTools → Application → Local Storage to inspect the keys above.
3. Save the raw recovery JSON outside the browser **before** editing any key.
4. If the index is invalid, restore an intact backed-up index or project
   data; do not overwrite other profile configurations.
5. Import a saved project backup with the matching profile selected, review
   the preview, then restore; confirm the PLC target independently.

IndexedDB library objects and profile configuration are **different stores**:
copying only localStorage does not transfer reusable libraries and snapshots.
Export JSON packages/backups separately before migrating browser profiles.
