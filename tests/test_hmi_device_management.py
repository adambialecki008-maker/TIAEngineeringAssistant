"""Contract and mocked API tests for guarded HMI device cloning."""
from pathlib import Path

from fastapi.testclient import TestClient

from engine.main import app
from engine.tia import hmi_devices, project

ROOT = Path(__file__).resolve().parents[1]
CLIENT = TestClient(app)
REQUEST = {
    "process_id": 23464,
    "source_device_name": "HMI_1",
    "source_hmi_name": "HMI_1",
    "target_device_name": "HMI_2",
    "target_ip_address": "192.168.1.42",
    "plc_device_name": "PLC_Device",
    "plc_name": "PLC_1",
    "existing_connection_name": "HMI_Connection_1",
    "backup_confirmed": True,
}


def test_hmi_clone_requires_backup_confirmation(monkeypatch):
    def forbidden(*_args):
        raise AssertionError("No Openness call without user backup confirmation")
    monkeypatch.setattr(hmi_devices, "run_adapter", forbidden)
    response = CLIENT.post("/api/v1/tia/hmis/clone", json={
        **REQUEST, "backup_confirmed": False,
    })
    assert response.status_code == 422
    assert "backup" in response.text.lower()


def test_hmi_clone_rejects_unsupported_cross_device_scaling(monkeypatch):
    monkeypatch.setattr(hmi_devices, "run_adapter",
                        lambda *_args: (_ for _ in ()).throw(
                            AssertionError("No Openness call")))
    response = CLIENT.post("/api/v1/tia/hmis/clone", json={
        **REQUEST, "scale_to_different_device": True,
    })
    assert response.status_code == 422
    assert "scal" in response.text.lower()


def test_hmi_clone_rejects_bad_ip_and_duplicate_source_name():
    bad_ip = CLIENT.post("/api/v1/tia/hmis/clone", json={
        **REQUEST, "target_ip_address": "999.2.1.10",
    })
    assert bad_ip.status_code == 422
    same = CLIENT.post("/api/v1/tia/hmis/clone", json={
        **REQUEST, "target_device_name": "hmi_1",
    })
    assert same.status_code == 422


def test_hmi_clone_adapter_receives_existing_connection(monkeypatch):
    calls = []
    def stub(*args):
        calls.append(args)
        return ["HMI_CLONED|HMI_1|HMI_2|192.168.1.42|HMI_Connection_1|16"]
    monkeypatch.setattr(hmi_devices, "run_adapter", stub)
    response = CLIENT.post("/api/v1/tia/hmis/clone", json=REQUEST)
    assert response.status_code == 201, response.text
    result = response.json()
    assert result["target_device_name"] == "HMI_2"
    assert result["verified_connected_tags"] == 16
    assert result["screen_scaling"] == "unchanged_same_model"
    assert calls == [("clone-hmi", "23464", "HMI_1", "HMI_1", "HMI_2",
                      "192.168.1.42", "PLC_Device", "PLC_1",
                      "HMI_Connection_1")]


def test_project_context_exposes_ip_and_connection_names(monkeypatch):
    def fake_adapter(*_args):
        return [
            "PROJECT|Demo",
            "HMI_NETWORK|HMI_1|HMI_1|192.168.1.10|HMI_Connection_1, Backup",
            "HMI|HMI_1|HMI_1|OrderNumber:6AV|HW-ID|"
                "Siemens.Engineering.Hmi.HmiTarget|Classic HMI",
        ]
    monkeypatch.setattr(project, "run_adapter", fake_adapter)
    response = CLIENT.get("/api/v1/tia/project-context?process_id=23464")
    assert response.status_code == 200, response.text
    item = response.json()["hmis"][0]
    assert item["ip_address"] == "192.168.1.10"
    assert item["plc_connections"] == ["HMI_Connection_1", "Backup"]


def test_hmi_clone_ui_has_source_ip_plc_and_collapsible_menu():
    html = (ROOT / "gui" / "index.html").read_text(encoding="utf-8")
    js = (ROOT / "gui" / "js" / "hmi_device_management.js").read_text(
        encoding="utf-8")
    for field in (
        "tia-hmi-device-menu", "tia-hmi-clone-source", "tia-hmi-clone-plc",
        "tia-hmi-clone-connection", "tia-hmi-clone-device-name",
        "tia-hmi-clone-ip", "tia-hmi-clone-backup", "tia-hmi-clone-button",
    ):
        assert f'id="{field}"' in html
    assert '<details id="tia-hmi-device-menu"' in html
    assert "ip_address" in js
    assert "plc_connections" in js
    assert '"/api/v1/tia/hmis/clone"' in js
    assert "backup_confirmed: backup.checked" in js


def test_adapter_clone_requires_existing_configured_plc_and_tag_links():
    program = (ROOT / "openness_adapter" / "Program.cs").read_text(
        encoding="utf-8")
    adapter = (ROOT / "openness_adapter" / "TiaHmiCloning.cs").read_text(
        encoding="utf-8")
    assert 'case "clone-hmi":' in program
    assert "ReadAllHmiTagConnectionNames" in adapter
    assert "GetHmiConnectionPartners" in adapter
    assert "MasterCopies.Create(" in adapter
    assert "project.Devices.CreateFrom(temporaryMaster)" in adapter
    assert 'node.SetAttribute("Address", newIp)' in adapter
    assert "temporaryMaster.Delete();" in adapter
    assert "SaveProject(project);" in adapter
