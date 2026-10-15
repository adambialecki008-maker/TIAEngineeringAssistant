"""The browser and backend must use the same Siemens type definitions."""
import pytest

from engine.tia.type_registry import (
    declarable_types,
    is_builtin_type,
    is_declarable_type,
    registry,
    type_entry,
)


def test_registry_exposes_existing_scalar_types_without_a_plc_selection():
    assert {"Bool", "Time", "LTime", "DTL"}.issubset(declarable_types())
    assert "LTime" not in declarable_types("S7-1200")
    assert "LTime" in declarable_types("S7-1500")
    assert is_declarable_type("TIME")
    assert is_declarable_type("LTIME", "S7-1500")


def test_timer_counter_symbols_are_native_not_user_udt_dependencies():
    for name in ("TON", "IEC_TIMER", "TON_TIME", "CTU", "IEC_COUNTER"):
        assert is_builtin_type(name), name
        assert not is_declarable_type(name), name
    assert type_entry("TON")["kind"] == "timer_instruction"
    assert type_entry("TON_TIME")["kind"] == "timer_instance"
    assert type_entry("CTU")["kind"] == "counter_instruction"


def test_system_instances_are_rejected_in_the_current_udt_db_model():
    from pydantic import ValidationError
    from engine.tia_member import TiaMember
    with pytest.raises(ValidationError, match="not a verified UDT/global-DB declaration"):
        TiaMember(name="Timer", data_type="IEC_TIMER")


def test_registry_has_unique_names_and_aliases():
    names = []
    for entry in registry()["types"]:
        names.extend([entry["name"], *entry.get("aliases", [])])
    assert len(names) == len({name.casefold() for name in names})
