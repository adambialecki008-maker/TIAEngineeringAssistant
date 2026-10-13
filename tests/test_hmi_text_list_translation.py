"""Offline Classic HMI TextList prepare/review/import regression suite."""
import base64
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest
from fastapi.testclient import TestClient

from engine.main import app
from engine.tia import hmi_review as review
from engine.tia import hmi_text_list_translation as lists
import engine.tia_openness as tia


CLIENT = TestClient(app)
BASE = {
    "process_id": 1234,
    "device_name": "HMI_Device",
    "hmi_name": "HMI_00_Main",
    "source_culture": "en-US",
    "target_culture": "pl-PL",
    "text_list_name": "Auto Status",
    "max_rows": 10,
}
XML = """<?xml version="1.0" encoding="utf-8"?>
<Document>
  <Hmi.TextGraphicList.TextList ID="0">
    <AttributeList><Name>Auto Status</Name></AttributeList>
    <ObjectList>
      <Hmi.TextGraphicList.TextListEntry ID="1" CompositionName="Entries">
        <AttributeList><SelectionValue>0</SelectionValue></AttributeList>
        <ObjectList>
          <MultilingualText ID="5" CompositionName="Text">
            <ObjectList>
              <MultilingualTextItem ID="6" CompositionName="Items">
                <AttributeList><Culture>en-US</Culture><Text>Open valve</Text></AttributeList>
              </MultilingualTextItem>
              <MultilingualTextItem ID="7" CompositionName="Items">
                <AttributeList><Culture>pl-PL</Culture><Text /></AttributeList>
              </MultilingualTextItem>
            </ObjectList>
          </MultilingualText>
        </ObjectList>
      </Hmi.TextGraphicList.TextListEntry>
      <Hmi.TextGraphicList.TextListEntry ID="2" CompositionName="Entries">
        <AttributeList><SelectionValue>1</SelectionValue></AttributeList>
        <ObjectList>
          <MultilingualText ID="8" CompositionName="Text">
            <ObjectList>
              <MultilingualTextItem ID="9" CompositionName="Items">
                <AttributeList><Culture>en-US</Culture><Text>Awaria PLC</Text></AttributeList>
              </MultilingualTextItem>
              <MultilingualTextItem ID="10" CompositionName="Items">
                <AttributeList><Culture>pl-PL</Culture><Text /></AttributeList>
              </MultilingualTextItem>
            </ObjectList>
          </MultilingualText>
        </ObjectList>
      </Hmi.TextGraphicList.TextListEntry>
      <Hmi.TextGraphicList.TextListEntry ID="3" CompositionName="Entries">
        <AttributeList><SelectionValue>2</SelectionValue></AttributeList>
        <ObjectList>
          <MultilingualText ID="11" CompositionName="Text">
            <ObjectList>
              <MultilingualTextItem ID="12" CompositionName="Items">
                <AttributeList><Culture>en-US</Culture><Text>Emergency stop</Text></AttributeList>
              </MultilingualTextItem>
              <MultilingualTextItem ID="13" CompositionName="Items">
                <AttributeList><Culture>pl-PL</Culture><Text>Zatrzymanie awaryjne</Text></AttributeList>
              </MultilingualTextItem>
            </ObjectList>
          </MultilingualText>
        </ObjectList>
      </Hmi.TextGraphicList.TextListEntry>
      <Hmi.TextGraphicList.TextListEntry ID="4" CompositionName="Entries">
        <AttributeList><SelectionValue>3</SelectionValue></AttributeList>
        <ObjectList>
          <MultilingualText ID="14" CompositionName="Text">
            <ObjectList>
              <MultilingualTextItem ID="15" CompositionName="Items">
                <AttributeList><Culture>en-US</Culture><Text>Ready</Text></AttributeList>
              </MultilingualTextItem>
            </ObjectList>
          </MultilingualText>
        </ObjectList>
      </Hmi.TextGraphicList.TextListEntry>
    </ObjectList>
  </Hmi.TextGraphicList.TextList>
</Document>
"""


@pytest.fixture
def mock_tia(monkeypatch):
    current = {"xml": XML.encode("utf-8"), "imported": [], "commands": []}
    lists._REVIEWS.clear()
    monkeypatch.setattr(review, "resolve_ollama_model",
                        lambda requested: "qwen2.5:3b")
    monkeypatch.setattr(
        review, "_translate_texts",
        lambda sources, target, model: {
            source: {
                "Open valve": "Otwórz zawór",
                "Awaria PLC": "Awaria PLC",
                "Ready": "Gotowy",
            }[source] for source in sources
        },
    )
    monkeypatch.setattr(
        review, "try_repair_unsafe_translation", lambda *args: None,
    )

    def adapter(*args):
        command = args[0]
        current["commands"].append(command)
        if command == "export-hmi-text-lists":
            name = base64.b64encode(b"Auto Status").decode("ascii")
            (Path(args[-1]) / "text_list_00001.xml").write_bytes(current["xml"])
            return [
                "HMI_TEXT_LIST_EXPORTED|text_list_00001.xml|" + name,
                "HMI_TEXT_LIST_COUNT|1",
            ]
        if command == "import-hmi-text-list":
            assert args[:5] == (
                "import-hmi-text-list", "1234", "HMI_Device", "HMI_00_Main",
                "Auto Status",
            )
            current["imported"].append(Path(args[-1]).read_bytes())
            current["xml"] = current["imported"][-1]
            return ["HMI_TEXT_LIST_IMPORTED|" +
                    base64.b64encode(b"Auto Status").decode()]
        raise AssertionError(args)

    monkeypatch.setattr(tia, "_run_adapter", adapter)
    return current


