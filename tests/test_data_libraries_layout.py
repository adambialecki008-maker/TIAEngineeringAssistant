from pathlib import Path


JS = (Path(__file__).resolve().parents[1] / "gui" / "js" / "data_libraries.js").read_text(encoding="utf-8")


def test_library_export_is_foldable_and_stays_inside_engineering_library():
    assert 'exportSection = element("details")' in JS
    assert 'exportSection.id = "library-export-panel"' in JS
    assert 'libraryCard.append(exportSection)' in JS
    assert JS.index('libraryCard.append(exportSection)') < JS.index('const transfer = element("div")')
    assert 'exportContent.append(' in JS
    assert 'exportActions, exportStatus, exportPreviewPanel' in JS


def test_import_uses_one_outer_disclosure_and_preserves_json_workflows():
    # The outer collapsible card is the ONLY fold required to reach the JSON file picker.
    assert 'transfer.id = "library-import-card"' in JS
    assert 'transfer.append(element("h3", "Import Library"))' in JS
    assert 'collapsibleCard(transfer, "Import Library")' in JS
    assert 'importContent = element("div")' in JS
    assert 'importContent.id = "library-import-panel"' in JS
    assert 'transfer.append(importContent)' in JS
    assert 'importSection = element("details")' not in JS
    assert 'importContent.append(' in JS
    assert 'importFile, importApply, importStatus, importPreviewPanel, selectiveImport' in JS
    assert 'selectiveImport = element("details")' in JS
    assert 'selectiveImport.id = "library-selective-import-panel"' in JS
    assert 'FROM: the selected Engineering Library' in JS
    assert 'FROM: a JSON file exported on another computer' in JS
    assert 'Import / Export Library' not in JS


def test_recovery_snapshots_have_no_redundant_inner_disclosure():
    assert 'collapsibleCard(recovery, "Recovery snapshots")' in JS
    assert 'snapshotDetails = element("section")' in JS
    assert 'snapshotDetails.className = "library-snapshot-list"' in JS
    assert 'snapshotSummary = element("h4", "Saved snapshots")' in JS
    assert 'snapshotDetails.append(snapshotSummary, snapshots)' in JS
    assert 'snapshotDetails = element("details")' not in JS
