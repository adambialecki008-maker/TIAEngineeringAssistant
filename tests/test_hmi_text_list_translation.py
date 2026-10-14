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


def test_semantic_fingerprint_ignores_export_ids_and_indentation():
    """Repeated TIA exports may reassign object IDs or change XML layout."""
    original = XML.encode("utf-8")
    root = ET.fromstring(original)
    for node in root.iter():
        if node.attrib.get("ID", "").isdigit():
            node.set("ID", str(int(node.attrib["ID"]) + 900))
    # ElementTree serializes different indentation and drops XML declaration.
    another_export = ET.tostring(root, encoding="utf-8")
    assert another_export != original
    assert lists._text_list_fingerprint(
        original, "Auto Status"
    ) == lists._text_list_fingerprint(another_export, "Auto Status")


def test_reviewed_import_allows_equivalent_reserialized_tia_export(mock_tia):
    """No false 'changed since preparation' for an identical semantic list."""
    prepared = CLIENT.post(
        "/api/v1/tia/hmis/text-lists/prepare", json=BASE,
    ).json()
    root = ET.fromstring(mock_tia["xml"])
    for node in root.iter():
        if node.attrib.get("ID", "").isdigit():
            node.set("ID", str(int(node.attrib["ID"]) + 1000))
    mock_tia["xml"] = ET.tostring(root, encoding="utf-8")
    result = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared["review_id"],
        "proposals": [
            {"entry_index": row["entry_index"], "proposal": row["proposal"]}
            for row in prepared["rows"]
        ],
    })
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "verified"
    assert result.json()["verified_entries"] == 3
    assert len(mock_tia["imported"]) == 1


@pytest.mark.parametrize("change", ["selection_value", "untouched_target", "structure"])
def test_semantic_fingerprint_rejects_real_text_list_changes(
    mock_tia, change,
):
    prepared = CLIENT.post(
        "/api/v1/tia/hmis/text-lists/prepare", json=BASE,
    ).json()
    root = ET.fromstring(mock_tia["xml"])
    entry = next(
        node for node in root.iter() if node.tag.endswith("TextListEntry")
    )
    if change == "selection_value":
        entry.find("AttributeList/SelectionValue").text = "999"
    elif change == "untouched_target":
        text = next(
            node for node in root.iter()
            if node.tag == "Text" and node.text == "Zatrzymanie awaryjne"
        )
        text.text = "Zmodyfikowano przez operatora"
    else:
        entry.set("CustomSafetyAttribute", "changed")
    mock_tia["xml"] = ET.tostring(root, encoding="utf-8")
    response = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared["review_id"],
        "proposals": [
            {"entry_index": row["entry_index"], "proposal": row["proposal"]}
            for row in prepared["rows"]
        ],
    })
    assert response.status_code == 409
    assert "changed since preparation" in response.json()["detail"]
    assert not mock_tia["imported"]


def test_review_queue_skips_rejected_indices_without_losing_later_xml_entries(
    mock_tia,
):
    request = {**BASE, "max_rows": 1, "exclude_entry_indices": [0, 1]}
    prepared = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=request)
    assert prepared.status_code == 200, prepared.text
    body = prepared.json()
    assert body["candidate_count"] == 1
    assert body["approved_count"] == 1
    assert body["rows"][0]["entry_index"] == 3
    assert body["rows"][0]["source"] == "Ready"
    assert mock_tia["imported"] == []


def test_negative_review_queue_xml_exclusion_is_rejected_before_import(mock_tia):
    request = {**BASE, "exclude_entry_indices": [-1]}
    response = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=request)
    assert response.status_code == 422
    assert not mock_tia["imported"]


def test_unsafe_xml_manual_edit_can_be_corrected_without_losing_review(mock_tia):
    prepared = CLIENT.post(
        "/api/v1/tia/hmis/text-lists/prepare", json=BASE,
    ).json()
    proposals = [
        {"entry_index": row["entry_index"], "proposal": row["proposal"]}
        for row in prepared["rows"]
    ]
    proposals[0]["proposal"] = "({Injected})"
    rejected = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared["review_id"], "proposals": proposals,
    })
    assert rejected.status_code == 422
    assert "TEXT_LIST_REVIEW_EDIT_INVALID:" in rejected.json()["detail"]
    assert mock_tia["imported"] == []
    # Same review token may be edited again only because no TIA write started.
    proposals[0]["proposal"] = prepared["rows"][0]["proposal"]
    accepted = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared["review_id"], "proposals": proposals,
    })
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "verified"
    assert len(mock_tia["imported"]) == 1


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
    assert result.status_code == 422
    assert "TEXT_LIST_REVIEW_EDIT_INVALID:" in result.json()["detail"]
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



