import pytest
from pydantic import ValidationError

from engine.udt import UdtField, UdtSpecification


def test_udt_accepts_valid_specification() -> None:
    specification = UdtSpecification(
        name="UDT_TemperatureZone",
        fields=[
            UdtField(
                name="PV",
                data_type="Real",
                comment="Process value",
            ),
            UdtField(
                name="SP",
                data_type="Real",
                comment="Setpoint",
            ),
        ],
    )

    assert specification.name == "UDT_TemperatureZone"
    assert len(specification.fields) == 2
    assert specification.fields[0].name == "PV"


def test_udt_rejects_duplicate_field_names() -> None:
    with pytest.raises(ValidationError):
        UdtSpecification(
            name="UDT_Test",
            fields=[
                UdtField(
                    name="PV",
                    data_type="Real",
                ),
                UdtField(
                    name="pv",
                    data_type="Bool",
                ),
            ],
        )


def test_udt_rejects_empty_fields() -> None:
    with pytest.raises(ValidationError):
        UdtSpecification(
            name="UDT_Test",
            fields=[],
        )


def test_udt_rejects_empty_name() -> None:
    with pytest.raises(ValidationError):
        UdtSpecification(
            name="",
            fields=[
                UdtField(
                    name="PV",
                    data_type="Real",
                ),
            ],
        )
