# HMI translation workflows — TIA Portal V21

## Unified GUI (Step 1–3)

The same three steps control **Project texts (XLSX)** and **Text lists (XML)**.
Scope checkboxes select one or both formats. There is **no separate Step 4** or
second automatic-import window.

1. **Step 1 — Scan**: read-only export of the checked formats for the selected
   HMI, source culture and target culture. Project texts and Text lists retain
   independent scan identities; Graphic lists are excluded.
2. **Step 2 — Batch settings / review**: one batch size (1–50) and one combined
   `Total to translate`. The expandable review editor appears only when a
   batch has prepared translations.
3. **Step 3 — Translate / approve / import**: the common **Translate** button
   starts the queue. When `Review each batch before import` is enabled,
   inspect/edit the prepared batch in Step 2 and select **Approve & import
   reviewed batch** in Step 3. When disabled, the selected formats run with
   automatic per-batch verification after the initial user confirmation.

Queue order is Project texts first, then individual XML Text lists.
Selecting both formats does **not** combine them in one Siemens import.

### Limits and progress

`Batch size = 5` and `Total to translate = 10` means up to ten eligible
translations across multiple batches of at most five. For XML, each import
reimports one complete Text list while preserving untouched entries.

The shared progress bar records only translations **verified after a fresh
TIA export**, not mere Ollama responses. Rejected QA proposals are not counted
as verified. Previously verified translations remain saved when Stop/Pause
is requested.

- **Pause**: finish the current safe operation before pausing.
- **Stop**: finish any ongoing TIA operation and verification, clear the
  current run's *visual* progress, and require a fresh scan before restarting.
  Previously verified TIA texts are **not undone**.
- Switching review **off** during an active reviewed queue authorizes
  automatic continuation at a safe boundary. Existing pause requests remain
  effective until the user resumes.
- Automatic XML execution has no persistent resume checkpoint; if a write's
  outcome is uncertain, inspect TIA and rescan before further imports.
- Automatic XLSX batch jobs maintain checkpoints under the ignored
  `.local/hmi_translation_jobs/` directory and do not blindly repeat
  previously verified batches.

### Project texts (XLSX)

Prepare only missing/placeholder target texts in the selected ViewPath root.
Ollama proposals and user edits are validated again before import. The backend
uses a fresh export to verify each changed target cell. Review tokens are
single-use after writes may have started. Never automatically retry an
uncertain write. Existing translations and unrelated HMIs are preserved.

### Text lists (XML)

Each XML Text list is prepared, validated, imported and re-exported
independently. Unchanged entries and other Text lists remain intact.
**Graphic lists are never translated.** XML automation can skip a list with
unsafe proposals but stops on an uncertain import outcome.

## Diagnostics and reports

Step 3 includes:

- **Download complete run report (CSV)**: a summary of confirmed write counts
  and skipped/errors collected during the run; the verified count is snapshotted
  so a later Scan cannot turn it negative.
- **Download HMI diagnostics (JSON)**: read-only GUI-state snapshot for
  diagnosing stuck queues, selected scopes, quotas, scans, review/automatic
  transitions and Pause/Stop. The snapshot includes no source texts,
  proposals or credentials. It does not contact TIA.

The diagnostics JSON describes **frontend state**, not independent evidence
that Siemens imported a translation.

## Local verification

Work on a separate backed-up TIA Portal V21 project. Tests must **not**
perform automatic TIA imports:

```powershell
git status
node --check gui/js/tia.js
.\.venv\Scripts\python.exe -m pytest -q
dotnet build .\openness_adapter\TiaOpennessAdapter.csproj
```

Then restart the server, Ctrl+F5, select the same HMI and run a read-only Scan.
Smoke-test small XLSX and XML batches on the test copy; independently
confirm imported values in a fresh TIA export.

A passing mocked test suite and successful adapter build do **not** replace
real TIA V21 verification. The user has confirmed XML imports work on a test
copy; XLSX behavior remains subject to final end-to-end verification.
