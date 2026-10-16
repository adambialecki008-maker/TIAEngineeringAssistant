# Codex development progress

## IEC instances in Function Blocks

- Added a context-only path for Siemens system instances in the `Static`
  section of local Function Blocks. UDT and global DB editors remain blocked
  from using these types.
- The available IEC instance list is filtered by the active PLC family from the
  shared Siemens type registry. No internal IEC fields are generated.
- Validation: `node --check gui/js/member-editor.js`, `node --check gui/js/fb.js`;
  `pytest -q tests/test_member_editor.py tests/test_function_block.py
  tests/test_siemens_type_registry.py` — 9 passed.
- Commit: pending.
- Remaining: make the FB model carry explicit system-instance metadata, add
  FB dependency validation and implement local Instance DB previews.
