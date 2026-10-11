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
