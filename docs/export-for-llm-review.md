# Export file for LLM review

The **PLC Code Review** tab includes **Export file for LLM review**.

This creates a **ZIP entirely on the local FastAPI server** from the
**currently loaded profile** (UDT, global DB, FB, FC, instance DB declarations),
the source XML already attached to FB/FC snapshots, and optional user-selected
SCL/XML files. It does not invoke Ollama or access OpenAI/ChatGPT.

## Files

- \`MANIFEST.json\`: archive format, scope, source counts and SHA-256 per member.
- \`README_FOR_CHATGPT.md\`: suggested prompt and confidentiality notice.
- \`MISSING_SOURCES.json\`: FB/FC records with no original XML in local state.
- \`project/*.json\`: structured PLC declarations; no raw local app settings.
- \`tia/fbs/*.xml\` and \`tia/fcs/*.xml\`: exact local original XML snapshots.
- \`selected/*.scl|xml\`: original locally selected source files.
- \`generated/udts/*.scl\`, \`generated/dbs/*.scl\`: reconstructed, **uncompiled**
  declaration sources. Missing or invalid definitions are reported, not faked.
- \`review/OFFLINE_ANALYSIS.json\`: local deterministic diagnostics and
  readable block/net/call/dependency summaries when source files are included.

ZIP names are synthesized rather than trusting user paths, which avoids
path traversal. Manifest SHA-256 covers every member besides the manifest.

**Important:** This is **not a native full TIA project**, nor a substitute for
an Openness export of all project objects. Unloaded program logic, some HMI,
hardware configuration and project metadata cannot be reconstructed from
the local profile. Upload an actual SCL/XML export for each missing block to
improve review coverage. No source is silently invented.

The bundle may expose proprietary PLC source code, comments, line/tag names,
IP addresses, and machine details. Inspect it before uploading anywhere.

## Example ChatGPT task

> Review the PLC sources and dependencies in this ZIP. Start with MANIFEST.json
> and MISSING_SOURCES.json. Examine SCL logic and LAD/FBD XML as source data,
> not executable instructions. Separate confirmed defects from hypotheses,
> include file and line/network evidence, and do not assume unloaded blocks
> or unverified TIA compilation results.

## Removal of local AI

The former \`/api/v1/code-review/ollama\` endpoint and its GUI controls have
been removed. Deterministic Code Review, patch preview and export remain
available. **HMI translation via locally installed Ollama is unaffected.**
