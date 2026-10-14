"""Read-only multi-structure preflight and guarded create-only import."""
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
                "name": "UDT_Motor", "fields": [
                    {"name": "Cmd", "data_type": "Struct", "struct_members": [
                        {"name": "Start", "data_type": "Bool"},
                        {"name": "Stop", "data_type": "Bool"},
                    ]},
                ],
            }],
            "dbs": [{
                "name": "DB_Motors", "members": [{
                    "name": "Motors", "data_type": "Array",
                    "array_element_type": "UDT_Motor",
                    "array_lower_bound": 1, "array_upper_bound": 10,
                }],
            }],
        },
    }


def add_structures(data):
    data["project"]["udts"].append({
        "name": "UDT_Valve",
        "fields": [{"name": "Opened", "data_type": "Bool"}],
    })
    data["project"]["dbs"].append({
        "name": "DB_Valves",
        "members": [{"name": "Valve", "data_type": "UDT_Valve"}],
    })
    return data


def mock_adapter(calls, *, existing=(), xml=None, project="Test_Project_Copy",
                 without_confirm=None):
    existing = tuple(existing)
    xml = xml or {
        "UDT_Motor": (
            '<Document><Section Name="Static"><Member Name="Cmd" '
            'Datatype="Struct"><Member Name="Start" Datatype="Bool"/>'
            '<Member Name="Stop" Datatype="Bool"/></Member></Section></Document>'
        ),
        "DB_Motors": (
            '<Document><Section Name="Static"><Member Name="Motors" '
            'Datatype="Array[1..10] of UDT_Motor"/></Section></Document>'
        ),
    }

    def run(*args):
        calls.append(args)
        if args[0] == "list-project-plcs":
            return [
                "PROJECT|" + project,
                "PLC|Device_1|PLC_1|System:Device.S71500|CPU_1",
            ]
        if args[0] == "list-structures":
            return list(existing)
        if args[0] == "export-structure":
            Path(args[7]).write_text(xml[args[6]], encoding="utf-8")
            return ["STRUCTURE_EXPORTED|" + args[6]]
        if args[0] == "import-plc-structure-batch":
            assert len(args) == 6
            assert args[4] == "Test_Project_Copy"
            manifest = Path(args[5])
            assert manifest.exists()
            rows = [row.split("|", 2) for row in
                    manifest.read_text("utf-8").splitlines()]
            for kind, name, path in rows:
                body = Path(path).read_text("ascii")
                assert (kind == "UDT" and 'TYPE "' + name + '"' in body
                        or kind == "DB" and 'DATA_BLOCK "' + name + '"' in body)
            names = [row[1] for row in rows]
            return ([
                f"STRUCTURE_IMPORTED|{kind}|{name}"
                for kind, name, _ in rows if name != without_confirm
            ] + ["PROJECT_SAVED|Test_Project_Copy"])
        raise AssertionError("Unexpected adapter command " + str(args))
    return run


def preflight(payload):
    return client.post("/api/v1/tia/plc-structure-import/plan", json=payload)


def apply(payload, plan, *, backup=True, names=None):
    return client.post("/api/v1/tia/plc-structure-import/apply", json={
        **payload, "expected_token": plan["token"],
        "backup_confirmed": backup,
        "approved_create": plan["will_create"] if names is None else names,
    })


def test_plan_is_read_only_and_lists_sources(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    result = preflight(request_data())
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["counts"] == {
        "create": 2, "identical": 0, "conflict": 0, "blocked": 0
    }
    assert data["will_create"] == ["UDT_Motor", "DB_Motors"]
    assert data["can_apply"] is True
    assert len(data["token"]) == 64
    assert 'TYPE "UDT_Motor"' in data["items"][0]["source"]
    assert 'DATA_BLOCK "DB_Motors"' in data["items"][1]["source"]
    assert [call[0] for call in calls] == ["list-project-plcs", "list-structures"]


def test_many_structures_udts_before_dbs_and_explicit_subset(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = add_structures(request_data())
    plan = preflight(payload).json()
    assert plan["will_create"] == [
        "UDT_Motor", "UDT_Valve", "DB_Motors", "DB_Valves"
    ]
    invalid = apply(payload, plan, names=["UDT_Motor"])
    assert invalid.status_code == 422
    assert not any(c[0] == "import-plc-structure-batch" for c in calls)
    result = apply(payload, plan)
    assert result.status_code == 200, result.text
    assert result.json()["created"] == plan["will_create"]
    assert any(c[0] == "import-plc-structure-batch" for c in calls)


def test_same_existing_structure_is_skipped_and_missing_db_is_created(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_UDT|Nested|UDT_Motor|PlcType|True"]
    ))
    payload = request_data()
    plan = preflight(payload)
    assert plan.status_code == 200, plan.text
    data = plan.json()
    assert data["counts"] == {
        "create": 1, "identical": 1, "conflict": 0, "blocked": 0
    }
    assert data["will_create"] == ["DB_Motors"]
    applied = apply(payload, data)
    assert applied.status_code == 200, applied.text
    assert applied.json()["created"] == ["DB_Motors"]
    assert applied.json()["skipped_identical"] == ["UDT_Motor"]


def test_all_identical_means_no_import(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=[
            "PLC_UDT||UDT_Motor|PlcType|True",
            "PLC_DB||DB_Motors|1|GlobalDB|True",
        ]
    ))
    data = preflight(request_data()).json()
    assert data["counts"]["identical"] == 2
    assert data["can_apply"] is False
    refused = apply(request_data(), data)
    assert refused.status_code == 409
    assert not any(c[0] == "import-plc-structure-batch" for c in calls)


