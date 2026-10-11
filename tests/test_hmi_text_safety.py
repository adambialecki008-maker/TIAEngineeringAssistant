"""Safety guards for Siemens HMI project-text imports."""
import pytest
from fastapi import HTTPException

from engine.tia.hmi_text_safety import (
    needs_target_fill,
    validate_hmi_translation,
)


def test_only_missing_targets_are_eligible():
    assert needs_target_fill("(Hydrauliczna)", "Text")
    assert needs_target_fill("(Hydrauliczna)", "")
    assert not needs_target_fill("(Hydrauliczna)", "(Hydrauliczna)")
    assert not needs_target_fill("(Pneumatyczna)", "(Pneumatyczna)")
    assert not needs_target_fill("Text", "")
    assert not needs_target_fill("%", "Text")


@pytest.mark.parametrize("source,bad", [
    ("(Pneumatyczna)", "({Pneumatyczna})"),
    ("(Hydrauliczna)", "(Hydrauliczna"),
    ("212BP2 Za zaworem", "212BP3 Za zaworem"),
    ("Alarm {0}", "Alarm {1}"),
    ("X {tag}", "X {something}"),
])
def test_corrupted_hmi_label_is_rejected(source, bad):
    with pytest.raises(HTTPException) as err:
        validate_hmi_translation(source, bad)
    assert err.value.status_code == 502


def test_exact_polish_label_is_always_accepted():
    for text in (
        "(Hydrauliczna)",
        "(Pneumatyczna)",
        "212BP2 Za zaworem",
        "{Tag_1} Alarm",
    ):
        validate_hmi_translation(text, text)
