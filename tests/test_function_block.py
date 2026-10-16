import pytest
from pydantic import ValidationError

from engine.function_block import FunctionBlockSpecification
from engine.project import ProjectSpecification
from engine.instance_db import InstanceDbSpecification, instance_db_preview
from engine.plc_db import DataBlockSpecification
from engine.udt import UdtSpecification
from functions.tia_source_generator import generate_fb_source
from functions.tia_source_generator import generate_project_source


def test_function_block_has_independent_sections_and_serializes():
    fb = FunctionBlockSpecification.model_validate({"name": "FB_Motor", "static": {"name": "Static", "members": [{"name": "Run", "data_type": "Bool", "retain": True}]}})
    assert fb.static.members[0].retain is True
    assert fb.input.members == []


def test_function_block_rejects_retain_outside_static():
    with pytest.raises(ValidationError, match="only for Static"):
        FunctionBlockSpecification.model_validate({"name": "FB_X", "input": {"name": "Input", "members": [{"name": "Enable", "data_type": "Bool", "retain": True}]}})


def test_function_block_rejects_name_collision_between_sections():
    with pytest.raises(ValidationError, match="both Input and Output"):
        FunctionBlockSpecification.model_validate({"name":"FB_X", "input":{"name":"Input","members":[{"name":"State","data_type":"Bool"}]}, "output":{"name":"Output","members":[{"name":"State","data_type":"Bool"}]}})


def test_project_rejects_circular_fb_multi_instance_dependency():
    with pytest.raises(ValidationError, match="Circular Function Block"):
        ProjectSpecification.model_validate({"fbs":[
            {"name":"FB_A", "source_mode":"tia_read_only", "source_xml":"<FB/>",
             "static":{"name":"Static","members":[{"name":"B","data_type":"FB_B"}]}},
            {"name":"FB_B", "source_mode":"tia_read_only", "source_xml":"<FB/>",
             "static":{"name":"Static","members":[{"name":"A","data_type":"FB_A"}]}},
        ]})


def test_instance_db_preview_is_derived_from_its_function_block():
    fb = FunctionBlockSpecification.model_validate({"name":"FB_Motor", "static":{"name":"Static","members":[{"name":"Running","data_type":"Bool"}]}})
    preview = instance_db_preview(InstanceDbSpecification(name="DB_Motor", function_block="FB_Motor"), fb)
    assert preview["sections"][0]["members"][0]["name"] == "Running"


def test_fb_source_generation_is_disabled_for_the_read_only_analyzer():
    fb = FunctionBlockSpecification.model_validate({"name":"FB_Motor", "input":{"name":"Input","members":[{"name":"Enable","data_type":"Bool"}]}, "static":{"name":"Static","members":[{"name":"State","data_type":"Int"}]}})
    with pytest.raises(ValueError, match="source generation is disabled"):
        generate_fb_source(fb.name, fb, {})


def test_project_source_excludes_function_blocks_and_keeps_udt_db_generation_available():
    project = ProjectSpecification.model_validate({"fbs":[{"name":"FB_Run", "input":{"name":"Input","members":[{"name":"Enable","data_type":"Bool"}]}}]})
    assert "FUNCTION_BLOCK" not in generate_project_source(project)


def test_static_fb_accepts_registered_system_instance_only():
    fb = FunctionBlockSpecification.model_validate({
        "name": "FB_Timer",
        "static": {"name": "Static", "members": [{
            "name": "Delay", "data_type": "TON_TIME", "system_instance": True,
        }]},
    })
    assert fb.static.members[0].system_instance is True
    with pytest.raises(ValidationError, match="Static FB"):
        FunctionBlockSpecification.model_validate({
            "name": "FB_Invalid", "input": {"name": "Input", "members": [{
                "name": "Delay", "data_type": "TON_TIME", "system_instance": True,
            }]},
        })