def test_prepares_only_missing_plain_entries_and_reviews_before_import(mock_tia):
    result = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE)
    assert result.status_code == 200, result.text
    body = result.json()
    assert body["candidate_count"] == 3
    assert body["approved_count"] == 3
    assert body["review_id"]
    assert mock_tia["commands"] == ["export-hmi-text-lists"]
    assert [item["proposal"] for item in body["rows"]] == [
        "Otwórz zawór", "Awaria PLC", "Gotowy",
    ]
    assert len(mock_tia["imported"]) == 0


def test_verified_import_preserves_other_entries_and_adds_missing_culture(mock_tia):
    prep = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE).json()
    accepted = [
        {"entry_index": row["entry_index"], "proposal": row["proposal"]}
        for row in prep["rows"]
    ]
    result = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prep["review_id"], "proposals": accepted,
    })
    assert result.status_code == 200, result.text
    assert result.json()["verified_entries"] == 3
    assert result.json()["graphic_lists"] == "untouched"
    assert len(mock_tia["imported"]) == 1
    assert mock_tia["commands"] == [
        "export-hmi-text-lists", "export-hmi-text-lists",
        "import-hmi-text-list", "export-hmi-text-lists",
    ]
    root, entries = lists._parse(mock_tia["xml"], "Auto Status")
    actual = lists._extract_entries(root, entries, "en-US", "pl-PL")
    assert [row["target"] for row in actual] == [
        "Otwórz zawór", "Awaria PLC", "Zatrzymanie awaryjne", "Gotowy",
    ]
    assert [row["source"] for row in actual] == [
        "Open valve", "Awaria PLC", "Emergency stop", "Ready",
    ]
    assert len(list(root.iter())) > 10
    # A consumed review cannot replay the Override import.
    repeat = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prep["review_id"], "proposals": accepted,
    })
    assert repeat.status_code == 404
    assert len(mock_tia["imported"]) == 1


def test_tia_change_since_prepare_rejects_without_import(mock_tia):
    prepared = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE).json()
    mock_tia["xml"] = mock_tia["xml"].replace(
        b"<Text>Open valve</Text>", b"<Text>Valve is opened</Text>"
    )
    result = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared["review_id"],
        "proposals": [
            {"entry_index": r["entry_index"], "proposal": r["proposal"]}
            for r in prepared["rows"]
        ],
    })
    assert result.status_code == 409
    assert not mock_tia["imported"]


def test_unsafe_manual_approval_is_blocked_before_any_import(mock_tia):
    prepared = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE).json()
    proposals = [
        {"entry_index": row["entry_index"], "proposal": row["proposal"]}
        for row in prepared["rows"]
    ]
    proposals[1]["proposal"] = "Awaria hydrauliki"
    result = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared["review_id"], "proposals": proposals,
    })
    assert result.status_code == 502
    assert not mock_tia["imported"]


def test_invalid_ollama_proposal_is_skipped_and_cannot_be_imported(
    mock_tia, monkeypatch,
):
    monkeypatch.setattr(
        review, "_translate_texts",
        lambda sources, target, model: {
            s: "({Bad})" if s == "Awaria PLC" else s for s in sources
        },
    )
    response = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE)
    assert response.status_code == 200
    result = response.json()
    assert result["approved_count"] == 2
    assert len(result["skipped"]) == 1
    assert result["skipped"][0]["source"] == "Awaria PLC"
    assert "entry_index" in result["skipped"][0]
    assert mock_tia["commands"] == ["export-hmi-text-lists"]


def test_override_import_does_not_run_when_xml_scope_unknown(mock_tia):
    root = ET.fromstring(XML)
    root.find(".//Hmi.TextGraphicList.TextList/AttributeList/Name").text = (
        "Different list"
    )
    mock_tia["xml"] = ET.tostring(root, encoding="utf-8")
    result = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE)
    assert result.status_code == 409
    assert "identity" in result.json()["detail"]
    assert not mock_tia["imported"]


def test_complex_formatted_entry_is_not_eligible(mock_tia):
    data = mock_tia["xml"].replace(
        b"<Text>Open valve</Text>",
        b"<Text><OpenLink>Do not rewrite</OpenLink></Text>",
    )
    mock_tia["xml"] = data
    result = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE)
    assert result.status_code == 200, result.text
    assert result.json()["candidate_count"] == 2
    assert not mock_tia["imported"]


def test_duplicate_entry_proposals_cannot_bypass_review(mock_tia):
    prep = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE).json()
    proposals = [
        {"entry_index": prep["rows"][0]["entry_index"], "proposal": "tekst"},
        {"entry_index": prep["rows"][0]["entry_index"], "proposal": "tekst"},
    ]
    response = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prep["review_id"], "proposals": proposals,
    })
    assert response.status_code == 409
    assert not mock_tia["imported"]
