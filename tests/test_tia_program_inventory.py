"""Regressions: program listing must not duplicate DB inventory."""
from fastapi.testclient import TestClient

from engine.main import app
from engine.tia import program


client = TestClient(app)
PARAMS = {"process_id": 123, "device_name": "PLC_1", "plc_name": "CPU_1"}


def _adapter_lines(*args):
    return [
        "PLC_PROGRAM_BLOCK||Main|OB|1|LAD|true|100|40",
        "PLC_PROGRAM_BLOCK|Logic|Motor|FB|10|LAD|true|200|80",
        "PLC_PROGRAM_BLOCK|Logic|Calculate|FC|12|SCL|true|150|60",
        "PLC_PROGRAM_BLOCK||Settings|DB|25|DB|true|300|120",
    ]


def test_program_only_excludes_db_and_passes_adapter_flag(monkeypatch):
    calls = []

    def adapter(*args):
        calls.append(args)
        return _adapter_lines(*args)

    monkeypatch.setattr(program, "run_adapter", adapter)
    response = client.get(
        "/api/v1/tia/plc-program-blocks",
        params={**PARAMS, "program_only": "true"},
    )
    assert response.status_code == 200, response.text
    assert {item["kind"] for item in response.json()} == {"OB", "FC", "FB"}
    assert len(response.json()) == 3
    assert calls == [
        ("list-program-blocks", "123", "PLC_1", "CPU_1", "program-only")
    ]


def test_default_adapter_listing_remains_backward_compatible(monkeypatch):
    calls = []

    def adapter(*args):
        calls.append(args)
        return _adapter_lines(*args)

    monkeypatch.setattr(program, "run_adapter", adapter)
    response = client.get(
        "/api/v1/tia/plc-program-blocks", params=PARAMS,
    )
    assert response.status_code == 200, response.text
    assert {item["kind"] for item in response.json()} == {"OB", "FC", "FB", "DB"}
    assert calls == [("list-program-blocks", "123", "PLC_1", "CPU_1")]
