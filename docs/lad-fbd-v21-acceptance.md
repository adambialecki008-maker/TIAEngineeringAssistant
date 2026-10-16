# LAD/FBD analysis — TIA V21 acceptance procedure

## Scope and verification status

AI Code Review reads Siemens SimaticML / FlgNet XML in **read-only** mode.
It inventories Access, Part, Call, CallInfo, TemplateValue, explicit
wire endpoints and named ports. It does not reconstruct/execute an LAD/FBD
rung, infer Boolean truth tables or assume an ordering for Wire endpoints.

Public FlgNet/v4 format reference:
https://github.com/eliasrhoden/tia-statemachine/blob/main/simatic_ML_format.md

This reference is **not proof of real V21 compatibility**.
No original V21 LAD/FBD export is currently stored in this repository.

## Acceptance inputs — sanitized native exports required

Export **without changing the PLC program** from an offline/test project
opened in TIA Portal **V21**, through the native Openness block export
(PlcBlock.Export, XML), retaining the complete CompileUnit / FlgNet:

1. **LAD bit logic:** contact, normally closed contact, coil, parallel branch.
2. **FBD operators:** AND/OR, comparator, MOVE, local symbol, literal constant.
3. **FB/FC call:** CallInfo with parameters (Input, Output, InOut if present),
   instance reference, and connected and intentionally unconnected pins.

Before sharing, scrub confidential names, customers, machine descriptions,
credentials, addresses and proprietary comments while retaining XML structure.
Keep original exports private; publish sanitized fixtures only with permission.

## Deterministic comparison against TIA

For each real V21 export:

- Confirm exported FlgNet namespace version, network count and language.
- Compare each recognized Part, Access and Call UId, instruction name,
  constant value and parameter with the TIA editor and original XML.
- Check all Wire UIds, endpoint UIds, ports, symbol/constant references,
  fan-out/parallel wiring and CallInfo instance and parameter projections.
- Unknown XML nodes must be surfaced as **partial coverage**, not ignored.
- A known-good TIA-compiled network must not produce invented logic faults.
- Modify a **copy** of a fixture (duplicate UId, missing reference) and confirm
  warnings require TIA verification rather than claiming compile failures.
- Check that the GUI, JSON and Markdown preserve identical facts.
- Confirm no import, project save, PLC download or other write is attempted.

## Exit criteria

- All three V21 samples analyzed with no crash and no silent data loss.
- All recognized nodes, symbols and wire references match actual exported
  XML and the editor view; unfamiliar constructs are reported as partial.
- No unjustified **verified** LAD/FBD logic/error claims.
- Python, JavaScript and Playwright regression green; sanitized fixtures saved.
- Real TIA V21 editor/export comparison completed and recorded.

Until then point 4 is **implemented offline, awaiting V21 integration
verification**. Do not claim it is fully validated against V21.
