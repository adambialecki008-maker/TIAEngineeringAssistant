from engine.models import ScaleInput, ScaleOutput


def scale(data: ScaleInput) -> ScaleOutput:
    a = data.raw_value - data.raw_min
    b = data.raw_max - data.raw_min
    c = data.engineering_max - data.engineering_min
    result = a / b * c + data.engineering_min
    return ScaleOutput(scaled_value=result)


test = ScaleInput(
    raw_value=13824,
    raw_min=0,
    raw_max=27648,
    engineering_min=0,
    engineering_max=100,
)
print(scale(test))
