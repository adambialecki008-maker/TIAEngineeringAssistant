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


def test_real_project_export_is_enabled_after_session_lifetime_fix(monkeypatch):
    from fastapi import HTTPException
    status = client.get("/api/v1/code-review/tia-export-status")
    assert status.status_code == 200
    assert status.json()["enabled"] is True

    def no_adapter_calls(*args):
        raise HTTPException(503, "Adapter deliberately unavailable in this unit test")

    monkeypatch.setattr("engine.llm_project_export._run_adapter", no_adapter_calls)
    response = client.post(URL)
    assert response.status_code == 503
    assert "Adapter deliberately unavailable" in response.json()["detail"]



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


def test_openness_session_failure_reports_last_export_operation(monkeypatch):
    from pathlib import Path
    from fastapi import HTTPException

    def aborted_export(command, process_id, directory):
        assert command == "export-entire-project-llm"
        (Path(directory) / "TIA_EXPORT_PROGRESS.log").write_text(
            "2026-10-16T17:00:00Z\\tDEVICE_ITEM\\tPLC_1/rack_0\\n",
            encoding="utf-8",
        )
        raise HTTPException(502, "EngineeringObjectDisposedException")

    monkeypatch.setattr("engine.llm_project_export._run_adapter", aborted_export)
    response = client.post(URL)
    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "EngineeringObjectDisposedException" in detail
    assert "last export operation" in detail
    assert "PLC_1/rack_0" in detail


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
    static_review = json.loads(archive.read("review/DETERMINISTIC_ANALYSIS.json"))
    assert static_review["coverage"]["by_scope"]["plc"]["analyzed"] == 2
    assert static_review["coverage"]["by_scope"]["hmi"]["analyzed"] == 1
    assert "analyzed subset" in static_review["notice"]
    manifest = json.loads(archive.read("MANIFEST.json"))
    assert manifest["project_name"] == "Plant_Main"
    assert manifest["source_scope"] == "entire_open_tia_project"
    assert manifest["native_tia_archive"] is False
    assert manifest["full_fidelity_guaranteed"] is False
    assert manifest["missing_object_rows"] == 1
    assert manifest["read_only"] is True
    assert manifest["ollama_used"] is False
    assert manifest["static_review_coverage"]["plc"]["analyzed"] == 2
    assert "TIA_MISSING.tsv" in archive.read("README_FOR_CHATGPT.md").decode("utf-8")
    assert len(names) == len(manifest["files"]) + 1
    for entry in manifest["files"]:
        raw = archive.read(entry["name"])
        assert hashlib.sha256(raw).hexdigest() == entry["sha256"]
    assert adapter_timeout_seconds("export-entire-project-llm") >= 900


def test_static_review_selects_plc_before_hmi_and_marks_unreviewed_sources():
    from engine.llm_project_export import _select_static_review_sources

    hmi_xml = b'<Document><Hmi.Screen Name="Main"/></Document>'
    files = {
        f"tia-project/hmi/HMI_1/screens/{index:04d}.xml": hmi_xml
        for index in range(80)
    }
    files["tia-project/plc/PLC_1/blocks/000001_FB_Main.xml"] = (
        b"<Document><SW.Blocks.FB><AttributeList><Name>FB_Main</Name>"
        b"</AttributeList></SW.Blocks.FB></Document>"
    )

    selected, coverage = _select_static_review_sources(files)

    selected_names = {source.name for source in selected}
    assert "tia-project/plc/PLC_1/blocks/000001_FB_Main.xml" in selected_names
    assert coverage["by_scope"]["plc"]["analyzed"] == 1
    assert coverage["by_scope"]["hmi"]["analyzed"] == 50
    assert coverage["by_scope"]["hmi"]["skipped_limit"] == 30
    skipped = [item for item in coverage["sources"] if item["status"] == "skipped"]
    assert all(item["reason"] for item in skipped)


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
    assert "private static bool IsSessionFatal" in service
    assert "ReadProfinetDeviceNameForExport(device)" in service
    assert "object software = null" in service
    assert "try { software = container.Software; }" in service
    assert "if (IsSessionFatal(rootError)) throw;" in service
    roots = service[service.index("string[] roots"):service.index("var seen")]
    assert '"GraphicLists",' not in roots
    assert "HMI_GRAPHIC_LIST_EXCLUDED" in service
    assert "IsExcludedGraphicList(value)" in service
    assert "Siemens.Engineering.Hmi.TextGraphicList.GraphicList" in service
    assert "project.Save(" not in service
    assert "project.Import" not in service
