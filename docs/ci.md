# Continuous integration (GitHub Actions)

Workflow: `.github/workflows/ci.yml`, triggered by pushes, pull requests
and manual `workflow_dispatch`. It runs two independent jobs:

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
.\.venv\Scripts\python.exe -m pytest -q
```

The database-related Python tests require a running PostgreSQL database with
appropriate `DB_NAME`, `DB_USER`, `DB_PASSWORD` and `DB_HOST`
environment settings.
