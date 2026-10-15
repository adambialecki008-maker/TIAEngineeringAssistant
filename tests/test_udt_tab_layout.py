from pathlib import Path


HTML = (Path(__file__).resolve().parents[1] / "gui" / "index.html").read_text(
    encoding="utf-8"
)


def test_udt_editor_precedes_tia_import_in_same_tab():
    start = HTML.index('data-tab-panel="udt"')
    end = HTML.index('data-tab-panel="db"', start)
    panel = HTML[start:end]

    assert panel.index("<h3>Application UDTs</h3>") < panel.index(
        "<h3>Import UDT from TIA (read-only)</h3>"
    )
    assert panel.index('id="udt-container"') < panel.index('id="tia-udt-scan"')


def test_udt_editor_and_tia_import_keep_existing_controls():
    for element_id in (
        "new-udt-name", "add-udt-button", "udt-container",
        "tia-udt-scan", "tia-udt-select", "tia-udt-load",
        "tia-udt-import-status",
    ):
        assert HTML.count(f'id="{element_id}"') == 1
