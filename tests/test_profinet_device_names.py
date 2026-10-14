"""Read-only PROFINET node identification for engineering I/O view."""
from pathlib import Path

from fastapi.testclient import TestClient

import engine.tia_openness as facade
from engine.main import app


ROOT = Path(__file__).resolve().parents[1]
client = TestClient(app)


def test_profinet_names_are_separate_from_project_station_names(monkeypatch):
    calls = []

    def fake_run_adapter(*arguments):
        calls.append(arguments)
        assert arguments == ("list-io", "3544")
        return [
            "PROJECT|ExampleProject",
            "PN_DEVICE_NAME|ET 200SP station_1|Tracks",
            "PN_DEVICE_NAME|ET 200SP station_2|Cart2Main",
            "HW_ITEM|ET 200SP station_1|ET 200SP station_1/DI_1|DI_1|"
            "OrderNumber:6ES7...|True|1|1",
            "HW_ITEM|ET 200SP station_2|ET 200SP station_2/DI_1|DI_1|"
            "OrderNumber:6ES7...|True|1|1",
            "HW_ITEM|ET 200SP station_3|ET 200SP station_3/DI_1|DI_1|"
            "OrderNumber:6ES7...|True|1|1",
            "IO_CHANNEL|ET 200SP station_1|ET 200SP station_1/DI_1|DI_1|"
            "OrderNumber:6ES7...|0|Input|Digital|600|1",
            "IO_CHANNEL|ET 200SP station_2|ET 200SP station_2/DI_1|DI_1|"
            "OrderNumber:6ES7...|0|Input|Digital|608|1",
        ]

    monkeypatch.setattr(facade, "_run_adapter", fake_run_adapter)
    response = client.get("/api/v1/tia/io", params={"process_id": 3544})
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["profinet_device_names"] == {
        "ET 200SP station_1": "Tracks",
        "ET 200SP station_2": "Cart2Main",
    }
    assert [i["device_name"] for i in data["items"]] == [
        "ET 200SP station_1", "ET 200SP station_2", "ET 200SP station_3",
    ]
    assert [i["device_name"] for i in data["channels"]] == [
        "ET 200SP station_1", "ET 200SP station_2",
    ]
    assert [i["channel_address_bits"] for i in data["channels"]] == [
        600, 608,
    ]
    assert calls == [("list-io", "3544")]


def test_hardware_inventory_without_profinet_node_stays_compatible(monkeypatch):
    monkeypatch.setattr(
        facade, "_run_adapter",
        lambda *args: [
            "PROJECT|ExampleProject",
            "HW_ITEM|Station_1|Station_1/DI_1|DI_1|Type|True|1|1",
        ],
    )
    response = client.get("/api/v1/tia/io", params={"process_id": 3544})
    assert response.status_code == 200, response.text
    assert response.json()["profinet_device_names"] == {}
    assert response.json()["items"][0]["device_name"] == "Station_1"


def test_pn_name_only_changes_display_not_hardware_map_identifiers():
    frontend = (ROOT / "gui" / "js" / "devices.js").read_text(
        encoding="utf-8"
    )
    adapter = (ROOT / "openness_adapter" / "TiaService.cs").read_text(
        encoding="utf-8"
    )
    markup = (ROOT / "gui" / "index.html").read_text(encoding="utf-8")

    assert 'node.GetAttribute("PnDeviceName")' in adapter
    assert '"PN_DEVICE_NAME|"' in adapter
    assert 'profinet_device_name:' in frontend
    assert "module.profinet_device_name || module.device_name" in frontend
    assert "channelKey(" in frontend
    assert "PROFINET / device name" in markup
