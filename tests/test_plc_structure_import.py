"""Read-only multi-structure preflight and guarded create-only import."""
from pathlib import Path

import pytest

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
            ] + [f"STRUCTURE_COMPILED|DB|{name}"
                 for kind, name, _ in rows if kind == "DB" and name != without_confirm]
                + ["PROJECT_SAVED|Test_Project_Copy"])
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
        "create": 2, "identical": 0, "compatible": 0, "unknown": 0, "conflict": 0, "blocked": 0
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
        "create": 1, "identical": 0, "compatible": 1, "unknown": 0, "conflict": 0, "blocked": 0
    }
    assert data["will_create"] == ["DB_Motors"]
    applied = apply(payload, data)
    assert applied.status_code == 200, applied.text
    assert applied.json()["created"] == ["DB_Motors"]
    assert applied.json()["reused_udts"] == ["UDT_Motor"]
    assert applied.json()["skipped_identical"] == []


def test_all_identical_means_no_import(monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=[
            "PLC_UDT||UDT_Motor|PlcType|True",
            "PLC_DB||DB_Motors|1|GlobalDB|True",
        ]
    ))
    data = preflight(request_data()).json()
    assert data["counts"]["identical"] == 1
    assert data["counts"]["compatible"] == 1
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
        "create": 0, "identical": 0, "compatible": 0, "unknown": 0, "conflict": 1, "blocked": 1
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


def test_unknown_nonstructural_metadata_is_reported_and_udt_reused(
        monkeypatch):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_UDT||UDT_Motor|PlcType|True"]
    ))
    payload = request_data()
    payload["project"]["udts"][0]["fields"][0]["struct_members"][0][
        "hmi_accessible"] = True
    data = preflight(payload).json()
    assert data["counts"]["conflict"] == 0
    assert data["items"][0]["status"] == "compatible"
    assert "hmi_accessible not available/explicit" in " ".join(
        data["items"][0]["metadata_warnings"])
    assert data["will_create"] == ["DB_Motors"]
    assert any(c[0] == "export-structure" for c in calls)


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
        "create": 1, "identical": 0, "compatible": 0, "unknown": 0, "conflict": 0, "blocked": 0
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
        "create": 2, "identical": 0, "compatible": 0, "unknown": 0, "conflict": 1, "blocked": 1
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
    assert 'of "UDT_Motor"' in next(x["source"] for x in data["items"] if x["kind"] == "db")


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
    assert "Member cmd: required declaration missing" in next(
        x["reason"] for x in data["items"] if x["kind"] == "db")



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


@pytest.mark.parametrize("checked_udt", [True, False])
def test_motor_metadata_does_not_block_db_or_reimport_type(monkeypatch, checked_udt):
    calls, imported = [], []
    xml = {"UDT_Motor": '''<Document><Section Name="Static">
      <Member Name="Cmd" Datatype="Struct"><Sections><Section Name="None">
        <Member Name="Start" Datatype="Bool" Remanence="Retain">
          <AttributeList><BooleanAttribute Name="ExternalAccessible">true</BooleanAttribute></AttributeList>
          <StartValue>true</StartValue><Comment><Text>Existing motor command</Text></Comment>
        </Member><Member Name="Stop" Datatype="Bool"/>
      </Section></Sections></Member></Section></Document>'''}
    adapter = mock_adapter(calls, existing=["PLC_UDT|Types|UDT_Motor|PlcType|True"], xml=xml)

    def capture(*args):
        if args[0] == "import-plc-structure-batch":
            imported.extend(Path(args[5]).read_text("utf-8").splitlines())
        return adapter(*args)

    monkeypatch.setattr(facade, "_run_adapter", capture)
    payload = add_structures(request_data())
    payload["project"]["udts"][0]["fields"][0]["struct_members"][0].update(
        comment="Required command", start_value="false", hmi_accessible=True)
    payload["selected_udts"] = ["UDT_Motor"] if checked_udt else []
    payload["selected_dbs"] = ["DB_Motors"]
    report = preflight(payload).json()
    udt = next(x for x in report["items"] if x["name"] == "UDT_Motor")
    assert udt["status"] == "compatible"
    assert "start_value differs" in " ".join(udt["metadata_warnings"])
    assert report["counts"]["conflict"] == report["counts"]["blocked"] == 0
    assert report["will_create"] == ["DB_Motors"]
    assert apply(payload, report).status_code == 200
    assert len(imported) == 1 and imported[0].startswith("DB|DB_Motors|")
    write_call = next(c for c in calls if c[0] == "import-plc-structure-batch")
    assert write_call[1:4] == ("3544", "Device_1", "PLC_1")
    assert "DB_Valves" not in " ".join(imported)


