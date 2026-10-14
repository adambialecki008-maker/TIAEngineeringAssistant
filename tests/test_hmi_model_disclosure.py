"""Catalog-backed HMI display names with exact OrderNumber disclosure."""
from pathlib import Path

from fastapi.testclient import TestClient

from engine.main import app
import engine.tia_openness as adapter


ROOT = Path(__file__).resolve().parents[1]
client = TestClient(app)


def test_hmi_model_is_attached_even_if_catalog_output_follows_hmi(monkeypatch):
    monkeypatch.setattr(
        adapter, "_run_adapter", lambda *args: [
            "PROJECT|HmiCopy",
            "HMI|Panel_1|HMI_RT_1|System:Panel|"
            "OrderNumber:6AV2124-0QC02-0AX1/17.0.0.0|"
            "Siemens.Engineering.Hmi.HmiTarget|HMI_RT_1",
            "HMI_NETWORK|Panel_1|HMI_RT_1|192.168.1.3",
            "HMI_MODEL|Panel_1|HMI_RT_1|TP1500 Comfort",
        ],
    )
    response = client.get(
        "/api/v1/tia/project-context", params={"process_id": 3544}
    )
    assert response.status_code == 200, response.text
    hmi = response.json()["hmis"][0]
    assert hmi["model_name"] == "TP1500 Comfort"
    assert hmi["hmi_type_identifier"] == (
        "OrderNumber:6AV2124-0QC02-0AX1/17.0.0.0"
    )
    assert hmi["ip_address"] == "192.168.1.3"


def test_hmi_catalog_unavailable_keeps_original_identifier(monkeypatch):
    monkeypatch.setattr(
        adapter, "_run_adapter", lambda *args: [
            "PROJECT|HmiCopy",
            "HMI|Panel_1|HMI_RT_1||OrderNumber:6AV2-UNKNOWN|"
            "Siemens.Engineering.Hmi.HmiTarget|HMI_RT_1",
        ],
    )
    response = client.get(
        "/api/v1/tia/project-context", params={"process_id": 3544}
    )
    assert response.status_code == 200, response.text
    hmi = response.json()["hmis"][0]
    assert hmi["model_name"] == ""
    assert hmi["hmi_type_identifier"] == "OrderNumber:6AV2-UNKNOWN"


def test_model_disclosure_uses_native_details_in_type_column():
    source = (ROOT / "gui/js/tia.js").read_text(encoding="utf-8")
    css = (ROOT / "gui/style.css").read_text(encoding="utf-8")
    cs = (ROOT / "openness_adapter/TiaHmiModelNames.cs").read_text(
        encoding="utf-8"
    )
    assert 'details.className = "hmi-model-details"' in source
    assert 'const modelName = hmi.model_name?.trim() || "Model unavailable"' in source
    assert '["HMI type identifier", hmi.hmi_type_identifier]' in source
    assert "#tia-existing-hmis-table .hmi-model-details summary" in css
    assert "portal.HardwareCatalog.Find(" in cs
    assert "entry.TypeName" in cs
