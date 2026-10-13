"""Dedicated Classic Text lists export is read-only and separate from XLSX."""
import base64
from pathlib import Path

from fastapi.testclient import TestClient
from engine.main import app
from engine.tia.hmi_text_list_inventory import _parse_classic_text_list
import engine.tia_openness as facade


CLIENT = TestClient(app)
REQUEST = {
    "process_id": 1234,
    "device_name": "HMI_Station",
    "hmi_name": "HMI_00_Main",
    "source_culture": "en-US",
    "target_culture": "pl-PL",
}
XML = """<?xml version="1.0" encoding="UTF-8"?>
<Document>
  <Hmi.TextGraphicList.TextList ID="0">
    <AttributeList><Name>Auto Status</Name></AttributeList>
    <ObjectList>
      <Hmi.TextGraphicList.TextListEntry ID="1">
        <ObjectList>
          <MultilingualText ID="3" CompositionName="Text">
            <ObjectList>
              <MultilingualTextItem ID="4">
                <AttributeList><Culture>en-US</Culture>
                  <Text>Karuzela gotowa</Text></AttributeList>
              </MultilingualTextItem>
              <MultilingualTextItem ID="5">
                <AttributeList><Culture>pl-PL</Culture>
                  <Text /></AttributeList>
              </MultilingualTextItem>
            </ObjectList>
          </MultilingualText>
        </ObjectList>
      </Hmi.TextGraphicList.TextListEntry>
      <Hmi.TextGraphicList.TextListEntry ID="2">
        <AttributeList><Value>2</Value></AttributeList>
      </Hmi.TextGraphicList.TextListEntry>
    </ObjectList>
  </Hmi.TextGraphicList.TextList>
</Document>
"""


def test_classic_text_list_inventory_counts_entries_and_lists(monkeypatch):
    calls = []

    def fake_adapter(*args):
        calls.append(args)
        assert args[:4] == (
            "export-hmi-text-lists", "1234", "HMI_Station", "HMI_00_Main",
        )
        output = Path(args[4])
        (output / "text_list_00001.xml").write_text(XML, encoding="utf-8")
        name = base64.b64encode("Auto Status".encode()).decode()
        return [
            "HMI_TEXT_LIST_EXPORTED|text_list_00001.xml|" + name,
            "HMI_TEXT_LIST_COUNT|1",
        ]

    monkeypatch.setattr(facade, "_run_adapter", fake_adapter)
    result = CLIENT.post("/api/v1/tia/hmis/inspect-text-lists", json=REQUEST)
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["text_list_count"] == 1
    assert data["entry_count"] == 2
    assert data["entry_count_known"] is True
    assert data["lists"][0]["name"] == "Auto Status"
    assert data["lists"][0]["sample_texts"][0]["text"] == "Karuzela gotowa"
    preview = data["lists"][0]["preview_rows"]
    assert len(preview) == 2
    assert preview[0]["source_text"] == "Karuzela gotowa"
    assert preview[0]["target_text"] == ""
    assert preview[0]["supported"] is True
    assert preview[1]["supported"] is False
    assert data["translation_scope"] == "read_only_inventory"
    assert len(calls) == 1


def test_inventory_rejects_adapter_count_mismatch(monkeypatch):
    monkeypatch.setattr(
        facade, "_run_adapter", lambda *args: ["HMI_TEXT_LIST_COUNT|2"],
    )
    result = CLIENT.post("/api/v1/tia/hmis/inspect-text-lists", json=REQUEST)
    assert result.status_code == 502
    assert "confirm" in result.json()["detail"]


def test_unknown_xml_structure_is_never_reported_as_zero_entries(tmp_path):
    path = tmp_path / "text_list_00001.xml"
    path.write_text("<Document><UnexpectedName/></Document>", encoding="utf-8")
    result = _parse_classic_text_list(path, "en-US", "pl-PL")
    assert result["entry_count"] is None
    assert result["entry_count_known"] is False


def test_inventory_cannot_read_graphic_lists_or_import_project(monkeypatch):
    commands = []

    def fake_adapter(*args):
        commands.append(args[0])
        return ["HMI_TEXT_LIST_COUNT|0"]

    monkeypatch.setattr(facade, "_run_adapter", fake_adapter)
    result = CLIENT.post("/api/v1/tia/hmis/inspect-text-lists", json=REQUEST)
    assert result.status_code == 200
    assert result.json()["text_list_count"] == 0
    assert commands == ["export-hmi-text-lists"]
