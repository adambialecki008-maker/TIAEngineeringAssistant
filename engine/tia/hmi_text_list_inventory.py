"""Read-only inventory of Classic HMI text lists via dedicated Openness XML export.

Project.ExportProjectTexts() XLSX is NOT a reliable text-list inventory.
This endpoint never imports XML, edits a TIA project or modifies project languages.
"""
import base64
from pathlib import Path
import re
import tempfile
from xml.etree import ElementTree

from fastapi import APIRouter, HTTPException

from engine.tia.compat import run_adapter
from engine.tia.models import TranslateHmiTextsRequest


router = APIRouter()
_LIST_LINE = re.compile(r"^HMI_TEXT_LIST_EXPORTED\|(text_list_\d{5}\.xml)\|([A-Za-z0-9+/=]+)$")
_COUNT_LINE = re.compile(r"^HMI_TEXT_LIST_COUNT\|(\d+)$")
_MAX_XML_SIZE = 20 * 1024 * 1024


def _local(tag):
    return str(tag).rsplit("}", 1)[-1].rsplit(".", 1)[-1]


def _extract_multilingual_samples(root, source_culture, target_culture):
    """Only genuine MultilingualTextItem elements, not arbitrary XML strings."""
    samples = []
    for item in root.iter():
        if _local(item.tag) != "MultilingualTextItem":
            continue
        values = {}
        for element in item.iter():
            key = _local(element.tag)
            if key in ("Culture", "Text") and element.text is not None:
                values[key] = element.text
        language = values.get("Culture", "")
        text = values.get("Text", "")
        if language and text and len(samples) < 30:
            samples.append({"culture": language, "text": text[:300]})
    preferred = {source_culture.casefold(), target_culture.casefold()}
    return [item for item in samples if item["culture"].casefold() in preferred][:10]


def _parse_classic_text_list(path: Path, source: str, target: str) -> dict:
    if not path.is_file() or path.stat().st_size > _MAX_XML_SIZE:
        raise HTTPException(502, "HMI Text list XML export missing or too large.")
    try:
        root = ElementTree.parse(path).getroot()
    except ElementTree.ParseError as exc:
        raise HTTPException(502, "TIA exported invalid HMI Text list XML.") from exc

    # A TextListEntry may be namespace-qualified or named
    # Hmi.TextGraphicList.TextListEntry by TIA's engineering XML.
    entries = sum(
        1 for node in root.iter() if _local(node.tag) == "TextListEntry"
    )
    raw_tags = {_local(item.tag) for item in root.iter()}
    recognized = "TextListEntry" in raw_tags or (
        "TextList" in raw_tags and "ObjectList" in raw_tags
    )
    return {
        "entry_count": entries if recognized else None,
        "entry_count_known": recognized,
        "sample_texts": _extract_multilingual_samples(root, source, target),
    }


@router.post("/hmis/inspect-text-lists")
def inspect_hmi_text_lists(request: TranslateHmiTextsRequest):
    """Read-only Classic XML inventory; no graphic-list access."""
    with tempfile.TemporaryDirectory(prefix="tia_hmi_text_lists_") as temp_dir:
        output = run_adapter(
            "export-hmi-text-lists",
            str(request.process_id),
            request.device_name,
            request.hmi_name,
            temp_dir,
        )
        declared_count = None
        exported = []
        seen = set()
        for line in output:
            match = _LIST_LINE.fullmatch(line.strip())
            if match:
                filename, encoded = match.groups()
                if filename in seen:
                    raise HTTPException(502, "TIA reported the same HMI text list twice.")
                seen.add(filename)
                try:
                    name = base64.b64decode(encoded, validate=True).decode("utf-8")
                except (ValueError, UnicodeDecodeError) as exc:
                    raise HTTPException(502, "Invalid HMI text-list metadata.") from exc
                exported.append((filename, name))
                continue
            match = _COUNT_LINE.fullmatch(line.strip())
            if match:
                declared_count = int(match.group(1))
        if declared_count is None or declared_count != len(exported):
            raise HTTPException(
                502, "TIA adapter did not confirm the number of exported text lists."
            )
        results = []
        entries_known = True
        for filename, name in exported:
            parsed = _parse_classic_text_list(
                Path(temp_dir) / filename,
                request.source_culture, request.target_culture,
            )
            # This same XML is also used for the selected-list preview.
            # Never run Project texts XLSX export to discover list contents.
            sample_rows = []
            preview_warning = None
            try:
                from engine.tia.hmi_text_list_translation import (
                    _parse, _extract_entries,
                )
                xml = (Path(temp_dir) / filename).read_bytes()
                root, entry_nodes = _parse(xml, name)
                entries = _extract_entries(
                    root, entry_nodes,
                    request.source_culture, request.target_culture,
                )
                sample_rows = [
                    {
                        "entry_index": item["entry_index"],
                        "source_text": item["source"],
                        "target_text": item["target"],
                        "supported": item["supported"],
                    }
                    for item in entries[:50]
                ]
            except (HTTPException, ValueError) as exc:
                preview_warning = (
                    str(exc.detail) if isinstance(exc, HTTPException)
                    else str(exc)
                )[:200]
            results.append({
                "name": name, **parsed,
                "preview_rows": sample_rows,
                "preview_warning": preview_warning,
            })
            entries_known = entries_known and parsed["entry_count_known"]
        return {
            "hmi_name": request.hmi_name,
            "export_format": "Classic HMI XML",
            "text_list_count": len(results),
            "entry_count": (
                sum(item["entry_count"] for item in results)
                if entries_known else None
            ),
            "entry_count_known": entries_known,
            "lists": results[:100],
            "sample_limit": 100,
            "translation_scope": "read_only_inventory",
            "note": (
                "Dedicated Classic TextLists XML export; separate from "
                "Project texts XLSX. Use the separate reviewed "
                "Text lists prepare/import workflow for these entries. "
                "They are not part of the Project texts XLSX batch. "
                "Graphic lists untouched."
            ),
        }
