"""ET 200SP/ET 200pro CPU family appears in the PLC create UI."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_et200_family_is_exposed_in_create_plc_select():
    html = (ROOT / "gui" / "index.html").read_text(encoding="utf-8")
    assert '<option value="ET-200">' in html
    assert 'ET 200 CPU (SP / pro)' in html
    assert 'id="tia-plc-model"' in html


def test_et200_family_is_resolved_from_installed_openness_catalogue():
    service = (ROOT / "openness_adapter" / "TiaService.cs").read_text(
        encoding="utf-8"
    )
    assert 'case "et-200":' in service
    assert 'case "et200":' in service
    assert 'normalizedName.Contains("sp")' in service
    assert 'normalizedName.Contains("pro")' in service
    assert '"PLC_MODEL|"' in service
    assert "GetCatalogSearchText(" in service
