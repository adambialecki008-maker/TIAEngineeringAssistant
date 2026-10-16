"""Normalize localized ladder-language metadata without losing read-only XML."""
from engine.function_block import FunctionBlockSpecification
from engine.function import FunctionSpecification
from engine.tia.program import _display_program_language


def test_tia_language_adapter_displays_ladder_as_lad():
    assert _display_program_language("KOP") == "LAD"
    assert _display_program_language("lad") == "lad"
    assert _display_program_language("FBD") == "FBD"


def test_function_block_alias_is_normalized_without_touching_original_xml():
    original = "<SW.Blocks.FB><CompileUnit/></SW.Blocks.FB>"
    fb = FunctionBlockSpecification.model_validate({
        "name": "FB_Original", "language": "KOP",
        "source_mode": "tia_read_only", "source_xml": original,
    })
    assert fb.language == "LAD"
    assert fb.source_xml == original


def test_function_alias_is_normalized_without_touching_original_xml():
    original = "<SW.Blocks.FC><CompileUnit/></SW.Blocks.FC>"
    fc = FunctionSpecification.model_validate({
        "name": "FC_Original", "language": "KOP",
        "source_mode": "tia_read_only", "source_xml": original,
    })
    assert fc.language == "LAD"
    assert fc.source_xml == original
