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
    marker = '\\n        <section\\n            class="tab-panel"'
    return section.split(marker, 1)[0]


def test_plc_and_hmi_are_separate_navigation_tabs():
    assert 'data-tab="tia"' not in HTML
    assert 'data-tab-panel="tia"' not in HTML
    for kind in ("plc", "hmi"):
        assert f'data-tab="{kind}"' in HTML
        assert f'data-tab-panel="{kind}"' in HTML
    assert 'tabName === "tia" ? "plc"' in TABS_JS


def test_each_tab_shows_connection_and_project_context_without_duplicate_ids():
    plc = _tab("plc")
    hmi = _tab("hmi")
    for text in ("Connection", "Project context", "TIA process:", "TIA project:"):
        assert text in plc
        assert text in hmi

    for name in ("tia-process", "tia-refresh-button", "tia-connection-status",
                 "tia-project-name"):
        assert f'id="{name}"' in plc
        assert f'id="{name}"' not in hmi

    for name in ("tia-hmi-process", "tia-hmi-refresh-button",
                 "tia-hmi-connection-status", "tia-hmi-project-name"):
        assert f'id="{name}"' in hmi
        assert f'id="{name}"' not in plc

    counts = Counter(re.findall(r'\\bid="([^"]+)"', HTML))
    assert all(count == 1 for count in counts.values())


def test_plc_specific_engineering_is_not_in_hmi_tab():
    plc = _tab("plc")
    hmi = _tab("hmi")
    for control in ("tia-existing-plcs-table", "tia-plc-tags-body",
                    "tia-plc-program-blocks-body", "tia-plc-dbs-body",
                    "tia-create-plc-button"):
        assert f'id="{control}"' in plc
        assert f'id="{control}"' not in hmi


def test_hmi_translation_and_xml_list_workflow_are_not_in_plc_tab():
    plc = _tab("plc")
    hmi = _tab("hmi")
    for control in ("tia-existing-hmis-table", "tia-hmi-translation-panel",
                    "tia-hmi-scope-project", "tia-hmi-scope-lists",
                    "tia-hmi-text-list-import"):
        assert f'id="{control}"' in hmi
        assert f'id="{control}"' not in plc


def test_hmi_and_plc_session_controls_use_same_process():
    assert 'function syncHmiConnectionControls()' in TIA_JS
    assert 'hmiProcessSelect.value = processSelect.value;' in TIA_JS
    assert 'hmiProcessSelect.disabled = processSelect.disabled;' in TIA_JS
    assert 'hmiProjectNameElement.textContent =' in TIA_JS
    assert 'hmiConnectionStatus.textContent = tiaConnectionStatus.textContent;' in TIA_JS
    assert 'hmiRefreshButton?.addEventListener("click", refreshProcesses);' in TIA_JS
    assert 'hmiRefreshProjectButton?.addEventListener("click", refreshProjectPlcs);' in TIA_JS
    assert 'processSelect.dispatchEvent(new Event("change"));' in TIA_JS
