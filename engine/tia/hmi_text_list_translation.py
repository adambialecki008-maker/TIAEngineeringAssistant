"""Reviewed Classic HMI TextList translations (one list per import).

Only a selected HMI TextList is exported/imported through Openness. Never
access GraphicLists. Unknown/complex multilingual XML is not edited.
"""
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
from threading import Lock
import base64
import re
import tempfile
import time
from uuid import uuid4
from xml.etree import ElementTree as ET

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.tia.compat import run_adapter
from engine.tia.hmi_text_safety import needs_target_fill, normalize_hmi_translation
from engine.tia.models import TranslateHmiTextsRequest
from engine.tia import hmi_review as review


router = APIRouter()
_REVIEWS = {}
_LOCK = Lock()
_IMPORT_LOCK = Lock()
_TTL = 1800
_MAX_XML_BYTES = 20 * 1024 * 1024


class PrepareTextListRequest(TranslateHmiTextsRequest):
    text_list_name: str = Field(min_length=1, max_length=256)


class TextListProposal(BaseModel):
    entry_index: int = Field(ge=0)
    proposal: str = Field(min_length=1, max_length=50000)


class ImportTextListRequest(BaseModel):
    review_id: str = Field(pattern=r"^[0-9a-f]{32}$")
    proposals: list[TextListProposal] = Field(min_length=1, max_length=50)


def _local(tag):
    return str(tag).rsplit("}", 1)[-1].rsplit(".", 1)[-1]


def _child(element, tag):
    if element is None:
        return None
    return next((c for c in element if _local(c.tag) == tag), None)


def _attribute(element, tag):
    attrs = _child(element, "AttributeList")
    return _child(attrs, tag) if attrs is not None else None


def _node_text(node):
    # Formatted text and OpenLinks are not safe for plain string replacement.
    if node is None or len(node):
        return None
    return node.text or ""


def _parse(xml_bytes: bytes, expected_name: str):
    if not xml_bytes or len(xml_bytes) > _MAX_XML_BYTES:
        raise HTTPException(502, "Missing or oversized HMI TextList XML.")
    if re.search(rb"<!DOCTYPE|<!ENTITY", xml_bytes, re.I):
        raise HTTPException(502, "Unsafe XML declarations in TextList export.")
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise HTTPException(502, "Malformed exported TextList XML.") from exc
    lists = [node for node in root.iter() if _local(node.tag) == "TextList"]
    if len(lists) != 1 or any(
        _local(node.tag) == "GraphicList" for node in root.iter()
    ):
        raise HTTPException(409, "Export XML does not contain exactly one TextList.")
    list_node = lists[0]
    name = _node_text(_attribute(list_node, "Name"))
    if name != expected_name:
        raise HTTPException(409, "TextList identity changed since scan.")
    entries = [node for node in list_node.iter()
               if _local(node.tag) == "TextListEntry"]
    return root, entries


def _plain_value(node):
    """Accept plain direct Value or a single, unformatted <body><p>."""
    if node is None:
        return None
    if not len(node):
        return node, node.text or ""
    if len(node) == 1 and _local(node[0].tag) == "body":
        body = node[0]
        if len(body) == 1 and _local(body[0].tag) == "p":
            paragraph = body[0]
            if not len(paragraph):
                return paragraph, paragraph.text or ""
    return None


def _multilingual_entry(entry):
    texts = [node for node in entry.iter()
             if _local(node.tag) == "MultilingualText"
             and (node.attrib.get("CompositionName") == "Text"
                  or node.attrib.get("AggregationName") == "Text")]
    if len(texts) != 1:
        return None, [], None
    multilingual = texts[0]
    # Native TIA XML sometimes serializes multilingual strings directly
    # under <TextItems><Value lang="xx-YY"> instead of an ObjectList.
    items = _child(_child(multilingual, "AttributeList"), "TextItems")
    if items is not None:
        return items, [node for node in items
                       if _local(node.tag) == "Value"], "values"
    container = _child(multilingual, "ObjectList")
    if container is not None:
        return container, [node for node in container
                           if _local(node.tag) == "MultilingualTextItem"], "items"
    return None, [], None


def _preview_text(node):
    """Read-only best-effort text for Details; NEVER use for XML import."""
    if node is None:
        return ""
    return "".join(node.itertext()).strip()[:500]


