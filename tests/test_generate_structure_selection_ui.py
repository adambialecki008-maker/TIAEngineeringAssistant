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
    # The current checked DOM state, not every configured UDT/DB,
    # defines the effective Generate selection.
    assert 'selected_udts: checked(udtList, "UDT", projectConfig.udts' in SOURCE_UI
    assert 'selected_dbs: checked(dbList, "DB", projectConfig.dbs' in SOURCE_UI
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
    assert 'for status in ("create", "identical", "compatible", "unknown", "conflict", "blocked")' in API
    assert 'if row["status"] != "create":' in API
    assert 'request.approved_create != current["will_create"]' in API
    assert '"can_apply": bool(create)' in API
    assert 'result.counts?.blocked' in SOURCE_UI
    assert 'result.skipped_conflicts?.length' in SOURCE_UI
    assert 'clearPlan();' in SOURCE_UI


def test_generate_reads_checked_dom_scope_not_entire_project_specification():
    assert 'function selection()' in SOURCE_UI
    assert 'container.querySelectorAll(' in SOURCE_UI
    assert "input.checked" in SOURCE_UI
    assert "input.dataset.structureName" in SOURCE_UI
    assert 'selected_udts: checked(udtList, "UDT"' in SOURCE_UI
    assert 'selected_dbs: checked(dbList, "DB"' in SOURCE_UI
    assert '"/api/v1/tia/plc-structure-import/preview"' in SOURCE_UI
    assert '{project: projectConfig, ...choice}' in SOURCE_UI
    assert 'generation !== previewGeneration' in SOURCE_UI
    assert 'item.auto_dependency' in SOURCE_UI
    assert 'Server generated unselected objects:' in SOURCE_UI


def test_preflight_includes_dependency_udts_and_discloses_them_for_confirmation():
    assert 'def _include_required_udts(' in API
    assert 'selected, auto_udts = _include_required_udts(' in API
    assert 'auto_dependencies' in API
    assert 'request.approved_create != current["will_create"]' in API
    assert 'Automatically required UDTs to create:' in SOURCE_UI
    assert 'Required UDTs added:' in SOURCE_UI


def test_preflight_details_collapse_and_refresh_after_successful_import():
    assert 'function appendDetailsCell(row, value)' in SOURCE_UI
    assert 'details.className = "source-import-details";' in SOURCE_UI
    assert 'summary.textContent = "Details";' in SOURCE_UI
    assert 'function renderAppliedReport(plan, result)' in SOURCE_UI
    assert 'status: "imported"' in SOURCE_UI
    assert 'Created and compiler-confirmed in the current TIA import batch.' in SOURCE_UI

def test_preflight_diagnosis_shows_problem_action_and_collapses_stack_trace():
    assert 'describeSourceImport(value)' in SOURCE_UI
    assert 'paragraph("Problem", diagnosis.problem);' in SOURCE_UI
    assert 'paragraph("Cause", diagnosis.cause);' in SOURCE_UI
    assert 'paragraph("What to check", diagnosis.action);' in SOURCE_UI
    assert 'if (diagnosis.checklist)' in SOURCE_UI
    assert 'checklist, not confirmed differences' in SOURCE_UI
    assert 'technicalSummary.textContent = "Technical details (TIA / Openness)";' in SOURCE_UI
    assert 'pre.textContent = diagnosis.technical;' in SOURCE_UI
    assert "d.cause" in SOURCE_UI  # CSV includes readable root cause


def test_source_import_details_labels_are_english():
    for label in ('Details', 'Cause', 'What to check', 'Technical details',
                  'Properties to compare'):
        assert label in SOURCE_UI
    for old in ('Szczegóły', 'Przyczyna', 'Co zrobić'):
        assert old not in SOURCE_UI