@pytest.mark.parametrize("actual_type", ["Int", "Array[0..10] of Bool", '"UDT_Other"'])
def test_incompatible_member_type_has_exact_diagnostic(monkeypatch, actual_type):
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls,
        existing=["PLC_UDT||UDT_Motor|PlcType|True"],
        xml={"UDT_Motor": '<Document><Section Name="Static">'
             '<Member Name="Cmd" Datatype="Struct">'
             '<Member Name="Start" Datatype="' + actual_type.replace('"', '&quot;')
             + '"/><Member Name="Stop" Datatype="Bool"/>'
             '</Member></Section></Document>'}))
    report = preflight(request_data()).json()
    assert report["items"][0]["status"] == "conflict"
    assert "cmd.start: required type bool; TIA type" in report["items"][0]["reason"]
    assert report["items"][1]["status"] == "blocked"
    assert not report["will_create"]


def test_nested_existing_udt_array_expansions_are_not_extra_declarations(monkeypatch):
    payload = request_data()
    payload["project"]["udts"] = [
        {"name": "UDT_Outer", "fields": [{"name": "Items", "data_type": "Array",
            "array_element_type": "UDT_Inner", "array_lower_bound": 1, "array_upper_bound": 10}]},
        {"name": "UDT_Inner", "fields": [{"name": "Value", "data_type": "Bool"}]},
    ]
    payload["project"]["dbs"][0]["members"] = [{"name": "Data", "data_type": "UDT_Outer"}]
    payload["selected_udts"], payload["selected_dbs"] = [], ["DB_Motors"]
    outer = '''<Document><Section Name="Static"><Member Name="Items" Datatype='Array[1..10] of "UDT_Inner"'>
      <Sections><Section Name="None"><Member Name="Value" Datatype="Bool" Informative="true">
        <Subelement Path="[1]"><StartValue>true</StartValue></Subelement>
      </Member></Section></Sections></Member></Section></Document>'''
    inner = '<Document><Section Name="Static"><Member Name="Value" Datatype="Bool"/></Section></Document>'
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls,
        existing=["PLC_UDT||UDT_Outer|PlcType|True", "PLC_UDT||UDT_Inner|PlcType|True"],
        xml={"UDT_Outer": outer, "UDT_Inner": inner}))
    report = preflight(payload).json()
    assert report["will_create"] == ["DB_Motors"]
    assert report["counts"]["compatible"] == 2
    # A compatible parent must not hide a changed referenced child.
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls,
        existing=["PLC_UDT||UDT_Outer|PlcType|True", "PLC_UDT||UDT_Inner|PlcType|True"],
        xml={"UDT_Outer": outer, "UDT_Inner": inner.replace('Datatype="Bool"', 'Datatype="Int"')}))
    changed = preflight(payload).json()
    assert not changed["can_apply"]
    assert changed["counts"]["conflict"] == 1
    assert next(x for x in changed["items"] if x["name"] == "UDT_Outer")["status"] == "blocked"


def test_unavailable_structure_is_unknown_and_independent_db_is_eligible(monkeypatch):
    calls = []
    adapter = mock_adapter(calls, existing=["PLC_UDT||UDT_Motor|PlcType|True"],
        xml={"UDT_Motor": '<Document><ProtectedType/></Document>'})
    monkeypatch.setattr(facade, "_run_adapter", adapter)
    report = preflight(add_structures(request_data())).json()
    assert report["counts"]["unknown"] == 1
    assert report["counts"]["conflict"] == 0
    assert report["will_create"] == ["UDT_Valve", "DB_Valves"]
    assert "No member declarations" in report["items"][0]["reason"]


