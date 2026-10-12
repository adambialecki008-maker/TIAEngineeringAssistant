"""No hardware is needed to verify cross-reference API encoding and contracts."""
import base64

from fastapi.testclient import TestClient
from engine.main import app
import engine.tia_openness as tia_openness


client = TestClient(app)
PARAMS = {
    "process_id": 321,
    "device_name": "S7-1500 Station_1",
    "plc_name": "PLC_1",
    "kind": "FB",
    "group_path": "Process",
    "name": "FB_Motor",
    "member_path": "Timer.ET",
}


def encoded(*items):
    return "|".join(base64.b64encode(x.encode("utf-8")).decode("ascii")
                    for x in items)


def test_cross_reference_api_decodes_real_location_fields(monkeypatch):
    calls = []

    def fake(*args):
        calls.append(args)
        return [
            "PLC_CROSS_REFERENCE|" + encoded(
                "ET", "FB_Motor.Timer.ET", "FB_Main",
                "Program blocks/FB_Main", "Network 3",
                "NW3", "Reference", "Read",
            ),
            "PLC_CROSS_REFERENCE_TOTAL|1|false",
        ]
    monkeypatch.setattr(tia_openness, "_run_adapter", fake)
    response = client.get("/api/v1/tia/plc-cross-references", params=PARAMS)
    assert response.status_code == 200, response.text
    assert calls == [(
        "plc-cross-references", "321", "S7-1500 Station_1", "PLC_1",
        "fb", "Process", "FB_Motor", "Timer.ET",
    )]
    assert response.json() == {
        "references": [{
            "source_name": "ET", "source_path": "FB_Motor.Timer.ET",
            "reference_name": "FB_Main",
            "reference_path": "Program blocks/FB_Main",
            "location_name": "Network 3",
            "reference_location": "NW3", "reference_type": "Reference",
            "access": "Read",
        }],
        "truncated": False,
    }


def test_no_crossrefs_requires_confirmed_empty_openness_result(monkeypatch):
    monkeypatch.setattr(tia_openness, "_run_adapter",
                        lambda *args: ["PLC_CROSS_REFERENCE_TOTAL|0|false"])
    response = client.get("/api/v1/tia/plc-cross-references", params=PARAMS)
    assert response.status_code == 200
    assert response.json() == {"references": [], "truncated": False}


def test_missing_crossref_summary_does_not_claim_no_references(monkeypatch):
    monkeypatch.setattr(tia_openness, "_run_adapter", lambda *args: [])
    response = client.get("/api/v1/tia/plc-cross-references", params=PARAMS)
    assert response.status_code == 502


def test_invalid_reference_data_is_not_silently_accepted(monkeypatch):
    monkeypatch.setattr(tia_openness, "_run_adapter",
                        lambda *args: ["PLC_CROSS_REFERENCE|wrong",
                                       "PLC_CROSS_REFERENCE_TOTAL|1|false"])
    assert client.get("/api/v1/tia/plc-cross-references",
                      params=PARAMS).status_code == 502
