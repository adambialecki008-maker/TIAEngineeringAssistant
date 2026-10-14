"""Safety guards for Siemens HMI project-text imports."""
import pytest
from fastapi import HTTPException

from engine.tia.hmi_text_safety import (
    needs_target_fill,
    normalize_hmi_translation,
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


def test_corrupted_polish_proposal_shows_safe_recovery():
    source = "(Pneumatyczna)"
    with pytest.raises(HTTPException) as error:
        validate_hmi_translation(source, "({Pneumatyczna})")
    message = error.value.detail
    assert "BEFORE TIA import" in message
    assert "Automatic batch jobs skip" in message
    assert "Text handling" not in message
    assert repr(source) in message
    assert repr("({Pneumatyczna})") in message


def test_existing_polish_source_cannot_be_silently_corrupted():
    with pytest.raises(HTTPException):
        validate_hmi_translation("(Hydrauliczna)", "({Hydrauliczna})")


def test_numbered_polish_instruction_can_have_spelling_and_diacritics_corrected():
    """'1.Naciagnij' is prose after numbered-list marker, not a PLC tag."""
    source = (
        "1.Naciagnij linke \n"
        "do tej pozycji \n"
        "(koncowka w obrebie\n zielonego wskaznika)"
    )
    translated = (
        "1.Naciągnij linkę\n"
        "do tej pozycji\n"
        "(końcówka w obrębie\nzielonego wskaźnika)"
    )
    validate_hmi_translation(source, translated)


@pytest.mark.parametrize("bad", [
    "2.Naciągnij linkę",
    "1)Naciągnij linkę",
    "Naciągnij linkę",
])
def test_numbered_hmi_instruction_must_keep_step_prefix(bad):
    with pytest.raises(HTTPException) as error:
        validate_hmi_translation("1.Naciagnij linke", bad)
    assert "numbered instruction prefix" in error.value.detail


@pytest.mark.parametrize("source,translated", [
    ("212BP2 Za zaworem", "212BP3 Za zaworem"),
    ("M10.0 = GOTOWOSC", "M10.1 = GOTOWOSC"),
    ("DB1.DBX2.0 Czujnik", "DB1.DBX2.1 Czujnik"),
    ("I0.0 Czujnik", "I0.1 Czujnik"),
    ("QW128 Wyjscie", "QW129 Wyjście"),
    ("DB1.DBX2.0 i M10.0", "DB1.DBX2.0 i M10.1"),
])
def test_actual_plc_addresses_must_still_be_protected(source, translated):
    with pytest.raises(HTTPException) as error:
        validate_hmi_translation(source, translated)
    assert "HMI/PLC identifier" in error.value.detail


def test_numbered_steps_and_real_plc_addresses_can_coexist():
    validate_hmi_translation(
        "1.Sprawdz M10.0\n2.Nacisnij start",
        "1.Sprawdź M10.0\n2.Naciśnij start",
    )



@pytest.mark.parametrize("source,proposed,expected", [
    ("Awaria PLC", r"Awaria \nPLC", "Awaria PLC"),
    ("Awaria PLC", r"Awaria\n PLC", "Awaria PLC"),
    ("Awaria PLC", "Awaria PLC", "Awaria PLC"),
    ("Awaria\nPLC", r"Awaria\nPLC", "Awaria\nPLC"),
    (r"Awaria\nPLC", r"Awaria\nPLC", "Awaria\nPLC"),
    (r"Awaria \nhardware", r"Awaria \nhardware", "Awaria\nhardware"),
    ("Awaria\nPLC", "Awaria\nPLC", "Awaria\nPLC"),
    (r"Awaria\nPLC", "Awaria\nPLC", "Awaria\nPLC"),
])
def test_literal_ai_backslash_n_preserves_source_line_break_semantics(
    source, proposed, expected,
):
    normalized = normalize_hmi_translation(source, proposed)
    assert normalized == expected
    validate_hmi_translation(source, normalized)


def test_unprocessed_literal_backslash_n_cannot_reach_tia():
    with pytest.raises(HTTPException) as error:
        validate_hmi_translation("Awaria PLC", r"Awaria\nPLC")
    assert "literal" in str(error.value.detail)


@pytest.mark.parametrize("source,proposal", [
    ("(Pneumatyczna)", "({Pneumatyczna})"),
    ("(Hydrauliczna)", "({Hydrauliczna})"),
])
def test_generated_extra_braces_can_only_be_removed_when_source_is_recovered(
    source, proposal,
):
    normalized = normalize_hmi_translation(source, proposal)
    assert normalized == source
    validate_hmi_translation(source, normalized)


def test_legitimate_braced_identifiers_are_never_normalized_away():
    assert normalize_hmi_translation("{Tag_1} Alarm", "{Tag_1} Alarm") == (
        "{Tag_1} Alarm"
    )
    bad = "({Zmiana znaczenia})"
    assert normalize_hmi_translation("(Pneumatyczna)", bad) == bad
    with pytest.raises(HTTPException):
        validate_hmi_translation("(Pneumatyczna)", bad)
