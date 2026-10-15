# I/O template mapping and TIA UDT read-only import

## I/O Engineering

The menu formerly labelled **Devices** is now **I/O Engineering**.
Internal tab id `devices` remains unchanged.

### Two mapping modes

- **By device / template** (new projects): one manually specified start
  channel per I/O direction and physical data width for each device group.
  Within a channel lane, consume template signals for **Motor1**, then
  **Motor2**, etc. For Run/Stop/Reset, quantity 2, start `%I386.0`,
  the result is Motor1 Run 386.0, Stop 386.1, Reset 386.2, followed
  by Motor2 Run 386.3, Stop 386.4, Reset 386.5.
- **By signal (legacy)**: retain existing behaviour with one first channel
  per signal and repeated signal across devices. Existing stored groups use
  this mode unless a mode was explicitly persisted; saved anchors are
  retained when switching modes. A new configuration defaults to By device.

**No arbitrary free-channel assignment.** First channel always comes
from the actual electrical schematic. The algorithm consumes only the next
consecutive compatible physical addresses in the same station; it does not
skip holes, jump to another station, or resolve conflicts by shifting tags.
An exact channel width is required; `ChannelWidth` unavailable/zero
will block mapping in By device mode rather than guessing.

Mixed DI/DO or digital/analogue widths use separate manually selected
starting channels, because they do not share the same physical address
stream. Displayed tag rows follow each device and template signal order,
even if their physical addresses come from separate lanes.

Creating PLC Tags in TIA is still an explicit operation, with confirmation.
Any mapping errors block that action. Preview alone performs no writes.

### Boundary coverage (automated)

`node tests/io_mapping_runtime.cjs`: 18 targeted scenarios, including
1/multiple devices, device-major Run/Stop/Reset, missing/stale anchors,
cross-group collision, address gaps, contiguous next module, station
boundaries, DI/DO streams, Word widths, unsupported types, capacity,
duplicate names, mode separation, unchanged settings.

`node tests/udt_import_runtime.cjs`: 20 scenarios, covering member order,
nested Struct, array bounds and UDT references, HMI metadata, unknown
attributes, corrupted paths, unsupported/expanded array XML, duplicate
members and no mutation.

`node tests/io_udt_browser.cjs` runs in Playwright/Chromium CI and
checks real GUI mode switching, generated tag order/addresses and safe
local UDT import against mocked TIA read-only endpoints.

## Read an existing UDT from TIA

1. Open a **test/backed-up** project in TIA Portal V21, and choose process
   and Active PLC in the TIA Portal tab. Select its matching PLC family.
2. Open **UDT definitions** > **Import existing UDT from TIA (read-only)**.
3. Click **Read UDT list from TIA**, choose a type, then
   **Import UDT into editor**.
4. The adapter exports the selected UDT XML using the existing read-only
   endpoint. The GUI converts supported declarations to the local editor
   data model and validates them with the Pydantic UDT API.
5. If the UDT already exists in the local editor, or attributes cannot
   round-trip losslessly, importing is blocked. No existing local or TIA
   type is silently replaced.
6. Modify the **local** copy. To upload it without replacing a type
   already used by DBs, rename it to a **new unique UDT name**, select it
   in **Generate source**, run the guarded UDT/DB preflight and explicitly
   confirm create-only import on a backed-up test project.

### Explicit limitation: in-place replacement is NOT supported

The existing source importer is create-only. **It never updates an existing
UDT with the same name.** In-place replacement could invalidate dependent
DBs/FBs, metadata and compilation, and needs a separate reviewed operation:
dependency analysis, snapshot/re-export diff, backup confirmation,
compile/save verification, and an operator-directed recovery path for
ambiguous partial writes. A green CI is not a Siemens TIA acceptance test.

Siemens I/O hardware metadata, actual UDT XML variations, and the
versioned create-only import still need a manual smoke test on a project
backup. Do not download to a running CPU for this validation.
