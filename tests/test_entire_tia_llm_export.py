"""Offline acceptance tests for whole OPEN TIA Portal project LLM export."""
import hashlib
import io
import json
import zipfile

import pytest

from fastapi.testclient import TestClient
from engine.main import app
from engine.tia.adapter import adapter_timeout_seconds

client = TestClient(app)
URL = "/api/v1/code-review/export-tia-project-for-llm?process_id=321"


@pytest.fixture(autouse=True)
def enable_only_for_simulated_export_tests(monkeypatch):
    monkeypatch.setenv("TIA_ENABLE_EXPERIMENTAL_LLM_EXPORT", "1")


def test_real_project_export_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("TIA_ENABLE_EXPERIMENTAL_LLM_EXPORT", raising=False)
    status = client.get("/api/v1/code-review/tia-export-status")
    assert status.status_code == 200
    assert status.json()["enabled"] is False

    def no_adapter_calls(*args):
        raise AssertionError("Unsafe Openness adapter must not be invoked")

    monkeypatch.setattr("engine.llm_project_export._run_adapter", no_adapter_calls)
    response = client.post(URL)
    assert response.status_code == 503
    assert "disabled" in response.json()["detail"].lower()


def test_export_requires_exact_explicit_opt_in(monkeypatch):
    for value in ("true", "yes", "0", ""):
        monkeypatch.setenv("TIA_ENABLE_EXPERIMENTAL_LLM_EXPORT", value)
        assert client.get("/api/v1/code-review/tia-export-status").json()["enabled"] is False
    monkeypatch.setenv("TIA_ENABLE_EXPERIMENTAL_LLM_EXPORT", "1")
    assert client.get("/api/v1/code-review/tia-export-status").json()["enabled"] is True



def fake_adapter(command, process_id, directory):
    assert command == "export-entire-project-llm"
    assert process_id == "321"
    from pathlib import Path
    root = Path(directory)
    (root / "plc/PLC_1/blocks").mkdir(parents=True)
    (root / "plc/PLC_1/types").mkdir(parents=True)
    (root / "hmi/HMI_1/screens").mkdir(parents=True)
    (root / "TIA_OBJECTS.tsv").write_text(
        "Kind\tObject\tPath\tMetadata\tFile\n"
        "PROJECT\tPlant_Main\t\topen project\t\n"
        "DEVICE\tPLC_1\t\tCPU 1516\t\n"
        "PLC_BLOCK\tFB_1\t\tFunctionBlock\tplc/PLC_1/blocks/000001_FB_1.xml\n"
        "PLC_TYPE\tUDT_1\t\tPlcType\tplc/PLC_1/types/000002_UDT_1.xml\n"
        "HMI_OBJECT\tMain\t\tScreen\thmi/HMI_1/screens/000003_Main.xml\n",
        encoding="utf-8",
    )
    (root / "TIA_MISSING.tsv").write_text(
        "Kind\tObject\tReason\nHMI_UNSUPPORTED\tHMI_1/Recipes\tNo Export overload\n",
        encoding="utf-8",
    )
    (root / "plc/PLC_1/blocks/000001_FB_1.xml").write_text(
        '<Document><SW.Blocks.FB><AttributeList><Name>FB_1</Name>'
        '<ProgrammingLanguage>LAD</ProgrammingLanguage></AttributeList>'
        '</SW.Blocks.FB></Document>', encoding="utf-8",
    )
    (root / "plc/PLC_1/types/000002_UDT_1.xml").write_text(
        '<Document><SW.Types.PlcStruct><AttributeList><Name>UDT_1</Name>'
        '</AttributeList></SW.Types.PlcStruct></Document>', encoding="utf-8",
    )
    (root / "hmi/HMI_1/screens/000003_Main.xml").write_text(
        '<Document><Hmi.Screen Name="Main"/></Document>', encoding="utf-8",
    )
    return ["LLM_PROJECT_EXPORTED|Plant_Main|3|1"]


def test_entire_open_tia_export_is_project_scoped_not_loaded_profile(monkeypatch):
    monkeypatch.setattr("engine.llm_project_export._run_adapter", fake_adapter)
    response = client.post(URL)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["cache-control"] == "no-store"
    assert "TIA_Portal_Entire_Project_LLM_Review.zip" in response.headers["content-disposition"]
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = set(archive.namelist())
    assert "TIA_OBJECTS.tsv" not in names
    assert "tia-project/TIA_OBJECTS.tsv" in names
    assert "tia-project/TIA_MISSING.tsv" in names
    assert "tia-project/plc/PLC_1/blocks/000001_FB_1.xml" in names
    assert "tia-project/plc/PLC_1/types/000002_UDT_1.xml" in names
    assert "tia-project/hmi/HMI_1/screens/000003_Main.xml" in names
    assert "review/DETERMINISTIC_ANALYSIS.json" in names
    manifest = json.loads(archive.read("MANIFEST.json"))
    assert manifest["project_name"] == "Plant_Main"
    assert manifest["source_scope"] == "entire_open_tia_project"
    assert manifest["native_tia_archive"] is False
    assert manifest["full_fidelity_guaranteed"] is False
    assert manifest["missing_object_rows"] == 1
    assert manifest["read_only"] is True
    assert manifest["ollama_used"] is False
    assert "TIA_MISSING.tsv" in archive.read("README_FOR_CHATGPT.md").decode("utf-8")
    assert len(names) == len(manifest["files"]) + 1
    for entry in manifest["files"]:
        raw = archive.read(entry["name"])
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"]
    assert adapter_timeout_seconds("export-entire-project-llm") >= 900


def test_entire_tia_export_rejects_missing_process_and_invalid_results(monkeypatch):
    assert client.post("/api/v1/code-review/export-tia-project-for-llm").status_code == 422
    assert client.post("/api/v1/code-review/export-tia-project-for-llm?process_id=0").status_code == 422
    monkeypatch.setattr("engine.llm_project_export._run_adapter", lambda *args: [])
    response = client.post(URL)
    assert response.status_code == 502
    assert "confirm" in response.json()["detail"].lower()


def test_missing_tia_project_inventory_is_rejected_not_exposed_as_complete(monkeypatch):
    def no_inventory(cmd, pid, folder):
        return ["LLM_PROJECT_EXPORTED|Empty|0|0"]
    monkeypatch.setattr("engine.llm_project_export._run_adapter", no_inventory)
    assert client.post(URL).status_code == 502


def test_tia_adapter_bulk_export_command_exists_without_project_write():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    program = (root / "openness_adapter" / "Program.cs").read_text(encoding="utf-8")
    service = (root / "openness_adapter" / "TiaProjectLlmExport.cs").read_text(encoding="utf-8")
    assert 'case "export-entire-project-llm":' in program
    assert "TiaService.ExportEntireProjectForLlm(processId, args[2])" in program
    assert "EnumerateDevices(project)" in service
    assert "ExportBlockGroup(" in service
    assert "ExportTypeGroup(" in service
    assert "ExportTagGroup(" in service
    assert "ExportHmiSoftware(" in service
    assert "TIA_MISSING.tsv" in service
    assert "TIA_EXPORT_PROGRESS.log" in service
    assert "string deviceName = " in service
    assert 'report.Failure("DEVICE_TRAVERSAL", deviceName, rootError.Message)' in service
    assert "rootError is EngineeringObjectDisposedException" in service
    assert "project.Save(" not in service
    assert "project.Import" not in service