def test_complex_text_anywhere_in_list_blocks_xml_override(
    mock_tia,
):
    # Even if another entry is eligible, an OpenLink in an untouched entry
    # makes overriding the WHOLE list unsafe.
    mock_tia["xml"] = mock_tia["xml"].replace(
        b"<Text>Emergency stop</Text>",
        b"<Text><OpenLink>PLC.Tag</OpenLink></Text>",
    )
    prepared = CLIENT.post(
        "/api/v1/tia/hmis/text-lists/prepare", json=BASE
    ).json()
    proposals = [
        {"entry_index": row["entry_index"], "proposal": row["proposal"]}
        for row in prepared["rows"]
    ]
    result = CLIENT.post(
        "/api/v1/tia/hmis/text-lists/import",
        json={"review_id": prepared["review_id"], "proposals": proposals},
    )
    assert result.status_code == 409, result.text
    assert not mock_tia["imported"]


def test_no_second_import_can_run_during_an_active_import(mock_tia):
    with lists._IMPORT_LOCK:
        result = CLIENT.post(
            "/api/v1/tia/hmis/text-lists/import",
            json={"review_id": "a" * 32,
                  "proposals": [{"entry_index": 0, "proposal": "Test"}]},
        )
    assert result.status_code == 409
    assert "in progress" in result.json()["detail"]
    assert not mock_tia["imported"]



def test_text_items_value_lang_format_supports_safe_translation(mock_tia):
    mock_tia["xml"] = b"""<?xml version="1.0" encoding="utf-8"?>
<Document><Hmi.TextGraphicList.TextList ID="0">
  <AttributeList><Name>Auto Status</Name></AttributeList>
  <ObjectList><Hmi.TextGraphicList.TextListEntry ID="1" CompositionName="Entries">
    <AttributeList><SelectionValue>1</SelectionValue></AttributeList>
    <ObjectList><MultilingualText ID="2" AggregationName="Text">
      <AttributeList><TextItems>
        <Value lang="en-US"><body><p>Open valve</p></body></Value>
      </TextItems></AttributeList>
    </MultilingualText></ObjectList>
  </Hmi.TextGraphicList.TextListEntry></ObjectList>
</Hmi.TextGraphicList.TextList></Document>
"""
    prep = CLIENT.post(
        "/api/v1/tia/hmis/text-lists/prepare", json=BASE
    )
    assert prep.status_code == 200, prep.text
    item = prep.json()["rows"][0]
    assert item["source"] == "Open valve"
    assert item["proposal"] == "Otwórz zawór"
    done = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prep.json()["review_id"],
        "proposals": [{"entry_index": item["entry_index"],
                       "proposal": item["proposal"]}],
    })
    assert done.status_code == 200, done.text
    assert done.json()["verified_entries"] == 1
    root, entries = lists._parse(mock_tia["xml"], "Auto Status")
    snapshot = lists._extract_entries(root, entries, "en-US", "pl-PL")
    assert snapshot[0]["source"] == "Open valve"
    assert snapshot[0]["target"] == "Otwórz zawór"
    # Siemens TextItems Value culture added without an artificial object ID.
    values = [node for node in root.iter()
              if node.tag == "Value" and node.attrib.get("lang")]
    assert [node.attrib["lang"] for node in values] == ["en-US", "pl-PL"]


def test_formatted_text_items_value_is_not_plain_text():
    formatted = ET.fromstring(
        '<Value lang="en-US"><body><p>Mary<field ref="0"/></p></body></Value>'
    )
    assert lists._plain_value(formatted) is None
    simple = ET.fromstring(
        '<Value lang="en-US"><body><p>Awaria PLC</p></body></Value>'
    )
    assert lists._plain_value(simple)[1] == "Awaria PLC"


def test_aggregation_name_text_is_recognized_for_safe_manual_prepare(mock_tia):
    """TIA may use AggregationName rather than CompositionName for Text."""
    mock_tia["xml"] = XML.replace(
        'CompositionName="Text"', 'AggregationName="Text"'
    ).encode("utf-8")
    result = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE)
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["candidate_count"] == 3
    assert data["approved_count"] == 3
    assert len(mock_tia["imported"]) == 0


def test_unavailable_source_language_has_explicit_preview_reason(mock_tia):
    root, entries = lists._parse(mock_tia["xml"], "Auto Status")
    rows = lists._extract_entries(root, entries, "fr-FR", "pl-PL")
    assert len(rows) == 4
    assert all(not row["supported"] for row in rows)
    assert all("No source text in fr-FR" in row["reason"] for row in rows)
    assert "en-us" in rows[0]["reason"]
    assert rows[0]["preview_source"] == "[en-us] Open valve"