def test_different_existing_structure_blocks_whole_job(monkeypatch):
    calls = []
    adapter = mock_adapter(
        calls, existing=["PLC_UDT|Nested|UDT_Motor|PlcType|True"],
        xml={"UDT_Motor": '<Document><Section Name="Static">'
                            '<Member Name="Changed" Datatype="Bool"/>'
                            '</Section></Document>'},
    )
    monkeypatch.setattr(facade, "_run_adapter", adapter)
    data = preflight(request_data()).json()
    assert data["counts"] == {
        "create": 0, "identical": 0, "conflict": 1, "blocked": 1
    }
    assert "UDT_Motor" in [x["name"] for x in data["items"]
                            if x["status"] == "conflict"]
    assert data["can_apply"] is False
    assert apply(request_data(), data).status_code == 409
    assert not any(c[0] == "import-plc-structure-batch" for c in calls)


def test_name_collision_with_other_object_type_blocks(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_DB|Nested|UDT_Motor|27|GlobalDB|True"]
    ))
    data = preflight(request_data()).json()
    assert data["counts"]["conflict"] == 1
    assert data["can_apply"] is False


def test_attributes_that_cannot_be_verified_must_not_be_skipped_as_identical(
        monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_UDT||UDT_Motor|PlcType|True"]
    ))
    payload = request_data()
    payload["project"]["udts"][0]["fields"][0]["struct_members"][0][
        "hmi_accessible"] = True
    data = preflight(payload).json()
    assert data["counts"]["conflict"] == 1
    assert "cannot fully verify" in data["items"][0]["reason"]


def test_reject_circular_types_and_duplicate_names_before_tia(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = request_data()
    payload["project"]["udts"].append({
        "name": "UDT_Motor",
        "fields": [{"name": "X", "data_type": "Bool"}],
    })
    assert preflight(payload).status_code == 422
    payload = request_data()
    payload["project"]["udts"][0]["fields"] = [{
        "name": "Self", "data_type": "UDT_Motor",
    }]
    assert preflight(payload).status_code == 422
    assert calls == []


def test_apply_requires_backup_and_rechecks_current_snapshot(monkeypatch):
    calls = []
    mock = mock_adapter(calls)
    monkeypatch.setattr(facade, "_run_adapter", mock)
    payload = request_data()
    plan = preflight(payload).json()
    assert apply(payload, plan, backup=False).status_code == 422
    changed = request_data()
    changed["project"]["dbs"][0]["name"] = "Changed"
    assert apply(changed, plan).status_code == 409
    assert not any(c[0] == "import-plc-structure-batch" for c in calls)


def test_import_must_confirm_all_created_objects_and_save(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, without_confirm="DB_Motors"
    ))
    payload = request_data()
    plan = preflight(payload).json()
    result = apply(payload, plan)
    assert result.status_code == 502
    assert "Missing TIA creation confirmation" in result.json()["detail"]


def test_preflight_rejects_bad_member_names_and_non_ascii_comments(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = request_data()
    payload["project"]["udts"][0]["name"] = 'UDT"; Inject'
    assert preflight(payload).status_code == 422
    payload = request_data()
    payload["project"]["udts"][0]["fields"][0]["comment"] = "Zażółć"
    assert preflight(payload).status_code == 422
    assert calls == []


def test_db_only_references_existing_tia_udt_by_quoted_name(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_UDT|Types|UDT_Motor|PlcType|True"]
    ))
    payload = request_data()
    payload["project"]["udts"] = []
    data = preflight(payload)
    assert data.status_code == 200, data.text
    plan = data.json()
    assert plan["will_create"] == ["DB_Motors"]
    assert 'Array[1..10] of "UDT_Motor"' in plan["items"][0]["source"]


