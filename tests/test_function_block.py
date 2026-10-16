import pytest
from pydantic import ValidationError

from engine.function_block import FunctionBlockSpecification


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
