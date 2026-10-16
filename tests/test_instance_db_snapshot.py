from fastapi.testclient import TestClient

from engine.instance_db import InstanceDbSnapshot
from engine.main import app


def test_instance_db_snapshot_is_read_only_and_does_not_infer_owner():
    snapshot = InstanceDbSnapshot.model_validate({
        "name": "DB_Motor", "number": 20, "group_path": "Drive",
        "block_kind": "InstanceDB", "is_consistent": True,
    })
    assert snapshot.function_block is None
    assert snapshot.relationship_status == "unverified"


def test_instance_db_snapshot_endpoint_rejects_global_db_metadata():
    client = TestClient(app)
    accepted = client.post("/api/v1/instance-db-snapshots", json={
        "name": "DB_Motor", "number": 20, "block_kind": "InstanceDB",
        "is_consistent": True,
    })
    rejected = client.post("/api/v1/instance-db-snapshots", json={
        "name": "DB_Global", "number": 21, "block_kind": "GlobalDB",
        "is_consistent": True,
    })
    assert accepted.status_code == 200
    assert rejected.status_code == 422


def test_unverified_instance_db_inventory_does_not_break_udt_db_preflight_models():
    from engine.project import ProjectSpecification
    from engine.udt import UdtSpecification
    from engine.plc_db import DataBlockSpecification
    from functions.tia_source_generator import generate_project_source
    snapshot = InstanceDbSnapshot.model_validate({
        "name": "DB_ActualInstance", "number": 42, "group_path": "Groups",
        "block_kind": "InstanceDB", "is_consistent": True,
        "source_mode": "tia_read_only",
        "function_block": None, "relationship_status": "unverified",
    })
    project = ProjectSpecification.model_validate({
        "udts": [{"name": "UDT_Sensor", "fields": [
            {"name": "Enabled", "data_type": "Bool"}]}],
        "dbs": [{"name": "DB_Config", "members": [
            {"name": "Delay", "data_type": "Time", "start_value": "T#3s"}]}],
        "instance_dbs": [snapshot.model_dump()],
    })
    assert project.instance_dbs[0].relationship_status == "unverified"
    source = generate_project_source(project)
    assert "UDT_Sensor" in source
    assert "DB_Config" in source
    assert "DB_ActualInstance" not in source


def test_instance_db_accepts_direct_openness_metadata_but_not_guessed_owner():
    from pydantic import ValidationError
    reported = InstanceDbSnapshot.model_validate({
        "name": "DB_Motor", "block_kind": "InstanceDB",
        "function_block": "FB_Motor", "instance_of_type": "FB",
        "instance_of_number": 7, "relationship_status": "reported_by_openness",
    })
    assert reported.function_block == "FB_Motor"
    for invalid in (
        {"function_block": "FB_Guessed"},
        {"relationship_status": "reported_by_openness", "function_block": "FB_Motor"},
        {"relationship_status": "reported_by_openness", "function_block": "FB_Motor",
         "instance_of_type": "UDT", "instance_of_number": 7},
    ):
        try:
            InstanceDbSnapshot.model_validate({"name": "DB_Bad", **invalid})
        except ValidationError:
            pass
        else:
            raise AssertionError("Unverified or incomplete owner must be rejected")
