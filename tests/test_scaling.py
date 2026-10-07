from engine.models import ScaleInput
from functions.scaling import scale
import pytest
from pydantic import ValidationError


def test_scale_half_range() -> None:
    data = ScaleInput(
        raw_value=13824,
        raw_min=0,
        raw_max=27648,
        engineering_min=0,
        engineering_max=100,
    )

    result = scale(data)

    assert result.scaled_value == 50.0


def test_scale_negative_engineering_range() -> None:
    data = ScaleInput(
        raw_value=27648,
        raw_min=0,
        raw_max=27648,
        engineering_min=-50,
        engineering_max=150,
    )

    result = scale(data)

    assert result.scaled_value == 150.0


def test_scale_rejects_equal_raw_limits() -> None:
    with pytest.raises(ValidationError):
        ScaleInput(
            raw_value=100,
            raw_min=0,
            raw_max=0,
            engineering_min=0,
            engineering_max=100,
        )


def test_scale_raw_value_respect_max_boundary():
    data = ScaleInput(
        raw_value=30000,
        raw_min=0,
        raw_max=27648,
        engineering_min=-50,
        engineering_max=150,
    )

    result = scale(data)
    assert result.scaled_value == data.engineering_max


def test_scale_raw_value_respect_min_boundary():
    data = ScaleInput(
        raw_value=-50,
        raw_min=0,
        raw_max=27648,
        engineering_min=-50,
        engineering_max=150,
    )

    result = scale(data)
    assert result.scaled_value == data.engineering_min


def test_scale_supports_reversed_raw_range():
    data = ScaleInput(
        raw_value=13824,
        raw_min=27648,
        raw_max=0,
        engineering_min=0,
        engineering_max=100,
    )

    result = scale(data)
    assert result.scaled_value == 50.0


def test_scale_reversed_range_respects_upper_raw_boundary():
    data = ScaleInput(
        raw_value=30000,
        raw_min=27648,
        raw_max=0,
        engineering_min=0,
        engineering_max=100,
    )

    result = scale(data)

    assert result.scaled_value == 0.0
