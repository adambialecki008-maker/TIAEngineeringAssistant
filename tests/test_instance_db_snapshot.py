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
