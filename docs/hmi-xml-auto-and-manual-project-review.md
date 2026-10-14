# HMI translation workflows — October 2026

Two independent import mechanisms coexist.

## Unified three-step HMI interface

The HMI screen contains **only Step 1, Step 2 and Step 3**.
The `Project texts (XLSX)` and `Text lists (XML)` checkboxes determine
which controls and details appear. They do not create separate workflow
windows.

- **Step 1 — Scan**: two matching blue/white expandable disclosures:
  **Text lists** followed by **Project texts**. Each includes its own
  read-only scanned data; Project texts details contain the XLSX table,
  ViewPath diagnostics and read-only audit.
- **Step 2 — Batch settings**: one shared batch size and total count.
- **Step 3 — Prepare and review**: one pair of manual review/import actions,
  both editable review tables, and a single **Automatic import (optional)**
  area. Within this area XML and XLSX actions appear only when their
  respective checkbox is selected. Their execution and verification remain
  independent; selecting both does not silently mix formats in one write.

## Project texts (XLSX)

1. Select HMI, source language, target language and Ollama model.
2. Check **Project texts (XLSX)** and scan.
3. Click **Prepare XLSX batch for review** (1–50 unique texts).
4. Each validated row now has an editable target textarea and a **Use source**
   button. This includes AI-approved proposals; manual edits aren't restricted
   to previously skipped rows anymore.
5. Click **Import reviewed XLSX batch**. ALL displayed proposals are sent
   along with the ephemeral review token. The backend matches the exact set
   of selected sources and performs structural/technical QA again before
   consuming the token or calling TIA.
6. Invalid manual proposals are rejected without TIA writes. Correct the
   text and retry using the same prepared review. On uncertain Openness
   failure, do not blindly retry; rescan the project.

The existing automatic XLSX batch-job API remains compatible; it omits the
optional manually edited proposals and follows its original checkpoint logic.

## Text lists (Classic XML)

There are now two modes with different approval guarantees:

- **Manual XML** (Step 3): prepare, inspect and edit the selected list's
  proposals, then explicitly approve its import.
- **Automatic XML** (Step 4): first scan eligible Text lists, then click
  **Start automatic XML batches** and approve the global warning ONCE.
  The frontend runs separate sequential cycles
  `prepare -> QA -> import -> re-export verification -> rescan -> next`.
  No two XML imports run concurrently and no Graphic lists are touched.
  Every batch is capped at 50 entries and imports only the current Text list.
  Unsafe proposals are excluded, and lists with no acceptable candidates
  are skipped to prevent an infinite loop.

**Pause after current XML batch** finishes the current verification before
stopping. It is NOT a safe hard-cancel of a running Siemens import.

The automatic XML mode is intentionally **not resumable after page reload**
and never retries a failed/uncertain import. It keeps progress only in the
current browser session. An interrupted job must be inspected in TIA and
freshly scanned before any new import. A fully resumable XML job requires
a persisted, server-side checkpoint and snapshot/verification reconciliation.

XML automation and automatic XLSX are **separate** buttons. Selecting both
scopes doesn't silently import across both data formats.

## Local validation

```powershell
git status
git pull --ff-only
.\.venv\Scripts\python.exe -m pytest tests/test_hmi_xml_auto_and_manual_review.py tests/test_hmi_model_disclosure.py -q
.\.venv\Scripts\python.exe -m pytest -q
dotnet build .\openness_adapter\TiaOpennessAdapter.csproj
```

Then restart the FastAPI server, Ctrl+F5 in the browser, select the same
HMI and scan again. First test manual XLSX correction and manual XML
with 1–2 entries. Use the automatic XML mode only on an isolated test copy.

Neither the API tests nor static JS checks substitute for a real TIA V21
end-to-end test. If the import status is uncertain, stop, inspect and rescan.
