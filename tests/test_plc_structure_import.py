"""Pilot PLC UDT/DB import: read-only plan and guarded apply."""
from pathlib import Path

from fastapi.testclient import TestClient

import engine.tia_openness as facade
from engine.main import app


client = TestClient(app)


def request_data():
    return {
        "process_id": 3544,
        "device_name": "Device_1",
        "plc_name": "PLC_1",
        "project": {
            "plc_family": "S7-1500",
            "udts": [{
                "name": "UDT_Motor",
                "fields": [
                    {"name": "Cmd", "data_type": "Struct", "struct_members": [
                        {"name": "Start", "data_type": "Bool"},
                        {"name": "Stop", "data_type": "Bool"},
                    ]},
                    {"name": "Sts", "data_type": "Struct", "struct_members": [
                        {"name": "Running", "data_type": "Bool"},
                    ]},
                ],
            }],
            "dbs": [{
                "name": "DB_Motors",
                "members": [{
                    "name": "Motors",
                    "data_type": "Array",
                    "array_element_type": "UDT_Motor",
                    "array_lower_bound": 1,
                    "array_upper_bound": 10,
                }],
            }],
        },
    }


def mock_adapter(calls, existing=None, changed=False):
    existing = existing or []

    def run(*args):
        calls.append(args)
        if args[0] == "list-project-plcs":
            project = "Other_Project" if changed else "Test_Project_Copy"
            return [
                "PROJECT|" + project,
                "PLC|Device_1|PLC_1|System:Device.S71500|CPU_1",
            ]
        if args[0] == "list-structures":
            return existing
        if args[0] == "import-plc-structures":
            assert len(args) == 9
            assert args[4] == "Test_Project_Copy"
            assert args[5:7] == ("UDT_Motor", "DB_Motors")
            assert Path(args[7]).exists() and Path(args[8]).exists()
            assert 'TYPE "UDT_Motor"' in Path(args[7]).read_text("ascii")
            assert 'Array[1..10] of "UDT_Motor"' in Path(args[8]).read_text("ascii")
            return [
                "STRUCTURE_IMPORTED|UDT|UDT_Motor",
                "STRUCTURE_IMPORTED|DB|DB_Motors",
                "PROJECT_SAVED|Test_Project_Copy",
            ]
        raise AssertionError("Unexpected command " + str(args))

    return run


def test_plan_is_read_only_and_lists_expected_sources(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    response = client.post(
        "/api/v1/tia/plc-structure-import/plan", json=request_data()
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["project_name"] == "Test_Project_Copy"
    assert result["udt_name"] == "UDT_Motor"
    assert result["db_name"] == "DB_Motors"
    assert len(result["token"]) == 64
    assert 'TYPE "UDT_Motor"' in result["udt_source"]
    assert 'DATA_BLOCK "DB_Motors"' in result["db_source"]
    assert [call[0] for call in calls] == [
        "list-project-plcs", "list-structures"
    ]


def test_conflicts_block_import_even_in_nested_tia_groups(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_UDT|Nested|UDT_Motor|PlcType|True"]
    ))
    response = client.post(
        "/api/v1/tia/plc-structure-import/plan", json=request_data()
    )
    assert response.status_code == 409
    assert "UDT_Motor" in response.json()["detail"]
    assert all(call[0] != "import-plc-structures" for call in calls)


def test_apply_requires_confirmed_backup_and_unchanged_plan(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = request_data()
    preview = client.post(
        "/api/v1/tia/plc-structure-import/plan", json=payload
    ).json()
    apply = {**payload, "expected_token": preview["token"]}
    refused = client.post("/api/v1/tia/plc-structure-import/apply", json=apply)
    assert refused.status_code == 422
    changed = {**apply, "backup_confirmed": True}
    changed["project"] = {**payload["project"], "dbs": [{
        **payload["project"]["dbs"][0],
        "name": "DB_Motors_Revised",
    }]}
    stale = client.post(
        "/api/v1/tia/plc-structure-import/apply", json=changed
    )
    assert stale.status_code == 409
    assert all(call[0] != "import-plc-structures" for call in calls)


def test_confirmed_apply_sends_separate_udt_and_db_files(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = request_data()
    plan = client.post(
        "/api/v1/tia/plc-structure-import/plan", json=payload
    ).json()
    result = client.post(
        "/api/v1/tia/plc-structure-import/apply",
        json={**payload, "expected_token": plan["token"],
              "backup_confirmed": True},
    )
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "imported"
    assert result.json()["project_saved"] == "Test_Project_Copy"
    assert [call[0] for call in calls].count("import-plc-structures") == 1


def test_name_or_source_restrictions_reject_before_tia(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = request_data()
    payload["project"]["udts"][0]["name"] = "UDT\"; Inject"
    response = client.post(
        "/api/v1/tia/plc-structure-import/plan", json=payload
    )
    assert response.status_code == 422
    assert calls == []

    payload = request_data()
    payload["project"]["udts"][0]["fields"][0]["comment"] = "Zażółć"
    response = client.post(
        "/api/v1/tia/plc-structure-import/plan", json=payload
    )
    assert response.status_code == 422
    assert "non-ASCII" in response.json()["detail"]
    assert calls == []


def test_import_must_not_claim_success_without_adapter_confirmation(monkeypatch):
    calls = []
    fake = mock_adapter(calls)
    def without_db(*args):
        if args[0] == "import-plc-structures":
            return ["STRUCTURE_IMPORTED|UDT|UDT_Motor"]
        return fake(*args)
    monkeypatch.setattr(facade, "_run_adapter", without_db)
    payload = request_data()
    token = client.post(
        "/api/v1/tia/plc-structure-import/plan", json=payload
    ).json()["token"]
    response = client.post(
        "/api/v1/tia/plc-structure-import/apply",
        json={**payload, "expected_token": token,
              "backup_confirmed": True},
    )
    assert response.status_code == 502
    assert "did not confirm DB" in response.json()["detail"]