def _extract_entries(root, entries, source_culture: str, target_culture: str):
    result = []
    for i, node in enumerate(entries):
        parent, items, storage = _multilingual_entry(node)
        languages = {}
        previews = {}
        complex_text = False
        reasons = []
        for item in items:
            if storage == "values":
                culture = item.attrib.get("lang", "")
                parsed = _plain_value(item)
                text_node, value = parsed if parsed is not None else (None, None)
                preview = _preview_text(item)
                if parsed is None:
                    complex_text = True
                    reasons.append("Value has formatted or linked XML")
            else:
                culture_node = _attribute(item, "Culture")
                text = _attribute(item, "Text")
                culture = _node_text(culture_node)
                parsed = _plain_value(text)
                text_node, value = parsed if parsed is not None else (None, None)
                preview = _preview_text(text)
                if parsed is None:
                    complex_text = True
                    reasons.append("Text contains structured XML")
            if not culture:
                complex_text = True
                reasons.append("Missing language Culture/lang attribute")
                continue
            key = culture.casefold()
            if key in previews:
                complex_text = True
                reasons.append("Duplicate language: " + culture)
                continue
            previews[key] = preview
            if text_node is not None:
                languages[key] = (item, text_node, value)
        source = languages.get(source_culture.casefold())
        target = languages.get(target_culture.casefold())
        reason = None
        if parent is None:
            reason = "Unsupported Text aggregation (XML layout)"
        elif complex_text:
            reason = "; ".join(dict.fromkeys(reasons)) or "Ambiguous multilingual XML"
        elif source is None:
            available = ", ".join(sorted(previews)) or "none"
            reason = ("No source text in " + source_culture
                      + " (available cultures: " + available + ")")
        result.append({
            "entry_index": i,
            "node": node,
            "parent": parent,
            "storage": storage,
            "languages": languages,
            "source": source[2] if source else "",
            "target": target[2] if target else "",
            "preview_source": previews.get(source_culture.casefold(), ""),
            "preview_target": previews.get(target_culture.casefold(), ""),
            "supported": not complex_text and parent is not None
                         and source is not None,
            "reason": reason,
        })
    return result


def _languages_snapshot(rows):
    return tuple(tuple(sorted(
        (culture, item[2]) for culture, item in row["languages"].items()
    )) for row in rows)


def _export_one(request: PrepareTextListRequest) -> bytes:
    with tempfile.TemporaryDirectory(prefix="hmi_text_list_export_") as directory:
        lines = run_adapter(
            "export-hmi-text-lists",
            str(request.process_id), request.device_name,
            request.hmi_name, directory,
        )
        matches = []
        for line in lines:
            parts = line.split("|", 2)
            if len(parts) != 3 or parts[0] != "HMI_TEXT_LIST_EXPORTED":
                continue
            if not re.fullmatch(r"text_list_\d{5}\.xml", parts[1]):
                raise HTTPException(502, "Unexpected text-list export filename.")
            try:
                name = base64.b64decode(
                    parts[2], validate=True
                ).decode("utf-8")
            except (ValueError, UnicodeDecodeError) as exc:
                raise HTTPException(502, "Corrupt TextList export metadata.") from exc
            if name == request.text_list_name:
                matches.append(Path(directory) / parts[1])
        if len(matches) != 1:
            raise HTTPException(404, "Selected HMI TextList was not exported exactly once.")
        path = matches[0]
        if not path.is_file() or path.stat().st_size > _MAX_XML_BYTES:
            raise HTTPException(502, "Invalid exported text-list XML file.")
        return path.read_bytes()


def _prune():
    now = time.monotonic()
    for key, data in list(_REVIEWS.items()):
        if now - data["created"] >= _TTL:
            del _REVIEWS[key]


