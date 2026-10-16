"""Adapter timeout coverage for large TIA Project texts operations."""

import subprocess
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from engine.tia import adapter


def test_ordinary_adapter_commands_keep_three_minute_timeout(monkeypatch):
    monkeypatch.setenv("TIA_PROJECT_TEXT_TIMEOUT_SECONDS", "1200")
    assert adapter.adapter_timeout_seconds("list-project-plcs") == 180
    assert adapter.adapter_timeout_seconds("list-project-plcs-fast") == 180
    assert adapter.adapter_timeout_seconds("list-project-languages") == 180


def test_project_text_commands_get_extended_timeout(monkeypatch):
    monkeypatch.delenv("TIA_PROJECT_TEXT_TIMEOUT_SECONDS", raising=False)
    assert adapter.adapter_timeout_seconds("export-project-texts") == 900
    assert adapter.adapter_timeout_seconds("import-project-texts") == 900


def test_custom_project_text_timeout(monkeypatch):
    monkeypatch.setenv("TIA_PROJECT_TEXT_TIMEOUT_SECONDS", "1500")
    assert adapter.adapter_timeout_seconds("export-project-texts") == 1500
    assert adapter.adapter_timeout_seconds("import-project-texts") == 1500


@pytest.mark.parametrize("value", ["nope", "120", "4000"])
def test_invalid_project_text_timeout_is_rejected(monkeypatch, value):
    monkeypatch.setenv("TIA_PROJECT_TEXT_TIMEOUT_SECONDS", value)
    with pytest.raises(HTTPException) as exc:
        adapter.adapter_timeout_seconds("export-project-texts")
    assert exc.value.status_code == 422


def test_export_uses_extended_subprocess_timeout(monkeypatch, tmp_path):
    exe = tmp_path / "TiaOpennessAdapter.exe"
    exe.touch()
    monkeypatch.setattr(adapter, "ADAPTER_EXE", exe)
    monkeypatch.delenv("TIA_PROJECT_TEXT_TIMEOUT_SECONDS", raising=False)
    captured = {}

    def subprocess_stub(args, **kwargs):
        captured["args"] = args
        captured["timeout"] = kwargs["timeout"]
        return SimpleNamespace(stdout="PROJECT_TEXTS_EXPORTED|out.xlsx", stderr="", returncode=0)

    monkeypatch.setattr(adapter.subprocess, "run", subprocess_stub)
    result = adapter.run_adapter("export-project-texts", "13940", "en-US", "pl-PL", "out.xlsx")
    assert captured["timeout"] == 900
    assert captured["args"][1] == "export-project-texts"
    assert result == ["PROJECT_TEXTS_EXPORTED|out.xlsx"]


def test_timeout_error_identifies_operation_and_duration(monkeypatch, tmp_path):
    exe = tmp_path / "TiaOpennessAdapter.exe"
    exe.touch()
    monkeypatch.setattr(adapter, "ADAPTER_EXE", exe)
    monkeypatch.setenv("TIA_PROJECT_TEXT_TIMEOUT_SECONDS", "600")

    def timed_out(args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args, timeout=kwargs["timeout"])

    monkeypatch.setattr(adapter.subprocess, "run", timed_out)
    with pytest.raises(HTTPException) as exc:
        adapter.run_adapter("import-project-texts", "13940", "file.xlsx", "false")
    assert exc.value.status_code == 504
    assert "import-project-texts" in exc.value.detail
    assert "600 seconds" in exc.value.detail
    assert "TIA_PROJECT_TEXT_TIMEOUT_SECONDS" in exc.value.detail
