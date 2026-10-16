"""Contract tests for independent PLC/HMI views sharing one TIA process."""
from collections import Counter
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "gui" / "index.html").read_text(encoding="utf-8")
TIA_JS = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")
TABS_JS = (ROOT / "gui" / "js" / "tabs.js").read_text(encoding="utf-8")


def _tab(name):
    section = HTML.split(f'data-tab-panel="{name}"', 1)[1]
    return section.split('data-tab-panel="', 1)[0]


def test_plc_and_hmi_are_separate_navigation_tabs():
    assert 'data-tab="tia"' not in HTML
    assert 'data-tab-panel="tia"' not in HTML
    for kind in ("plc", "hmi"):
        assert f'data-tab="{kind}"' in HTML
        assert f'data-tab-panel="{kind}"' in HTML
    assert 'tabName === "tia" ? "plc"' in TABS_JS


def test_overview_owns_single_connection_and_project_context():
    overview = _tab("project")
    plc = _tab("plc")
    hmi = _tab("hmi")
    for name in ("overview-profile-management", "overview-profile-name",
                 "tia-process", "tia-refresh-button", "tia-connection-status",
                 "tia-project-name", "tia-existing-plcs-table",
                 "tia-refresh-plcs-button"):
        assert f'id="{name}"' in overview
        assert f'id="{name}"' not in plc
        assert f'id="{name}"' not in hmi
    for obsolete in ("tia-hmi-process", "tia-hmi-refresh-button",
                     "tia-hmi-connection-status", "tia-hmi-project-name"):
        assert f'id="{obsolete}"' not in HTML
    for name in ("tia-plc-tags-body", "tia-plc-program-blocks-body",
                 "tia-plc-dbs-body"):
        assert f'id="{name}"' in plc
        assert f'id="{name}"' not in hmi
    counts = Counter(re.findall(r'id="([^"]+)"', HTML))
    assert all(count == 1 for count in counts.values())


def test_profile_selection_and_active_plc_live_on_overview():
    overview = _tab("project")
    for phrase in ("Local project profile", "TIA process:",
                   "Choose Active PLC", "Refresh TIA", "TIA project"):
        assert phrase in overview
    assert 'id="header-profile-summary"' in HTML
    libraries_js = (ROOT / "gui" / "js" / "data_libraries.js").read_text(encoding="utf-8")
    assert 'collapsibleCard(profilesCard, "Local project profiles")' in libraries_js


def test_device_engineering_sections_are_collapsible():
    devices = _tab("devices")
    for title in (
        "Device templates", "Device groups", "TIA hardware / I/O channels",
        "I/O mapping", "Generated PLC tags", "Generated device configuration",
    ):
        assert f"<summary>{title}</summary>" in devices
    assert devices.count('<details class="card device-section">') == 6


def test_hmi_translation_and_xml_list_workflow_are_not_in_plc_tab():
    plc = _tab("plc")
    hmi = _tab("hmi")
    for control in ("tia-existing-hmis-table", "tia-hmi-translation-panel",
                    "tia-hmi-scope-project", "tia-hmi-scope-lists",
                    "tia-hmi-import-reviewed-button",
                    "tia-hmi-text-list-review"):
        assert f'id="{control}"' in hmi
        assert f'id="{control}"' not in plc


def test_single_overview_tia_process_is_shared_by_workflows():
    overview = _tab("project")
    assert overview.count('id="tia-process"') == 1
    assert overview.count('id="tia-refresh-button"') == 1
    assert "function syncHmiConnectionControls()" in TIA_JS
    assert "processSelect.addEventListener(" in TIA_JS
    assert "refreshProjectPlcs" in TIA_JS


def test_create_plc_interface_removed_without_hiding_read_only_plc_inventory():
    plc = _tab("plc")
    assert "Create PLC" not in plc
    for element in ("tia-create-plc-button", "tia-load-models-button", "tia-plc-model",
                    "tia-device-name", "tia-plc-name", "plc-family"):
        assert f'id="{element}"' not in HTML
    for element in ("tia-plc-tags-body", "tia-plc-program-blocks-body", "tia-plc-dbs-body"):
        assert f'id="{element}"' in plc
    assert '"/api/v1/tia/plcs"' not in TIA_JS
