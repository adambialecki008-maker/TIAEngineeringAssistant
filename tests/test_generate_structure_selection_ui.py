"""Selection contract for Generate UDT/DB tab."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "gui/index.html").read_text(encoding="utf-8")
SOURCE_UI = (ROOT / "gui/js/source_import.js").read_text(encoding="utf-8")
APP = (ROOT / "gui/js/app.js").read_text(encoding="utf-8")
API = (ROOT / "engine/tia/source_import.py").read_text(encoding="utf-8")


def test_independent_udt_and_db_selection_in_generate_tab():
    for control in (
        "source-select-udts", "source-select-dbs",
        "source-select-udt-count", "source-select-db-count",
        "source-selection-status",
    ):
        assert f'id="{control}"' in HTML
    assert 'selected_udts: projectConfig.udts' in SOURCE_UI
    assert 'selected_dbs: projectConfig.dbs' in SOURCE_UI
    assert "selectedUdts = new Set()" in SOURCE_UI
    assert "selectedDbs = new Set()" in SOURCE_UI
    assert 'input.type = "checkbox"' in SOURCE_UI


def test_source_preview_and_import_share_selection():
    assert '"\u002fapi/v1/tia/plc-structure-import/preview"' in SOURCE_UI
    assert '"\u002fapi/v1/tia/plc-structure-import/plan"' in SOURCE_UI
    assert '...selection(),' in SOURCE_UI
    assert 'sourceImportUi.generateSelectionPreview()' in APP
    assert 'sourceImportUi?.refreshSelection()' in APP
    assert 'selected_udts: list[str] | None = None' in API
    assert 'selected_dbs: list[str] | None = None' in API
    assert 'def preview_selected_plc_sources(' in API


def test_selected_import_allows_independent_items_and_never_overwrites():
    assert 'for status in ("create", "identical", "conflict", "blocked")' in API
    assert 'if row["status"] != "create":' in API
    assert 'request.approved_create != current["will_create"]' in API
    assert '"can_apply": bool(create)' in API
    assert 'result.counts?.blocked' in SOURCE_UI
    assert 'result.skipped_conflicts?.length' in SOURCE_UI
    assert 'clearPlan();' in SOURCE_UI
