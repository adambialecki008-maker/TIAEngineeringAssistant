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
        ProjectSpecification.model_validate({"fbs":[{"name":"FB_A","static":{"name":"Static","members":[{"name":"B","data_type":"FB_B"}]}},{"name":"FB_B","static":{"name":"Static","members":[{"name":"A","data_type":"FB_A"}]}}]})


def test_instance_db_preview_is_derived_from_its_function_block():
    fb = FunctionBlockSpecification.model_validate({"name":"FB_Motor", "static":{"name":"Static","members":[{"name":"Running","data_type":"Bool"}]}})
    preview = instance_db_preview(InstanceDbSpecification(name="DB_Motor", function_block="FB_Motor"), fb)
    assert preview["sections"][0]["members"][0]["name"] == "Running"


def test_fb_source_emits_safe_declaration_sections():
    fb = FunctionBlockSpecification.model_validate({"name":"FB_Motor", "input":{"name":"Input","members":[{"name":"Enable","data_type":"Bool"}]}, "static":{"name":"Static","members":[{"name":"State","data_type":"Int"}]}})
    source = generate_fb_source(fb.name, fb, {})
    assert "VAR_INPUT" in source and "Enable : Bool;" in source and "VAR" in source


def test_project_source_includes_safe_function_blocks():
    project = ProjectSpecification.model_validate({"fbs":[{"name":"FB_Run", "input":{"name":"Input","members":[{"name":"Enable","data_type":"Bool"}]}}]})
    assert 'FUNCTION_BLOCK "FB_Run"' in generate_project_source(project)


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
