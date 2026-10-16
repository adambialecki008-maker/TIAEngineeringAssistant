# Export file for LLM review — whole OPEN TIA Portal project

The PLC Code Review page offers **Export file for LLM review — entire TIA project**.
This action uses the selected **TIA process** in the application's TIA
connection panel. It connects read-only via the local V21 Openness adapter to
the **entire currently open TIA Portal project**. It no longer relies on the
application's previously imported FB/FC profile snapshot.

## Steps

1. Start TIA Portal V21 and open the intended project.
2. In TIAEngineeringAssistant, select **Refresh TIA** and choose the TIA process.
3. Go to **PLC Code Review** and click **Export file for LLM review — entire TIA project**.
4. The browser downloads **TIA_Portal_Entire_Project_LLM_Review.zip**.
5. Inspect the ZIP for confidential engineering data before uploading it to
   ChatGPT. Start review with **MANIFEST.json**, **TIA_OBJECTS.tsv**,
   **TIA_MISSING.tsv** and the XML under \`tia-project/\`.

## What is collected

The adapter attaches to the open project once and traverses all enumerated
device groups and hardware device items. For all PLC software objects it
discovers, it recursively visits every program block group and PLC type group
(including FB, FC, OB, DB and UDT) and exports Siemens XML using native
Openness \`Export(..., ExportOptions.WithDefaults)\`. PLC tag tables are recorded
as tab-separated data (name, type and logical address).

For every HMI software object detected, it enumerates the available
Classic/Unified screen, tag table, script, text list, connection and other
well-known Openness collections. It **attempts** native XML exports for
exportable objects. Some V21 HMI object families use distinct methods or
formats and may not be exported as XML. Every unsupported or unsuccessful
export is recorded rather than silently omitted.

Hardware is represented as a full *enumerated hardware inventory* with device
names, item paths, type identifiers and plug status. It is **not** a
round-trippable electrical/network configuration. Separate project libraries,
protected blocks and unsupported HMI/WinCC Unified exports may still be missing.

The archive includes:
- \`tia-project/TIA_OBJECTS.tsv\`: exported/inventoried project objects and paths
- \`tia-project/TIA_MISSING.tsv\`: each inaccessible/unsupported object and reason
- \`tia-project/plc/**\`: exported native PLC SimaticML/XML and tag tables
- \`tia-project/hmi/**\`: available native HMI object XML
- \`review/DETERMINISTIC_ANALYSIS.json\`: bounded offline structural checks
- \`MANIFEST.json\`: SHA-256 member digests, project/process identity and coverage
- \`MISSING_SOURCES.md\` and \`README_FOR_CHATGPT.md\`: scope and review guidance

## Important technical limits

**A single complete, ChatGPT-readable XML of a whole TIA project is not exposed
by Siemens Openness V21.** Exports are performed object by object. Objects
without an export API, know-how protected content and some hardware/HMI
structures cannot be reconstructed from their XML exports.

The ZIP is not a \`.ap21\` project, a \`.zap21\` backup or a compilation-tested
copy. A backup must still be created in TIA Portal itself. The manifest always
declares \`full_fidelity_guaranteed: false\`, and **TIA_MISSING.tsv** explains
gaps. The adapter must be built against Siemens V21 assemblies locally, and
its HMI object traversal must be validated on your own project.

The archive is produced locally. No sources are sent to Ollama, ChatGPT or
any third party by the application. The user decides whether to upload it.

For Siemens's official V21 API documentation, see:
https://docs.tia.siemens.cloud/r/en-us/v21/tia-portal-openness-api-for-automation-of-engineering-workflows/export/import