def test_simple_body_p_inside_text_item_supports_reviewed_import(mock_tia):
    """A plain Siemens body/p wrapper is readable and writable without links."""
    mock_tia["xml"] = XML.replace(
        "<Text>Open valve</Text>",
        "<Text><body><p>Open valve</p></body></Text>",
    ).encode("utf-8")
    prepared = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE)
    assert prepared.status_code == 200, prepared.text
    rows = prepared.json()["rows"]
    assert rows[0]["source"] == "Open valve"
    approved = [
        {"entry_index": row["entry_index"], "proposal": row["proposal"]}
        for row in rows
    ]
    imported = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared.json()["review_id"], "proposals": approved,
    })
    assert imported.status_code == 200, imported.text
    assert imported.json()["verified_entries"] == 3
    root, entries = lists._parse(mock_tia["xml"], "Auto Status")
    current = lists._extract_entries(root, entries, "en-US", "pl-PL")
    assert current[0]["source"] == "Open valve"
    assert current[0]["target"] == "Otwórz zawór"


def test_formatted_link_text_exposes_read_only_diagnostics_but_is_not_eligible():
    xml = XML.replace(
        "<Text>Open valve</Text>",
        '<Text><body><p>Open <field ref="0"/></p></body></Text>',
    ).encode("utf-8")
    root, entries = lists._parse(xml, "Auto Status")
    parsed = lists._extract_entries(root, entries, "en-US", "pl-PL")
    assert len(parsed) == 4
    assert parsed[0]["supported"] is False
    assert parsed[0]["source"] == ""
    assert parsed[0]["preview_source"] == "Open"
    assert "structured XML" in parsed[0]["reason"]
    assert parsed[1]["supported"] is True


def test_unknown_text_aggregation_still_shows_read_only_language_preview():
    xml = XML.replace(
        'CompositionName="Text"', 'CompositionName="UnknownTextAggregation"'
    ).encode("utf-8")
    root, entries = lists._parse(xml, "Auto Status")
    rows = lists._extract_entries(root, entries, "en-US", "pl-PL")
    assert rows[0]["supported"] is False
    assert rows[0]["source"] == ""
    assert rows[0]["preview_source"] == "Open valve"
    assert "Unsupported Text aggregation" in rows[0]["reason"]



def native_export(xml, timestamp, id_shift=0):
    """Sanitized V21 shape: export-only timestamp, hexadecimal engineering IDs."""
    root = ET.fromstring(xml)
    info = root.find("DocumentInfo")
    if info is None:
        info = ET.Element("DocumentInfo")
        root.insert(0, info)
        ET.SubElement(info, "Created")
    info.find("Created").text = timestamp
    for index, node in enumerate(n for n in root.iter() if "ID" in n.attrib):
        node.set("ID", format(index + id_shift, "X"))
    return ET.tostring(root, encoding="utf-8")


def test_real_export_timestamp_and_hex_ids_do_not_block_reviewed_import(mock_tia, monkeypatch):
    adapter = tia._run_adapter
    mock_tia["xml"] = native_export(mock_tia["xml"], "2026-10-14T17:00:00Z")
    export_number = 0
    def changing_export(*args):
        nonlocal export_number
        if args[0] == "export-hmi-text-lists":
            export_number += 1
            mock_tia["xml"] = native_export(mock_tia["xml"],
                f"2026-10-14T17:00:{export_number:02d}Z", id_shift=export_number * 32)
        return adapter(*args)
    monkeypatch.setattr(tia, "_run_adapter", changing_export)
    prepared = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE).json()
    response = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared["review_id"], "proposals": [
            {"entry_index": row["entry_index"], "proposal": row["proposal"]}
            for row in prepared["rows"]]})
    assert response.status_code == 200, response.text
    assert response.json()["verified_entries"] == 3
    assert len(mock_tia["imported"]) == 1
    root = ET.fromstring(mock_tia["imported"][0])
    ids = [int(node.attrib["ID"], 16) for node in root.iter() if "ID" in node.attrib]
    assert len(ids) == len(set(ids)), "Missing-language clone must mint an unused hex ID"


def test_only_export_created_timestamp_is_transient():
    initial = native_export(XML, "2026-10-14T17:00:00Z")
    changed = native_export(initial, "2026-10-14T17:00:01Z", 32)
    assert lists._text_list_fingerprint(initial, "Auto Status") == lists._text_list_fingerprint(changed, "Auto Status")
    root = ET.fromstring(changed)
    list_attributes = root.find("Hmi.TextGraphicList.TextList/AttributeList")
    ET.SubElement(list_attributes, "Created").text = "This is list metadata"
    assert lists._text_list_fingerprint(initial, "Auto Status") != lists._text_list_fingerprint(ET.tostring(root), "Auto Status")