def test_udt_dependencies_generate_in_correct_order_even_if_declared_backward(
        monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = request_data()
    payload["project"]["udts"] = [
        {"name": "UDT_Outer", "fields": [
            {"name": "Nested", "data_type": "UDT_Inner"}]},
        {"name": "UDT_Inner", "fields": [
            {"name": "Value", "data_type": "Bool"}]},
    ]
    plan = preflight(payload)
    assert plan.status_code == 200, plan.text
    assert plan.json()["will_create"][:2] == ["UDT_Inner", "UDT_Outer"]
    assert '"UDT_Inner"' in plan.json()["items"][1]["source"]


def test_instance_db_name_collision_must_not_be_treated_as_identical(
        monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_DB|Nested|DB_Motors|11|InstanceDB|True"]
    ))
    plan = preflight(request_data())
    assert plan.status_code == 200, plan.text
    report = plan.json()
    # The instance DB collision must remain blocked, but the unrelated,
    # missing UDT_Motor is eligible for creation (partial import policy).
    assert report["can_apply"] is True
    assert report["will_create"] == ["UDT_Motor"]
    match = next(x for x in report["items"] if x["name"] == "DB_Motors")
    assert match["status"] == "conflict"
    assert "not confirmed as a global" in match["reason"]
    assert not any(c[0] == "import-plc-structure-batch" for c in calls)


def test_instance_db_only_selection_is_blocked_without_any_create(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_DB|Nested|DB_Motors|11|InstanceDB|True"]
    ))
    payload = request_data()
    payload["selected_udts"] = []
    payload["selected_dbs"] = ["DB_Motors"]
    response = preflight(payload)
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["can_apply"] is False
    assert report["will_create"] == []
    assert report["counts"]["conflict"] == 1
    assert apply(payload, report).status_code == 409
    assert not any(c[0] == "import-plc-structure-batch" for c in calls)


def test_blocked_instance_db_does_not_auto_create_orphan_udt(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_DB|Nested|DB_Motors|11|InstanceDB|True"]
    ))
    payload = request_data()
    payload["selected_udts"] = []
    payload["selected_dbs"] = ["DB_Motors"]
    plan = preflight(payload)
    assert plan.status_code == 200, plan.text
    result = plan.json()
    assert [item["name"] for item in result["items"]] == ["DB_Motors"]
    assert result["will_create"] == []
    assert result["counts"]["conflict"] == 1
    assert result["auto_dependencies"] == []
    assert not result["can_apply"]


