"""Runtime state-transition regressions for the HMI review checkbox.

Executes the actual GUI queue functions/listeners in Node with a fake
browser and controlled async Promises. Never contacts the TIA API.
"""
from pathlib import Path
import shutil
import subprocess

import pytest


ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js required")
def test_review_checkbox_runtime_across_prepare_approval_import_and_pause():
    result = subprocess.run(
        ["node", "tests/hmi_review_checkbox_runtime.cjs"],
        cwd=ROOT, capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "HMI review checkbox transitions: PASS" in result.stdout