def test_reused_udt_change_invalidates_apply_token(monkeypatch):
    calls = []
    payload = request_data()
    payload["selected_udts"], payload["selected_dbs"] = [], ["DB_Motors"]
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls,
        existing=["PLC_UDT||UDT_Motor|PlcType|True"]))
    report = preflight(payload).json()
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls,
        existing=["PLC_UDT||UDT_Motor|PlcType|True"],
        xml={"UDT_Motor": '<Document><Section Name="Static"><Member Name="Wrong" Datatype="Bool"/></Section></Document>'}))
    assert apply(payload, report).status_code == 409
    assert not any(c[0] == "import-plc-structure-batch" for c in calls)


def test_created_db_requires_compiler_confirmation(monkeypatch):
    calls = []
    adapter = mock_adapter(calls)
    monkeypatch.setattr(facade, "_run_adapter", lambda *args: [
        line for line in adapter(*args) if not line.startswith("STRUCTURE_COMPILED|")])
    payload = request_data()
    report = preflight(payload).json()
    response = apply(payload, report)
    assert response.status_code == 502
    assert "Missing TIA DB compilation confirmation" in response.json()["detail"]


def test_existing_db_with_unknown_metadata_is_never_in_manifest(monkeypatch):
    calls, imported = [], []
    adapter = mock_adapter(calls, existing=["PLC_DB||DB_Motors|1|GlobalDB|True"])
    def capture(*args):
        if args[0] == "import-plc-structure-batch":
            imported.extend(Path(args[5]).read_text("utf-8").splitlines())
        return adapter(*args)
    monkeypatch.setattr(facade, "_run_adapter", capture)
    payload = add_structures(request_data())
    payload["project"]["dbs"][0]["retain"] = True
    report = preflight(payload).json()
    assert next(x for x in report["items"] if x["name"] == "DB_Motors")["status"] == "unknown"
    assert apply(payload, report).status_code == 200
    assert not any(row.startswith("DB|DB_Motors|") for row in imported)


@pytest.mark.parametrize("member", [
    '<Member Name="Cmd"/>',
    '<Member Name="Cmd" Datatype="Struct"><AttributeList><StringAttribute Name="At">Shared</StringAttribute></AttributeList></Member>',
])
def test_unverifiable_structural_property_stays_blocked(monkeypatch, member):
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter([],
        existing=["PLC_UDT||UDT_Motor|PlcType|True"],
        xml={"UDT_Motor": '<Document><Section Name="Static">' + member + '</Section></Document>'}))
    report = preflight(request_data()).json()
    assert report["counts"]["unknown"] == 1
    assert report["counts"]["conflict"] == 0
    assert report["counts"]["blocked"] == 1
    assert not report["can_apply"]
    assert "Manual TIA structure review required" in report["items"][0]["reason"]


@pytest.mark.parametrize("array_type", ["Array[1..2] of String[20]", "Array[1..2, -1..1] of WString[10]"])
def test_live_builtin_array_is_not_misclassified_as_udt_dependency(monkeypatch, array_type):
    payload = request_data()
    payload["project"]["udts"] = []
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls,
        existing=["PLC_UDT||UDT_Motor|PlcType|True"],
        xml={"UDT_Motor": '<Document><Section Name="Static"><Member Name="Labels" Datatype="'
             + array_type + '"/></Section></Document>'}))
    report = preflight(payload).json()
    assert report["will_create"] == ["DB_Motors"]
    assert report["counts"]["compatible"] == 1 and report["counts"]["blocked"] == 0


def test_live_multidimensional_array_resolves_nested_udt(monkeypatch):
    payload = request_data()
    payload["project"]["udts"] = []
    calls = []
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(calls,
        existing=["PLC_UDT||UDT_Motor|PlcType|True", "PLC_UDT||UDT_Inner|PlcType|True"],
        xml={"UDT_Motor": '<Document><Section Name="Static"><Member Name="Items" '
             'Datatype="Array[1..2, -1..1] of &quot;UDT_Inner&quot;"/></Section></Document>',
             "UDT_Inner": '<Document><Section Name="Static"><Member Name="Value" Datatype="Bool"/></Section></Document>'}))
    report = preflight(payload).json()
    assert report["will_create"] == ["DB_Motors"]
    assert report["counts"]["compatible"] == 2
    assert {c[6] for c in calls if c[0] == "export-structure"} == {"UDT_Motor", "UDT_Inner"}


