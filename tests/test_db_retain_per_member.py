"""Optimized global DB per-variable retentivity, without altering old projects."""
from engine.plc_db import DataBlockSpecification
from engine.tia.source_import import _db_retain_comparison
from engine.tia.models import PlcStructureMemberInfo
from functions.tia_source_generator import generate_db_source


def _source(payload):
    db = DataBlockSpecification.model_validate(payload)
    return db, generate_db_source(db.name, db.members, {}, retain=db.retain)


def test_legacy_retain_source_is_unchanged():
    db, source = _source({"name": "Legacy", "retain": True,
        "members": [{"name": "A", "data_type": "Bool"},
                    {"name": "B", "data_type": "Bool"}]})
    assert db.members[0].retain is None
    assert source.count("VAR RETAIN") == 1
    assert source.count("END_VAR") == 1
    assert "NON_RETAIN" not in source


def test_mixed_retain_generates_ordered_declaration_sections():
    db, source = _source({"name": "Mixed", "retain": False, "members": [
        {"name": "Pulse", "data_type": "Bool", "retain": False},
        {"name": "Counter", "data_type": "DInt", "retain": True},
        {"name": "Alarm", "data_type": "Bool", "retain": True},
        {"name": "Ready", "data_type": "Bool"},
    ]})
    assert [m.retain for m in db.members] == [False, True, True, None]
    assert source.count("END_VAR") == 3
    assert "VAR\n   Pulse : Bool;\nEND_VAR\nVAR RETAIN\n" in source
    assert "Counter : DInt;\n   Alarm : Bool;\nEND_VAR" in source
    assert "VAR\n   Ready : Bool;" in source
    assert "NON_RETAIN" not in source
    assert DataBlockSpecification.model_validate(db.model_dump()).members[1].retain is True


def test_preflight_compares_explicit_retain_per_top_level_member():
    db, _ = _source({"name": "Mixed", "retain": False, "members": [
        {"name": "Pulse", "data_type": "Bool", "retain": False},
        {"name": "Counter", "data_type": "DInt", "retain": True},
    ]})
    actual = [
        PlcStructureMemberInfo(section="Static", path="Pulse", name="Pulse",
                               metadata={"remanence": "NonRetain"}),
        PlcStructureMemberInfo(section="Static", path="Counter", name="Counter",
                               metadata={"remanence": "Retain"}),
    ]
    assert _db_retain_comparison(db, actual) is None
    actual[1].metadata["remanence"] = "NonRetain"
    assert _db_retain_comparison(db, actual)["status"] == "conflict"
    actual[1].metadata.clear()
    assert _db_retain_comparison(db, actual)["status"] == "unknown"


def test_nested_retain_conflict_is_not_treated_as_identical():
    db, _ = _source({"name": "DB_Test", "retain": True, "members": [
        {"name": "Status", "data_type": "Struct", "struct_members": [
            {"name": "Ready", "data_type": "Bool"},
        ]},
    ]})
    actual = [
        PlcStructureMemberInfo(section="Static", path="Status", name="Status",
                               data_type="Struct", metadata={"remanence": "Retain"}),
        PlcStructureMemberInfo(section="Static", path="Status.Ready", name="Ready",
                               data_type="Bool", level=1,
                               metadata={"remanence": "NonRetain"}),
    ]
    result = _db_retain_comparison(db, actual)
    assert result["status"] == "unknown"
    assert "Nested DB members override RETAIN" in result["reason"]
