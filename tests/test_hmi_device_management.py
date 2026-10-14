"""Contract and mocked API tests for guarded HMI device cloning."""
import base64
from pathlib import Path

import pytest

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


def _encoded(value):
    return base64.b64encode(value.encode("utf-8")).decode("ascii")


def _connection_line(name, driver="", station="", partner="", node="",
                     online=""):
    return "HMI_CONNECTION|" + "|".join(_encoded(value) for value in (
        "HMI_00_Main", "HMI_RT_1", name, driver, station, partner, node,
        online,
    ))


def _status_line(status, diagnostic=""):
    return "HMI_CONNECTION_STATUS|" + "|".join((
        _encoded("HMI_00_Main"), _encoded("HMI_RT_1"), status,
        _encoded(diagnostic),
    ))


def _project_hmi(monkeypatch, connection_lines):
    monkeypatch.setattr(project, "run_adapter", lambda *_args: [
        "PROJECT|OpennnesTest_Torowisko",
        "HMI_NETWORK|HMI_00_Main|HMI_RT_1|192.168.1.3|Krata1",
        "HMI|HMI_00_Main|HMI_RT_1|||"
        "Siemens.Engineering.Hmi.HmiTarget|HMI_RT_1",
        *connection_lines,
    ])
    response = CLIENT.get("/api/v1/tia/project-context?process_id=23464")
    assert response.status_code == 200, response.text
    return response.json()["hmis"][0]


@pytest.mark.parametrize("names", [
    [],
    ["HMI_Connection_1"],
    ["HMI_Connection_1", "Krata1"],
    ["HMI_Connection_1", "Krata1", "Backup", "Diagnostics"],
])
def test_structured_hmi_connections_preserve_adapter_order(monkeypatch, names):
    item = _project_hmi(monkeypatch, [
        *(_connection_line(name) for name in names),
        _status_line("complete"),
    ])
    assert [connection["name"] for connection in item["connections"]] == names
    assert item["plc_connections"] == names
    assert item["connection_read_status"] == "complete"


def test_realistic_hmi_fixture_keeps_driver_partner_and_encoding(monkeypatch):
    item = _project_hmi(monkeypatch, [
        _connection_line(
            "HMI_Connection_1", "SIMATIC S7 1500",
            "S7-1500/1515F-2PN", "PPFKA2", "CPU 1515F-2 PN", "true",
        ),
        _connection_line("Krata1", "OPC UA"),
        _status_line("partial", "Integrated connections may be absent."),
    ])
    assert item["connections"][0] == {
        "name": "HMI_Connection_1",
        "communication_driver": "SIMATIC S7 1500",
        "station": "S7-1500/1515F-2PN",
        "partner": "PPFKA2",
        "node": "CPU 1515F-2 PN",
        "online": True,
    }
    assert item["connections"][1]["communication_driver"] == "OPC UA"
    assert item["connection_read_status"] == "partial"
    assert item["connection_diagnostic"] == "Integrated connections may be absent."


def test_hmi_connection_names_with_delimiters_are_lossless(monkeypatch):
    name = "Line, A | PLC\nbackup"
    item = _project_hmi(monkeypatch, [
        _connection_line(name, partner="PLC | A, B"),
        _status_line("complete"),
    ])
    assert item["connections"][0]["name"] == name
    assert item["connections"][0]["partner"] == "PLC | A, B"
    assert item["plc_connections"] == [name]


def test_unavailable_hmi_connection_read_does_not_claim_none(monkeypatch):
    item = _project_hmi(monkeypatch, [
        _status_line("unavailable", "EngineeringNotSupportedException"),
    ])
    assert item["connections"] == []
    assert item["plc_connections"] == []
    assert item["connection_read_status"] == "unavailable"
    assert item["connection_diagnostic"] == "EngineeringNotSupportedException"


def test_legacy_hmi_names_are_partial_not_confirmed_complete(monkeypatch):
    item = _project_hmi(monkeypatch, [])
    assert item["plc_connections"] == ["Krata1"]
    assert [entry["name"] for entry in item["connections"]] == ["Krata1"]
    assert item["connection_read_status"] == "partial"