def test_system_instance_stays_blocked_for_udt_and_global_db():
    payload = {"name": "Delay", "data_type": "TON_TIME", "system_instance": True}
    with pytest.raises(ValidationError, match="Static FB"):
        UdtSpecification.model_validate({"name": "UDT_Bad", "fields": [payload]})
    with pytest.raises(ValidationError, match="Static FB"):
        DataBlockSpecification.model_validate({"name": "DB_Bad", "members": [payload]})


def test_lad_snapshot_preserves_source_and_cannot_generate_scl():
    fb = FunctionBlockSpecification.model_validate({
        "name": "FB_LadMotor", "number": 18, "language": "LAD",
        "source_mode": "tia_read_only", "source_xml": "<SW.Blocks.FB><CompileUnit/></SW.Blocks.FB>",
        "static": {"name": "Static", "members": [{"name": "Delay", "data_type": "TON_TIME", "system_instance": True}]},
    })
    assert fb.source_mode == "tia_read_only"
    with pytest.raises(ValueError, match="source generation is disabled"):
        generate_fb_source(fb.name, fb, {})


def test_unverified_tia_interface_cannot_be_used_as_multi_instance():
    with pytest.raises(ValidationError, match="not a verified TIA snapshot"):
        ProjectSpecification.model_validate({"fbs": [
            {"name": "FB_Lad", "language": "LAD", "source_mode": "tia_read_only",
             "source_xml": "<FB/>", "interface_verified": False,
             "unverified_reasons": ["Static declaration unavailable"]},
            {"name": "FB_Consumer", "static": {"name": "Static", "members": [
                {"name": "Legacy", "data_type": "FB_Lad"},
            ]}},
        ]})


def test_fbd_snapshot_preserves_original_source_for_read_only_analysis():
    fb = FunctionBlockSpecification.model_validate({
        "name": "FB_Fbd", "language": "FBD", "number": 31,
        "source_mode": "tia_read_only", "source_xml": "<SW.Blocks.FB><CompileUnit/></SW.Blocks.FB>",
    })
    assert fb.language == "FBD"


def test_new_local_fb_accepts_parameter_declarations_without_source_xml():
    from fastapi.testclient import TestClient
    from engine.main import app
    payload = {
        "name": "FB_LocalMotor", "language": "LAD", "number": 31,
        "source_mode": "local", "created_locally": True,
        "interface_verified": False,
        "input": {"name": "Input", "members": [{"name": "Enable", "data_type": "Bool"}]},
        "output": {"name": "Output", "members": [{"name": "Ready", "data_type": "Bool"}]},
        "static": {"name": "Static", "members": [
            {"name": "TON_Motor", "data_type": "TON_TIME", "system_instance": True},
        ]},
    }
    response = TestClient(app).post("/api/v1/local-function-block-declarations", json=payload)
    assert response.status_code == 200, response.text
    fb = FunctionBlockSpecification.model_validate(response.json())
    assert fb.input.members[0].name == "Enable"
    assert fb.static.members[0].system_instance
    assert fb.source_xml is None
    assert fb.created_locally
    with pytest.raises(ValueError, match="source generation is disabled"):
        generate_fb_source(fb.name, fb, {})


@pytest.mark.parametrize("override", [
    {"interface_verified": True},
    {"source_xml": "<SW.Blocks.FB/>"},
    {"source_mode": "tia_read_only"},
    {"name": "FB invalid name"},
])
def test_locally_created_fb_cannot_claim_tia_verification_or_source(override):
    payload = {
        "name": "FB_Draft", "source_mode": "local", "created_locally": True,
        "interface_verified": False, **override,
    }
    with pytest.raises(ValidationError):
        FunctionBlockSpecification.model_validate(payload)


def test_new_fb_endpoint_does_not_accept_legacy_or_imported_fb():
    from fastapi.testclient import TestClient
    from engine.main import app
    client = TestClient(app)
    assert client.post("/api/v1/local-function-block-declarations", json={
        "name": "FB_Legacy", "source_mode": "local"
    }).status_code == 422
    assert client.post("/api/v1/function-block-specifications", json={
        "name": "FB_New", "source_mode": "local", "created_locally": True,
        "interface_verified": False,
    }).status_code == 422
