from engine.models import ScaleInput
from functions.scaling import scale


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