def test_retain_db_with_confirmed_tia_remanence_is_identical_skip(monkeypatch):
    """An explicit RETAIN match must not be permanently classified unknown."""
    calls = []
    xml = {
        "DB_Motors": (
            '<Document><Section Name="Static"><Member Name="Motors" '
            'Datatype="Array[1..10] of UDT_Motor" Remanence="Retain"/>'
            '</Section></Document>'
        )
    }
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=[
            "PLC_UDT||UDT_Motor|PlcType|True",
            "PLC_DB||DB_Motors|1|GlobalDB|True",
        ], xml=xml
    ))
    payload = request_data()
    payload["project"]["dbs"][0]["retain"] = True
    plan_response = preflight(payload)
    assert plan_response.status_code == 200, plan_response.text
    plan = plan_response.json()
    db = next(item for item in plan["items"] if item["name"] == "DB_Motors")
    assert db["status"] == "identical"
    assert "explicit RETAIN confirmed" in db["reason"]
    assert plan["counts"]["identical"] == 1
    assert plan["will_create"] == []
    assert apply(payload, plan).status_code == 409
    assert not any(call[0] == "import-plc-structure-batch" for call in calls)


@pytest.mark.parametrize(("requested_retain", "xml_remanence", "expected"), [
    (True, "", "unknown"),         # XML omitted the attribute; cannot prove.
    (True, "NonRetain", "conflict"),
    (False, "Retain", "conflict"),
])
def test_db_retain_preflight_never_claims_identical_for_mismatch_or_unknown(
    monkeypatch, requested_retain, xml_remanence, expected
):
    calls = []
    retain_attribute = (' Remanence="' + xml_remanence + '"'
                        if xml_remanence else "")
    xml = {"DB_Motors": (
        '<Document><Section Name="Static"><Member Name="Motors" '
        'Datatype="Array[1..10] of UDT_Motor"' + retain_attribute
        + '/></Section></Document>'
    )}
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=[
            "PLC_UDT||UDT_Motor|PlcType|True",
            "PLC_DB||DB_Motors|1|GlobalDB|True",
        ], xml=xml
    ))
    payload = request_data()
    payload["project"]["dbs"][0]["retain"] = requested_retain
    report = preflight(payload).json()
    db = next(item for item in report["items"] if item["name"] == "DB_Motors")
    assert db["status"] == expected
    assert report["counts"]["identical"] == 0
    assert report["will_create"] == []
    assert apply(payload, report).status_code == 409
    assert not any(call[0] == "import-plc-structure-batch" for call in calls)


def test_nested_explicit_nonretain_stays_unknown_for_retained_db(monkeypatch):
    """A retained parent may not silently hide a nested remanence override."""
    calls = []
    xml = {"DB_Motors": (
        '<Document><Section Name="Static">'
        '<Member Name="Motor" Datatype="Struct" Remanence="Retain">'
        '<Member Name="Start" Datatype="Bool" Remanence="NonRetain"/>'
        '</Member></Section></Document>'
    )}
    monkeypatch.setattr(facade, "_run_adapter", mock_adapter(
        calls, existing=["PLC_DB||DB_Motors|1|GlobalDB|True"], xml=xml
    ))
    payload = request_data()
    payload["project"]["udts"] = []
    payload["project"]["dbs"][0] = {
        "name": "DB_Motors", "retain": True,
        "members": [{"name": "Motor", "data_type": "Struct",
                     "struct_members": [{"name": "Start", "data_type": "Bool"}]}]
    }
    report = preflight(payload).json()
    db = next(item for item in report["items"] if item["name"] == "DB_Motors")
    assert db["status"] == "unknown"
    assert "Nested DB members override RETAIN" in db["reason"]
    assert report["will_create"] == []
    assert not any(call[0] == "import-plc-structure-batch" for call in calls)
