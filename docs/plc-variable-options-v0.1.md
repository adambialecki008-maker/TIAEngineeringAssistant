# PLC variable options — pilot v0.1 (TIA V21)

The UDT / Data Blocks editors now offer the following **explicit, optional**
configuration. Existing configurations without these fields retain their
previous SCL output.

| Feature | UI | Generated source |
| --- | --- | --- |
| Start value | Scalar UDT/DB field | `name : Bool := TRUE;` and equivalent numeric literals |
| Visible in HMI engineering | Three-state dropdown | `EXTERNALVISIBLE` |
| Accessible from HMI / OPC UA / Web API | Three-state dropdown | `EXTERNALACCESSIBLE` |
| Writable from HMI / OPC UA / Web API | Three-state dropdown | `EXTERNALWRITABLE` |
| Retain | **Entire global DB only** | `RETAIN` or `NON_RETAIN` |
| Setpoint | Not supported in this UDT/DB generator | FB interface context only |
| Supervision | Not supported | Requires process diagnostics engineering |

**Three-state dropdown:** TIA default / Enabled / Disabled. The "TIA default"
option **does not emit** that attribute; this is not the same as explicitly
setting it to false.

## Start values supported by this initial version

- `Bool`: `TRUE`, `FALSE`, `1`, `0`
- `SInt`, `USInt`, `Int`, `UInt`, `DInt`, `UDInt`,
  `LInt`, `ULInt`: decimal integers, range validated
- `Real`, `LReal`: finite decimal numbers

`Struct` and `Array` cannot receive a single Start value via this editor.
Instead set defaults on scalar fields of the referenced UDT. Distinct values
per array index (e.g. `Motors[1]` vs. `Motors[2]`) are outside v0.1.

A global optimized DB may support per-member retentivity in TIA, **but this
generator does not yet support that setting**. The DB-wide `RETAIN` header
does not provide per-member control. Do not rely on this option for individual
safety-critical or memory-constrained variables.

## Next verification on a TIA V21 project copy

The original `UDT_Motor` and `DB_Motors` were already imported. To avoid
a collision, use new names (for example `UDT_Motor_OptionsTest` and
`DB_Motors_OptionsTest`) when testing this update.

1. Edit a Bool member in the UDT (e.g. `Cmd.Start`).
2. Set Start value to `TRUE`.
3. Set Visible to Disabled, Accessible to Enabled, Writable to Disabled.
4. Add an Int member with Start value `12`; optionally test Real `1.5`.
5. Leave all unspecified properties of other members as TIA default.
6. In the new DB, choose Whole DB `RETAIN` only if this matches the test.
7. Click Validate UDT, Validate DB and Generate source.
8. Confirm the attributes and values appear on the relevant declarations,
   and the DB has `RETAIN` / `NON_RETAIN` as expected.
9. Build and test locally; then use the guarded import preflight and import
   into a **copy** of the TIA project only.
10. Compile the PLC, open the generated UDT and DB, and inspect Start value,
    HMI flags and Retain. Do not download to a running CPU.

At this stage, automatic independent post-import verification of individual
HMI/Start/Retain properties is **not implemented**. A successful adapter
status confirms creation and project save, **not** attribute equivalence.
This pilot needs real TIA V21 acceptance testing before production use.

Useful local checks:

```powershell
git pull --ff-only
.\.venv\Scripts\python.exe -m pytest tests/test_plc_member_attributes.py -q
.\.venv\Scripts\python.exe -m pytest -q
dotnet build .\openness_adapter\TiaOpennessAdapter.csproj
```