def _write_proposal(root, row, target_culture, proposal):
    old = row["languages"].get(target_culture.casefold())
    if old:
        old[1].text = proposal
        return
    # TIA may omit unused cultures. Duplicate ONLY a simple source item,
    # mint an unused engineering XML ID and change Culture/Text.
    source = row["languages"][row["source_culture"].casefold()]
    if row["parent"] is None:
        raise HTTPException(409, "Unsupported TextList language container.")
    clone = deepcopy(source[0])
    if row["storage"] == "values":
        clone.set("lang", target_culture)
        payload = _plain_value(clone)
        if payload is None:
            raise HTTPException(409, "Cannot clone complex target TextList XML.")
        payload[0].text = proposal
    else:
        existing_ids = {int(e.attrib["ID"]) for e in root.iter()
                        if e.attrib.get("ID", "").isdigit()}
        clone.set("ID", str(max(existing_ids or {0}) + 1))
        culture = _attribute(clone, "Culture")
        text = _attribute(clone, "Text")
        plain = _plain_value(text)
        if culture is None or plain is None:
            raise HTTPException(409, "Cannot safely add target language to TextList.")
        culture.text = target_culture
        plain[0].text = proposal
    row["parent"].append(clone)


@router.post("/hmis/text-lists/prepare")
def prepare_text_list(request: PrepareTextListRequest):
    if request.source_culture.casefold() == request.target_culture.casefold():
        raise HTTPException(422, "Source and target languages must differ.")
    if request.max_rows is None or not 1 <= request.max_rows <= 50:
        raise HTTPException(422, "Prepare supports 1–50 entries of one TextList.")
    model = (
        "source-copy" if request.translation_strategy == "copy"
        else review.resolve_ollama_model(request.ollama_model)
    )
    xml = _export_one(request)
    root, entries = _parse(xml, request.text_list_name)
    rows = _extract_entries(
        root, entries, request.source_culture, request.target_culture
    )
    candidates = [
        r for r in rows
        if r["supported"] and needs_target_fill(r["source"], r["target"])
    ][:request.max_rows]
    if not candidates:
        raise HTTPException(
            422, "No eligible plain-text entries in this list. "
            "Populated and formatted target texts are protected."
        )
    sources = list(dict.fromkeys(row["source"] for row in candidates))
    translated = (
        {source: source for source in sources}
        if request.translation_strategy == "copy"
        else review._translate_texts(
            sources, request.target_culture, model
        )
    )
    accepted, skipped = [], []
    for row in candidates:
        source = row["source"]
        proposal = normalize_hmi_translation(source, translated.get(source))
        try:
            review.validate_hmi_translation_quality(
                source, proposal, request.target_culture
            )
        except HTTPException as exc:
            if exc.status_code != 502:
                raise
            fixed = (
                review.try_repair_unsafe_translation(
                    source,
                    proposal if isinstance(proposal, str) else "",
                    str(exc.detail), request.target_culture, model
                )
                if request.translation_strategy == "ollama" else None
            )
            if fixed is None:
                skipped.append({
                    "entry_index": row["entry_index"],
                    "source": source,
                    "proposal": proposal if isinstance(proposal, str) else "",
                    "reason": str(exc.detail),
                })
                continue
            proposal = fixed
        accepted.append({
            "entry_index": row["entry_index"],
            "source": source,
            "current_target": row["target"],
            "proposal": proposal,
        })
    token = uuid4().hex if accepted else None
    if token:
        with _LOCK:
            _prune()
            if len(_REVIEWS) >= 20:
                raise HTTPException(429, "Too many pending TextList reviews.")
            _REVIEWS[token] = {
                "created": time.monotonic(),
                "request": request.model_dump(),
                "fingerprint": sha256(xml).hexdigest(),
                "accepted": accepted,
            }
    return {
        "review_id": token,
        "text_list_name": request.text_list_name,
        "candidate_count": len(candidates),
        "approved_count": len(accepted),
        "skipped": skipped,
        "rows": accepted,
        "note": "Only these entries can be imported, after explicit approval.",
    }


@router.post("/hmis/text-lists/import")
def import_text_list(request: ImportTextListRequest):
    # Do not overlap TextList imports. The token is single-use even when
    # import success is uncertain, preventing blind replays.
    if not _IMPORT_LOCK.acquire(blocking=False):
        raise HTTPException(409, "Another TextList import is in progress.")
    try:
        with _LOCK:
            _prune()
            prepared = _REVIEWS.pop(request.review_id, None)
        if not prepared:
            raise HTTPException(404, "TextList review expired or already used.")
        return _perform_reviewed_import(prepared, request)
    finally:
        _IMPORT_LOCK.release()


