import pytest
from pydantic import ValidationError

from engine.tia.duration import (
    LTIME_MAX,
    TIME_MAX,
    duration_literal_from_quantity,
    normalize_duration_literal,
)
from engine.tia_member import TiaMember
from functions.tia_source_generator import generate_db_source


@pytest.mark.parametrize(("value", "data_type", "expected"), [
    ("t#1500MS", "Time", "T#1500ms"),
    ("T#2h_30m_15s", "Time", "T#2h_30m_15s"),
    ("LT#1500US", "LTime", "LT#1500us"),
    ("LT#-500ns", "LTime", "LT#-500ns"),
])
def test_normalize_duration_literal(value, data_type, expected):
    assert normalize_duration_literal(value, data_type) == expected


def test_duration_quantity_uses_exact_integer_units():
    assert duration_literal_from_quantity(90, "s", "Time") == "T#90s"
    assert duration_literal_from_quantity(-500, "ns", "LTime") == "LT#-500ns"


@pytest.mark.parametrize(("value", "data_type"), [
    ("T#1us", "Time"), ("T#1month", "Time"), ("T#1.5s", "Time"),
    ("LT#1s", "Time"), ("T#2147483648ms", "Time"),
    (f"LT#{LTIME_MAX + 1}ns", "LTime"),
])
def test_duration_rejects_unsupported_precision_and_overflow(value, data_type):
    with pytest.raises(ValueError):
        normalize_duration_literal(value, data_type)


def test_duration_values_are_normalized_by_pydantic_member_model():
    assert TiaMember(name="Delay", data_type="Time", start_value="T#500MS").start_value == "T#500ms"
    assert TiaMember(name="LongDelay", data_type="LTime", start_value="LT#5ns").start_value == "LT#5ns"
    with pytest.raises(ValidationError):
        TiaMember(name="Overflow", data_type="Time", start_value=f"T#{TIME_MAX + 1}ms")


def test_source_generation_preserves_validated_duration_literal():
    member = TiaMember(name="Delay", data_type="Time", start_value="T#2S")
    source = generate_db_source("DB_Delay", [member], {})
    assert "Delay : Time := T#2s;" in source