def test_plain_tia_linebreaks_are_translated_and_written_as_br(mock_tia, monkeypatch):
    mock_tia["xml"] = XML.replace('<Text>Open valve</Text>',
        '<Text><body><p>Open<br />valve</p></body></Text>').encode("utf-8")
    translations = {"Open\nvalve": "Otwórz\nzawór", "Awaria PLC": "Awaria PLC", "Ready": "Gotowy"}
    monkeypatch.setattr(review, "_translate_texts", lambda sources, *args: {s: translations[s] for s in sources})
    response = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE)
    assert response.status_code == 200, response.text
    prepared = response.json()
    assert prepared["rows"][0]["source"] == "Open\nvalve"
    imported = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared["review_id"], "proposals": [
            {"entry_index": row["entry_index"], "proposal": row["proposal"]}
            for row in prepared["rows"]]})
    assert imported.status_code == 200, imported.text
    root, entries = lists._parse(mock_tia["xml"], "Auto Status")
    actual = lists._extract_entries(root, entries, "en-US", "pl-PL")
    assert actual[0]["target"] == "Otwórz\nzawór"
    assert actual[0]["source"] == "Open\nvalve"
    assert actual[2]["target"] == "Zatrzymanie awaryjne"
    paragraph = actual[0]["languages"]["pl-pl"][0].find("AttributeList/Text/body/p")
    assert paragraph.text == "Otwórz" and paragraph[0].tag == "br"
    assert paragraph[0].tail == "zawór"


@pytest.mark.parametrize("markup", [
    '<body><p style="font-weight:bold">Open</p></body>',
    '<body><p>Open<br style="color:red"/>valve</p></body>',
    '<body><p>Open<field ref="A"/></p></body>',
    '<body><p>Open</p><p>valve</p></body>',
    '<body>Unmapped text<p>Open</p></body>',
])
def test_linebreak_support_does_not_accept_formatted_or_unmapped_content(markup):
    assert lists._plain_value(ET.fromstring('<Text>' + markup + '</Text>')) is None


def test_text_list_reports_translation_and_verified_import_progress(mock_tia, monkeypatch):
    prepare_id, import_id = "a" * 32, "b" * 32
    translated = review._translate_texts
    observed = []
    def translate(sources, target, model, progress):
        progress(1, len(sources))
        status = CLIENT.get("/api/v1/tia/hmis/translation-progress/" + prepare_id).json()
        assert status["stage"] == "translating" and status["completed"] == 1
        assert status["total"] == len(sources)
        assert not mock_tia["imported"]
        return translated(sources, target, model)
    monkeypatch.setattr(review, "_translate_texts", translate)
    prepared = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json={**BASE, "progress_id": prepare_id}).json()
    ready = CLIENT.get("/api/v1/tia/hmis/translation-progress/" + prepare_id).json()
    assert ready["stage"] == "ready" and ready["completed"] == ready["total"] == 3
    adapter = tia._run_adapter
    def capture(*args):
        observed.append(CLIENT.get("/api/v1/tia/hmis/translation-progress/" + import_id).json())
        return adapter(*args)
    monkeypatch.setattr(tia, "_run_adapter", capture)
    result = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared["review_id"], "progress_id": import_id,
        "proposals": [{"entry_index": row["entry_index"], "proposal": row["proposal"]} for row in prepared["rows"]]})
    assert result.status_code == 200, result.text
    assert [x["stage"] for x in observed] == ["exporting_text_list", "importing_text_list", "verifying_text_list"]
    assert all(x["completed"] == 0 for x in observed)
    verified = CLIENT.get("/api/v1/tia/hmis/translation-progress/" + import_id).json()
    assert verified["stage"] == "verified" and verified["completed"] == 3


def test_xml_verification_failure_never_reports_verified_progress(mock_tia, monkeypatch):
    prepared = CLIENT.post("/api/v1/tia/hmis/text-lists/prepare", json=BASE).json()
    adapter = tia._run_adapter
    def discard_translation(*args):
        lines = adapter(*args)
        if args[0] == "import-hmi-text-list":
            mock_tia["xml"] = XML.encode("utf-8")
        return lines
    monkeypatch.setattr(tia, "_run_adapter", discard_translation)
    progress_id = "c" * 32
    result = CLIENT.post("/api/v1/tia/hmis/text-lists/import", json={
        "review_id": prepared["review_id"], "progress_id": progress_id,
        "proposals": [{"entry_index": row["entry_index"], "proposal": row["proposal"]} for row in prepared["rows"]]})
    assert result.status_code == 502
    progress = CLIENT.get("/api/v1/tia/hmis/translation-progress/" + progress_id).json()
    assert progress["stage"] == "failed" and progress["completed"] == 0
    assert len(mock_tia["imported"]) == 1
    assert prepared["review_id"] not in lists._REVIEWS
