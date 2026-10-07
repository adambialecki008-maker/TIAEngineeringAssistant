from engine.models import ScaleInput, ScaleOutput


def scale(data: ScaleInput) -> ScaleOutput:
    lower_raw_bound = min(data.raw_min, data.raw_max)
    upper_raw_bound = max(data.raw_min, data.raw_max)
    clamped_raw_value = max(lower_raw_bound, min(data.raw_value, upper_raw_bound))
    a = clamped_raw_value - data.raw_min
    b = data.raw_max - data.raw_min
    c = data.engineering_max - data.engineering_min
    result = a / b * c + data.engineering_min
    return ScaleOutput(scaled_value=result)
