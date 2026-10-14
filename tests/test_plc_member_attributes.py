"""Typed PLC variable start values and HMI attributes in generated V21 sources."""
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from engine.main import app
from engine.project import ProjectSpecification
from engine.tia_member import TiaMember
from engine.tia.source_import import _source_files
from functions.tia_source_generator import generate_project_source


def spec(*, retain=False, start="TRUE", visible=False, accessible=True, writable=False):
    return ProjectSpecification.model_validate({
        "plc_family": "S7-1500",
        "udts": [{
            "name": "UDT_Motor",
            "fields": [{
                "name": "Cmd", "data_type": "Struct",
                "struct_members": [{
                    "name": "Start", "data_type": "Bool",
                    "start_value": start,
                    "hmi_visible": visible,
                    "hmi_accessible": accessible,
                    "hmi_writable": writable,
                }, {
                    "name": "Speed", "data_type": "Real",
                    "start_value": "12.5",
                }, {
                    "name": "Count", "data_type": "Int",
                    "start_value": "-10",
                }],
            }],
        }],
        "dbs": [{
            "name": "DB_Motors",
            "retain": retain,
            "members": [{
                "name": "Motors", "data_type": "Array",
                "array_element_type": "UDT_Motor",
                "array_lower_bound": 1, "array_upper_bound": 10,
            }],
        }],
    })


def test_generated_udt_has_member_access_and_typed_initial_values():
    source = generate_project_source(spec())
    assert "Start { EXTERNALVISIBLE := 'FALSE'; " in source
    assert "EXTERNALACCESSIBLE := 'TRUE'" in source
    assert "EXTERNALWRITABLE := 'FALSE' } : Bool := TRUE;" in source
    assert "Speed : Real := 12.5;" in source
    assert "Count : Int := -10;" in source
    assert "NON_RETAIN" in source
    assert 'Motors : Array[1..10] of "UDT_Motor";' in source


def test_guarded_import_uses_same_member_attributes_and_db_retain():
    project = spec(retain=True)
    udt, db, udt_source, db_source = _source_files(project)
    assert (udt, db) == ("UDT_Motor", "DB_Motors")
    assert "EXTERNALVISIBLE" in udt_source
    assert " := TRUE;" in udt_source
    assert "\nRETAIN\nVAR\n" in db_source
    assert "NON_RETAIN" not in db_source


def test_unspecified_options_keep_previous_source_format():
    project = ProjectSpecification.model_validate({
        "plc_family": "S7-1500",
        "udts": [{
            "name": "Motor",
            "fields": [{"name": "Start", "data_type": "Bool"}],
        }],
        "dbs": [{
            "name": "DB_Motors",
            "members": [{"name": "Flag", "data_type": "Bool"}],
        }],
    })
    source = generate_project_source(project)
    assert "Start : Bool;" in source
    assert "Flag : Bool;" in source
    assert "EXTERNAL" not in source
    assert "NON_RETAIN" in source
    assert " := " not in source.replace("{ S7_Optimized_Access := 'TRUE' }", "")


@pytest.mark.parametrize("data_type, value", [
    ("Bool", "YES"), ("Int", "65536"), ("USInt", "-1"),
    ("DInt", "3.5"), ("Real", "1;DeleteDB"), ("Real", "NaN"),
    ("Real", "1e9999"), ("Array", "TRUE"), ("Time", "T#10S"),
])
def test_reject_invalid_or_unsupported_initial_values(data_type, value):
    payload = {
        "name": "Field", "data_type": data_type,
        "start_value": value,
    }
    if data_type == "Array":
        payload.update(
            array_element_type="Bool",
            array_lower_bound=0, array_upper_bound=9,
        )
    with pytest.raises(ValidationError):
        TiaMember.model_validate(payload)


def test_start_value_validation_preserves_narrow_numeric_ranges():
    assert TiaMember(name="Counter", data_type="UInt",
                     start_value="65535").start_value == "65535"
    assert TiaMember(name="Temp", data_type="Real",
                     start_value="-0.25").start_value == "-0.25"
    assert TiaMember(name="State", data_type="Bool",
                     start_value="false").start_value == "false"


def test_preview_api_preserves_explicit_attributes():
    client = TestClient(app)
    response = client.post(
        "/api/v1/project-source", json=spec(retain=True).model_dump()
    )
    assert response.status_code == 200, response.text
    source = response.json()["source"]
    assert "EXTERNALACCESSIBLE := 'TRUE'" in source
    assert "Speed : Real := 12.5;" in source
    assert "\nRETAIN\n" in source


def test_no_unsafe_scl_injection_in_preview():
    client = TestClient(app)
    bad = spec().model_dump()
    bad["udts"][0]["fields"][0]["struct_members"][0]["start_value"] = "FALSE;END_TYPE"
    response = client.post("/api/v1/project-source", json=bad)
    assert response.status_code == 422
