"""Validate read-only direct Openness ownership metadata for Instance DBs."""
from fastapi.testclient import TestClient

from engine.main import app
from engine.tia import structures


def _read(client, lines, monkeypatch):
    monkeypatch.setattr(structures, "run_adapter", lambda *args: lines)
    return client.get("/api/v1/tia/plc-structures", params={
        "process_id": 123, "device_name": "Station", "plc_name": "PLC",
    })


def test_verified_source_metadata_is_exposed_for_instance_db_only(monkeypatch):
    client = TestClient(app)
    response = _read(client, [
        "PLC_DB||DB_A|10|InstanceDB|True",
        "PLC_DB||DB_Global|11|GlobalDB|True",
        "PLC_INSTANCE_DB_OWNER||DB_A|FB_A|FB|6",
    ], monkeypatch)
    assert response.status_code == 200, response.text
    by_name = {row["name"]: row for row in response.json()["data_blocks"]}
    assert by_name["DB_A"]["instance_of_name"] == "FB_A"
    assert by_name["DB_A"]["instance_of_type"] == "FB"
    assert by_name["DB_A"]["instance_of_number"] == 6
    assert "instance_of_name" not in by_name["DB_Global"]


def test_unknown_or_conflicting_instance_relation_is_not_inferred(monkeypatch):
    client = TestClient(app)
    response = _read(client, [
        "PLC_DB||DB_A|10|InstanceDB|True",
        "PLC_INSTANCE_DB_OWNER||DB_A|FB_A|FB|6",
        "PLC_INSTANCE_DB_OWNER||DB_A|FB_B|FB|7",
        "PLC_DB||DB_B|12|InstanceDB|True",
        "PLC_INSTANCE_DB_OWNER||DB_B|FB_B|FC|7",
    ], monkeypatch)
    assert response.status_code == 200, response.text
    for row in response.json()["data_blocks"]:
        assert "instance_of_name" not in row
