"""ET 200 PLC family retains backend hardware catalog support; Create PLC UI is removed."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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
