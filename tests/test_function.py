import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from engine.function import FunctionSpecification
from engine.project import ProjectSpecification
from engine.main import app


def tia_fc_payload(**overrides):
    payload = {
        "name": "FC_Compute", "number": 7, "language": "FBD",
        "source_mode": "tia_read_only", "source_xml": "<SW.Blocks.FC><CompileUnit/></SW.Blocks.FC>",
    }
    payload.update(overrides)
    return payload


def test_fc_keeps_supported_interface_sections_and_language():
    fc = FunctionSpecification.model_validate(tia_fc_payload(
        input={"name": "Input", "members": [{"name": "Delay", "data_type": "TIME", "start_value": "T#1s"}]},
        temp={"name": "Temp", "members": [{"name": "Scratch", "data_type": "Int"}]},
    ))
    assert fc.language == "FBD"
    assert fc.input.members[0].start_value == "T#1s"


def test_fc_rejects_static_and_system_instances():
    with pytest.raises(ValidationError, match="System instances"):
        FunctionSpecification.model_validate(tia_fc_payload(
            temp={"name": "Temp", "members": [{"name": "Timer", "data_type": "TON_TIME", "system_instance": True}]},
        ))
    with pytest.raises(ValidationError, match="System instances"):
        FunctionSpecification.model_validate(tia_fc_payload(
            temp={"name": "Temp", "members": [{
                "name": "Nested", "data_type": "Struct", "struct_members": [
                    {"name": "Timer", "data_type": "TON_TIME", "system_instance": True},
                ],
            }]},
        ))


def test_instance_db_cannot_target_fc_and_program_block_names_do_not_collide():
    with pytest.raises(ValidationError, match="names must be unique across"):
        ProjectSpecification.model_validate({
            "fbs": [{"name": "Control", "source_mode": "tia_read_only", "source_xml": "<FB/>"}],
            "fcs": [{"name": "Control", "source_mode": "tia_read_only", "source_xml": "<FC/>"}],
        })


def test_fc_cannot_reference_an_fb_and_fb_multi_instance_must_be_static():
    fb = {"name": "FB_Motor", "source_mode": "tia_read_only", "source_xml": "<FB/>"}
    with pytest.raises(ValidationError, match="Functions cannot declare"):
        ProjectSpecification.model_validate({
            "fbs": [fb],
            "fcs": [tia_fc_payload(input={"name": "Input", "members": [{"name": "Motor", "data_type": "FB_Motor"}]})],
        })
    with pytest.raises(ValidationError, match="only as Static"):
        ProjectSpecification.model_validate({
            "fbs": [fb, {"name": "FB_Line", "source_mode": "tia_read_only", "source_xml": "<FB/>",
                      "input": {"name": "Input", "members": [{"name": "Motor", "data_type": "FB_Motor"}]}}],
        })
    with pytest.raises(ValidationError, match="unknown Function Block"):
        ProjectSpecification.model_validate({
            "fcs": [tia_fc_payload()],
            "instance_dbs": [{"name": "DB_Compute", "function_block": "FC_Compute"}],
        })


def test_fc_snapshot_endpoint_requires_tia_source_mode():
    client = TestClient(app)
    assert client.post("/api/v1/function-specifications", json=tia_fc_payload()).status_code == 200
    response = client.post("/api/v1/function-specifications", json={"name": "FC_Local"})
    assert response.status_code == 422
    assert "read-only TIA snapshots" in response.text


def test_new_local_fc_accepts_parameters_without_code_or_tia_write():
    payload = {
        "name": "FC_ComputeNew", "number": 12, "language": "FBD",
        "source_mode": "local", "created_locally": True, "interface_verified": False,
        "input": {"name": "Input", "members": [{"name": "InputA", "data_type": "Int"}]},
        "temp": {"name": "Temp", "members": [{"name": "Temporary", "data_type": "Bool"}]},
    }
    response = TestClient(app).post("/api/v1/local-function-declarations", json=payload)
    assert response.status_code == 200, response.text
    fc = FunctionSpecification.model_validate(response.json())
    assert fc.input.members[0].name == "InputA"
    assert fc.source_xml is None and fc.created_locally
    assert fc.temp.members[0].name == "Temporary"
    assert not hasattr(fc, "static")


@pytest.mark.parametrize("override", [
    {"interface_verified": True},
    {"source_xml": "<FC/>"},
    {"source_mode": "tia_read_only"},
    {"name": "Invalid FC"},
])
def test_new_local_fc_cannot_claim_tia_source_or_verification(override):
    payload = {"name": "FC_Local", "source_mode": "local", "created_locally": True,
               "interface_verified": False, **override}
    with pytest.raises(ValidationError):
        FunctionSpecification.model_validate(payload)


def test_local_fc_rejects_iec_instance_and_remains_distinct_from_snapshot_import():
    payload = {"name": "FC_Counter", "source_mode": "local",
               "created_locally": True, "interface_verified": False,
               "temp": {"name": "Temp", "members": [{
                   "name": "Timer", "data_type": "TON_TIME", "system_instance": True,
               }]}}
    assert TestClient(app).post("/api/v1/local-function-declarations", json=payload).status_code == 422
    assert TestClient(app).post("/api/v1/function-specifications", json={
        "name": "FC_Local", "source_mode": "local", "created_locally": True,
        "interface_verified": False,
    }).status_code == 422
