# TIA HMI translations with local Ollama

The HMI translation workflow uses the **local Ollama HTTP API** instead of OpenAI API. It does not require `OPENAI_API_KEY` or the OpenAI SDK.

## Windows setup

1. Install and start Ollama. Verify that it is running with:
   ```powershell
   ollama list
   Invoke-RestMethod http://127.0.0.1:11434/api/tags
   ```
2. If the model list is empty, download a suitable multilingual model using `ollama pull <model>`.
3. Start TIA Engineering Assistant and open an HMI's **Translate texts** panel.
4. Use **Refresh models**, then select an installed model. If exactly one model is installed, it is selected automatically.
5. Select the source column, target language and the correct HMI `ViewPath` root. Use **Preview texts** to check the matched rows.
6. Choose the 10-text pilot, then **Prepare translations**. This calls Ollama but does not modify TIA.
7. Review **Proposed translation (AI)** and only then click **Import reviewed texts**. The app re-exports project texts to verify actual imported values.

## Optional environment settings

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
# Optional default; must match an installed model listed by Ollama:
# OLLAMA_TRANSLATION_MODEL=your-installed-model:tag
# Optional: larger batches can reduce Ollama overhead, but may affect
# output reliability on small local models (1-50, default 15).
# OLLAMA_TRANSLATION_BATCH_SIZE=25
```

No configured model is required when you select one from the GUI. Models are discovered through `GET /api/tags` and requested through `POST /api/chat` with `stream: false`, `format` JSON Schema and `temperature: 0`.

If the local server is not running, the GUI reports an Ollama connection error. If several models are installed, select one explicitly. Translation preparation does not activate languages or import XLSX.

The target slot is the TIA column to be written (for example `pl-PL`), while the actual source language is inferred from the source text. Polish strings stored in an `en-US*` column can therefore remain Polish when the target is `pl-PL`.

## Tests

```powershell
python -m pytest tests/test_hmi_translation_api.py tests/test_hmi_review.py tests/test_hmi_text_preview.py -q
```

The unit tests mock the Ollama HTTP responses; a running Ollama instance or TIA Portal is not needed to run these tests.

## Large HMI projects and translation progress

During **Prepare translations**, the GUI polls the progress endpoint and shows
whether TIA is exporting the XLSX or Ollama is translating batches. The
counter reports **unique source text strings**, not all XLSX rows.
The model processes batches sequentially, so a full project can take a long
time depending on the local GPU/CPU and installed model. If the selected
model consistently returns valid JSON, `OLLAMA_TRANSLATION_BATCH_SIZE=25`
(or 30) can reduce the number of requests; if translation results become
unreliable, reduce it back to 15. Configuration changes require restarting
the backend; do not restart during an active import or preparation.

The extended TIA export/import timeout is separate:
`TIA_PROJECT_TEXT_TIMEOUT_SECONDS` defaults to 900 seconds. It does not
limit total Ollama translation duration.

## Automatic batch import into TIA (opt-in)

The **Batch translate + import to TIA** panel is separate from the manual
**Prepare -> Review -> Import** workflow. Use this mode only after a successful
pilot and after taking a TIA project backup. A single explicit start
confirmation authorizes automatic per-batch imports; individual translations
are not manually approved in this mode.

- **Batch size**: number of **unique source text strings** (1-200) to translate
  and import to the selected HMI in one TIA transaction; default 50.
  Ollama itself still splits these strings into smaller API requests
  (`OLLAMA_TRANSLATION_BATCH_SIZE`, default 15).
- **Total to translate**: optional maximum unique strings for this job.
  Example batch size 50 and total 500 means up to 10 import transactions.
  Blank total means all matched unique strings.
- Every batch runs: export current TIA project texts, translate that batch in
  Ollama, validate translations, export TIA again to check stale source/target
  values, import the selected HMI's texts, then re-export and verify them.
  **Only a successful verification advances the checkpoint**.
- All occurrences of a selected source string in the same HMI are translated
  together. Other HMI devices are excluded. Unselected rows belonging to the
  chosen HMI retain their current translations.
- The job cursor, parameters and candidate source texts are saved locally
  to `.local/hmi_translation_jobs/<job_id>.json`, excluded from Git.
  Verified batches are not retried after a normal pause or page refresh.
- **Pause after this batch** never interrupts an import in progress. You can
  **Resume saved job** after reopening the GUI and reselecting the same
  project/HMI/root/languages. If the previous batch failed or execution was
  interrupted during import, stop and check actual TIA project texts first;
  retry requires explicit confirmation because a partial import is possible.
- Do not modify the TIA project from another application during batch import.
  Import/verification failures stop the job immediately.

The job is driven by the open GUI through sequential API calls. A page reload
will prevent starting subsequent batches, although any current server-side
request may finish. To resume, reopen the same HMI, restore the same
source/target/root, and click **Resume saved job**.

**Important**: the automatically saved checkpoint applies to this new batch
job, not to pilot translations imported previously using the manual workflow.
Those earlier texts may be included again when starting a new job. The job is
constructed from the current TIA export, so each part preserves the latest
target values of previous verified parts. If the goal is to exclude already
translated strings from a preexisting pilot, inspect their selection before
starting a new job.

Tests:
```powershell
python -m pytest tests/test_hmi_batches.py tests/test_hmi_review.py tests/test_hmi_translation_api.py -q
```
