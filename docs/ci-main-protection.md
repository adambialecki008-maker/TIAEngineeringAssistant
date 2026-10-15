# Protect the `main` branch

This pull request bootstraps CI on `main` without changing the application.

## One-time GitHub settings (repository administrator)

GitHub > Settings > Rules > Rulesets > New branch ruleset:

1. Name: **Protect main**. Enforcement: **Active**.
2. Target: branch **main** (use branch-name pattern `main`).
3. Enable **Require a pull request before merging**. For a solo repository,
   do not require another person's approving review unless desired.
4. Enable **Require status checks to pass** and select these **exact** names:
   - `JavaScript syntax`
   - `Python pytest (isolated PostgreSQL)`
   - `GUI editor (Playwright Chromium)`
5. Enable **Require branches to be up to date before merging**.
6. Disable force pushes and deletions. Do not add bypass permissions.

Do not choose outdated checks from a previous workflow run.
These checks appear after CI has run against this PR.

GitHub branch protection and rulesets are enforced **server-side**; a workflow
file on its own does not prevent direct pushes. In particular, this PR does
**not** change ruleset settings automatically. An authenticated repository
administrator must apply and verify the settings in the GitHub UI.

## Scope

This changes only:
- GitHub Actions workflow (syntax, pytest + PostgreSQL, browser Playwright)
- Existing UDT/DB browser test instrumentation for trace/screenshots
- This instructions file

It does not change TIA integration, HMI translations, PLC logic or database
code. The browser test uses isolated FastAPI; Siemens API calls are intercepted
except the offline preview endpoint.

## Current development branch

The separate branch `codex/fix-udt-reuse-text-list-import` runs further
HMI/PLC JavaScript regression tests. Those can be merged later; it should
retain the same `JavaScript syntax` check name to satisfy this ruleset.
