# Continuous integration (GitHub Actions)

Workflow: `.github/workflows/ci.yml`, triggered by pushes, pull requests
and manual `workflow_dispatch`. It runs three independent jobs on pinned **Ubuntu 24.04** runners
(to avoid unexpected changes during GitHub's Ubuntu 26 rollout):

1. **JavaScript**: Node 24 checks syntax of every `gui/js/*.js` and
   `tests/*.cjs` file and executes the real HMI review/automatic state
   transition harness (`tests/hmi_review_checkbox_runtime.cjs`).
   The harness simulates browser and backend responses; it never connects
   to a Siemens project.
2. **Python**: Python 3.12 runs the full `pytest` suite with Node 24
   available for subprocess-based JavaScript tests. A disposable PostgreSQL 16
   service provides the required `tia_engineering_assistant` database and
   `tia_user` role. The password is test-only, created in an ephemeral runner,
   and is not a project or production secret.

3. **Browser GUI (Playwright)**: a separate Chromium job starts the real
   FastAPI application on loopback and runs the existing
   `tests/member_editor_browser.cjs` browser regression. It edits nested
   UDT/DB members, tests array bounds, saving/cancelling, validation, source
   generation, rename/delete and local browser persistence.
   Playwright is installed in CI only (`1.56.1`); no production npm
   dependencies are added. Siemens endpoints are intercepted by the browser
   test, and no Siemens software or actual device connection is required.
   The local FastAPI server has no PostgreSQL-dependent operations in this
   browser test. Backend startup logs are retained as an artifact on failure.

**Not covered:** real Siemens TIA V21 / Openness adapter compilation, PLC/HMI
imports, TIA saves, independent re-export against an open TIA project, or an
actual Ollama model. Those remain local smoke tests on a backed-up project.
A green CI badge does not confirm a real engineering import.

The jobs require no repository secrets and use read-only GitHub permissions.
Only the current ref's newest run is kept active; obsolete runs on the same
ref are cancelled.

Local equivalents (project root):

```powershell
node --check gui/js/tia.js
node tests/hmi_review_checkbox_runtime.cjs
# For the browser regression: install Playwright and Chromium, start FastAPI
# on localhost:8765, then run node tests/member_editor_browser.cjs
.\.venv\Scripts\python.exe -m pytest -q
```

The database-related Python tests require a running PostgreSQL database with
appropriate `DB_NAME`, `DB_USER`, `DB_PASSWORD` and `DB_HOST`
environment settings.

## Runner and action versions

CI uses `ubuntu-24.04` rather than `ubuntu-latest` because GitHub plans
migration of the latest label to Ubuntu 26.04 starting October 19, 2026.
Changing runner OS is a separate, deliberately tested maintenance task.

GitHub Actions use the Node 24-capable major versions:
`actions/checkout@v5`, `actions/setup-node@v5`, and
`actions/setup-python@v6`. `setup-node` automatic package-manager caching
is disabled because this project has no npm dependency installation in the
core regression jobs. Repository credentials are not persisted by checkout.

An older historical GitHub Actions run may still show warnings from previous
workflow versions, or a failed test that was fixed in later commits. Always
check the CI result associated with the **current commit SHA**, not an old run.