def _perform_reviewed_import(prepared: dict, request: ImportTextListRequest):
    selection = PrepareTextListRequest(**prepared["request"])
    approved = {item["entry_index"]: item for item in prepared["accepted"]}
    provided = {item.entry_index: item.proposal for item in request.proposals}
    if len(provided) != len(request.proposals) or set(provided) != set(approved):
        raise HTTPException(409, "Review proposals do not match prepared TextList rows.")
    # No Openness write can happen before fresh export, safety validation
    # and exact snapshot comparison.
    for entry_index, proposal in provided.items():
        row = approved[entry_index]
        review.validate_hmi_translation_quality(
            row["source"], proposal, selection.target_culture
        )
        if not needs_target_fill(row["source"], row["current_target"]):
            raise HTTPException(409, "Prepared target was already populated.")

    xml = _export_one(selection)
    if sha256(xml).hexdigest() != prepared["fingerprint"]:
        raise HTTPException(
            409, "TextList changed since preparation. Nothing imported. "
            "Prepare again from a fresh scan."
        )
    root, entries = _parse(xml, selection.text_list_name)
    # Siemens supports advanced XML for linked/formatted texts. ImportOptions
    # Override would rewrite the entire list, not just our selected entries.
    # Block such lists rather than risk damaged formatting or OpenLinks.
    if any(_local(node.tag).casefold() in {
        "openlink", "formattedtext", "richtext",
    } for node in root.iter()):
        raise HTTPException(
            409, "This TextList contains formatted or linked XML texts. "
            "No import was attempted."
        )
    before = _extract_entries(
        root, entries, selection.source_culture, selection.target_culture
    )
    # A different entry can contain a rich-text value; because Override
    # replaces the entire list, refuse ALL writes in that case.
    if any(
        _plain_value(node) is None
        for entry in entries
        for node in entry.iter()
        if _local(node.tag) == "Value"
        and "lang" in node.attrib
    ):
        raise HTTPException(
            409, "TextList contains formatted multilingual Value XML. "
            "No import was attempted."
        )
    if any(
        any(
            _local(item.tag) == "Text" and _plain_value(item) is None
            for element in entry.iter()
            if _local(element.tag) == "MultilingualTextItem"
            for item in element.iter()
        )
        for entry in entries
    ):
        raise HTTPException(
            409, "TextList contains non-plain multilingual text. "
            "Cannot safely replace the list through XML."
        )
    for index, proposal in provided.items():
        row = before[index]
        expected = approved[index]
        if (row["source"], row["target"]) != (
            expected["source"], expected["current_target"]
        ) or not row["supported"]:
            raise HTTPException(409, "TextList entry changed since review.")
        row["source_culture"] = selection.source_culture
        _write_proposal(root, row, selection.target_culture, proposal)
    desired = _extract_entries(
        root, entries, selection.source_culture, selection.target_culture
    )
    expected_languages = _languages_snapshot(desired)
    with tempfile.TemporaryDirectory(prefix="hmi_text_list_reviewed_") as directory:
        path = Path(directory) / "reviewed_text_list.xml"
        ET.ElementTree(root).write(
            path, encoding="utf-8", xml_declaration=True
        )
        lines = run_adapter(
            "import-hmi-text-list",
            str(selection.process_id),
            selection.device_name, selection.hmi_name,
            selection.text_list_name, str(path),
        )
        confirmed = "HMI_TEXT_LIST_IMPORTED|" + base64.b64encode(
            selection.text_list_name.encode("utf-8")
        ).decode("ascii")
        if confirmed not in lines:
            raise HTTPException(
                502, "TextList import not confirmed. Inspect TIA before retrying."
            )
    # Check all language strings in all entries, including untouched siblings.
    current_xml = _export_one(selection)
    current_root, current_entries = _parse(
        current_xml, selection.text_list_name
    )
    actual = _extract_entries(
        current_root, current_entries,
        selection.source_culture, selection.target_culture,
    )
    if len(actual) != len(desired) or _languages_snapshot(actual) != expected_languages:
        raise HTTPException(
            502, "TextList import may have changed TIA, but re-export "
            "verification failed. Inspect the project before retrying."
        )
    return {
        "status": "verified",
        "text_list_name": selection.text_list_name,
        "verified_entries": len(provided),
        "total_entries": len(actual),
        "graphic_lists": "untouched",
    }
