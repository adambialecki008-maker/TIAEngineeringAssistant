from pathlib import Path


JS = (Path(__file__).resolve().parents[1] / "gui" / "js" / "data_libraries.js").read_text(encoding="utf-8")


def test_library_export_is_foldable_and_stays_inside_engineering_library():
    assert 'exportSection = element("details")' in JS
    assert 'exportSection.id = "library-export-panel"' in JS
    assert 'libraryCard.append(exportSection)' in JS
    assert JS.index('libraryCard.append(exportSection)') < JS.index('const transfer = element("div")')
    assert 'exportContent.append(' in JS
    assert 'exportActions, exportStatus, exportPreviewPanel' in JS


def test_import_uses_the_single_enclosing_foldable_menu_and_clear_data_flow():
    assert 'transfer.id = "library-import-card"' in JS
    assert 'const importSection = element("details")' not in JS
    assert 'transfer.append(importContent)' in JS
    assert 'importContent.append(' in JS
    assert 'importFile, importApply, importStatus, importPreviewPanel' in JS
    assert 'FROM: the selected Engineering Library' in JS
    assert 'FROM: a JSON file exported on another computer' in JS
    assert 'Import / Export Library' not in JS


def test_recovery_snapshots_use_the_single_enclosing_foldable_menu():
    assert 'const snapshotDetails = element("details")' not in JS
    assert 'collapsibleCard(recovery, "Recovery snapshots")' in JS
    assert 'snapshotSummary,\n        snapshots' in JS
