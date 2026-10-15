"""Run production preflight diagnosis mapping under Node, without TIA."""
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js required")
def test_source_import_diagnostics_runtime():
    result = subprocess.run(
        ["node", "tests/source_import_diagnostics.cjs"],
        cwd=ROOT, capture_output=True, text=True, timeout=15,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "Preflight English diagnostic scenarios: PASS" in result.stdout