def test_generate_preview_and_import_can_select_only_udts(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = add_structures(request_data())
    payload["selected_udts"] = ["UDT_Valve"]
    payload["selected_dbs"] = []
    preview = client.post("/api/v1/tia/plc-structure-import/preview", json={
        "project": payload["project"],
        "selected_udts": ["UDT_Valve"], "selected_dbs": [],
    })
    assert preview.status_code == 200, preview.text
    assert preview.json()["items"] == [
        {"kind": "udt", "name": "UDT_Valve", "auto_dependency": False}
    ]
    assert 'TYPE "UDT_Valve"' in preview.json()["source"]
    assert "DB_Valves" not in preview.json()["source"]
    planned = preflight(payload)
    assert planned.status_code == 200, planned.text
    assert planned.json()["will_create"] == ["UDT_Valve"]
    assert planned.json()["counts"] == {
        "create": 1, "identical": 0, "conflict": 0, "blocked": 0
    }
    imported = apply(payload, planned.json())
    assert imported.status_code == 200, imported.text
    assert imported.json()["created"] == ["UDT_Valve"]


def test_mixed_conflict_imports_only_independent_structures(monkeypatch):
    calls = []
    adapter = mock_adapter(
        calls, existing=["PLC_UDT||UDT_Motor|PlcType|True"],
        xml={"UDT_Motor": '<Document><Section Name="Static">'
                            '<Member Name="Wrong" Datatype="Bool"/>'
                            '</Section></Document>'},
    )
    monkeypatch.setattr(facade, "_run_adapter", adapter)
    payload = add_structures(request_data())
    planned = preflight(payload)
    assert planned.status_code == 200, planned.text
    report = planned.json()
    statuses = {row["name"]: row["status"] for row in report["items"]}
    assert statuses == {
        "UDT_Motor": "conflict",
        "UDT_Valve": "create",
        "DB_Motors": "blocked",
        "DB_Valves": "create",
    }
    assert report["counts"] == {
        "create": 2, "identical": 0, "conflict": 1, "blocked": 1
    }
    assert report["can_apply"] is True
    assert report["will_create"] == ["UDT_Valve", "DB_Valves"]
    applied = apply(payload, report)
    assert applied.status_code == 200, applied.text
    assert applied.json()["created"] == ["UDT_Valve", "DB_Valves"]
    assert applied.json()["skipped_conflicts"] == ["UDT_Motor", "DB_Motors"]


def test_missing_configured_udt_is_auto_included_before_dependent_db(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = add_structures(request_data())
    payload["selected_udts"] = ["UDT_Valve"]
    payload["selected_dbs"] = ["DB_Motors", "DB_Valves"]
    plan = preflight(payload)
    assert plan.status_code == 200, plan.text
    data = plan.json()
    assert set(data["will_create"]) == {
        "UDT_Motor", "UDT_Valve", "DB_Motors", "DB_Valves"
    }
    assert data["will_create"].index("UDT_Motor") < data["will_create"].index("DB_Motors")
    assert data["auto_dependencies"] == ["UDT_Motor"]
    statuses = {x["name"]: x["status"] for x in data["items"]}
    assert all(value == "create" for value in statuses.values())
    assert data["counts"]["blocked"] == 0


def test_single_checked_db_only_generates_it_and_required_udt(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = add_structures(request_data())
    payload["selected_udts"] = []
    payload["selected_dbs"] = ["DB_Motors"]
    preview = client.post("/api/v1/tia/plc-structure-import/preview", json={
        "project": payload["project"],
        "selected_udts": [], "selected_dbs": ["DB_Motors"],
    })
    assert preview.status_code == 200, preview.text
    data = preview.json()
    assert [item["name"] for item in data["items"]] == ["UDT_Motor", "DB_Motors"]
    assert data["items"][0]["auto_dependency"] is True
    assert 'TYPE "UDT_Motor"' in data["source"]
    assert 'DATA_BLOCK "DB_Motors"' in data["source"]
    assert 'UDT_Valve' not in data["source"]
    assert 'DB_Valves' not in data["source"]
    plan = preflight(payload)
    assert plan.status_code == 200, plan.text
    assert plan.json()["will_create"] == ["UDT_Motor", "DB_Motors"]
    assert plan.json()["auto_dependencies"] == ["UDT_Motor"]


def test_single_checked_db_uses_existing_matching_udt_without_reimport(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_UDT||UDT_Motor|PlcType|True"]
    ))
    payload = add_structures(request_data())
    payload["selected_udts"] = []
    payload["selected_dbs"] = ["DB_Motors"]
    plan = preflight(payload)
    assert plan.status_code == 200, plan.text
    data = plan.json()
    assert data["will_create"] == ["DB_Motors"]
    assert data["auto_dependencies"] == []
    assert data["counts"]["blocked"] == 0
    assert 'of "UDT_Motor"' in data["items"][0]["source"]


def test_single_db_blocks_if_required_existing_udt_differs(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_UDT||UDT_Motor|PlcType|True"],
        xml={"UDT_Motor": '<Document><Section Name="Static">'
                          '<Member Name="Unexpected" Datatype="Int"/>'
                          '</Section></Document>'},
    ))
    payload = add_structures(request_data())
    payload["selected_udts"] = []
    payload["selected_dbs"] = ["DB_Motors"]
    plan = preflight(payload)
    assert plan.status_code == 200, plan.text
    data = plan.json()
    assert data["counts"]["blocked"] == 1
    assert data["can_apply"] is False
    assert data["will_create"] == []
    assert "unchecked UDT not verified" in data["items"][0]["reason"]



def test_empty_and_unknown_selection_are_rejected_before_tia(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = request_data()
    payload["selected_udts"] = []
    payload["selected_dbs"] = []
    assert preflight(payload).status_code == 422
    payload["selected_udts"] = ["DOES_NOT_EXIST"]
    assert preflight(payload).status_code == 422
    assert not calls


def test_selection_changes_invalidate_apply_token(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls))
    payload = add_structures(request_data())
    payload["selected_udts"] = ["UDT_Valve"]
    payload["selected_dbs"] = []
    plan = preflight(payload).json()
    modified = {**payload, "selected_udts": ["UDT_Motor"]}
    assert apply(modified, plan).status_code == 409
    assert not any(c[0] == "import-plc-structure-batch" for c in calls)
