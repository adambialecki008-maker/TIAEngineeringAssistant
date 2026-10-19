"""Evidence-only LAD/FBD Siemens FlgNet connectivity index.

Wire endpoints are preserved; this is NOT a PLC RLO simulator or a
certification of F-program functionality. Only exact direct duplicate
operands of one AND/OR gate are offered as review candidates.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any
from xml.etree import ElementTree as ET


def _tag(node: ET.Element) -> str:
    return node.tag.rsplit("}", 1)[-1]


def _operand(access: ET.Element) -> str:
    symbol = next((x for x in access if _tag(x) == "Symbol"), None)
    if symbol is not None:
        items = [x.get("Name", "") for x in symbol if _tag(x) == "Component"]
        if items:
            return ".".join(items)
    literal = next((x for x in access.iter() if _tag(x) == "ConstantValue"), None)
    return (literal.text or "").strip() if literal is not None else ""


def inspect_lad_fbd_network(
    network: ET.Element, *, path: str, block: str, plc: str,
    ordinal: int, language: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    flg = next((node for node in network.iter() if _tag(node) == "FlgNet"), None)
    if flg is None:
        return {"network": ordinal, "language": language,
                "status": "no_flgnet", "parts": [], "accesses": [],
                "wires": []}, []
    parts = {}
    negations = {}
    accesses = {}
    for node in flg.iter():
        uid = node.get("UId")
        if not uid:
            continue
        kind = _tag(node)
        if kind == "Part":
            parts[uid] = node.get("Name", "")
            negations[uid] = sorted(
                c.get("Name", "") for c in node if _tag(c) == "Negated"
            )
        elif kind == "Access":
            accesses[uid] = _operand(node)
    wires = []
    direct_inputs = defaultdict(list)
    for wire in flg.iter():
        if _tag(wire) != "Wire":
            continue
        endpoints = []
        for end in wire:
            kind = _tag(end)
            if kind == "IdentCon":
                uid = end.get("UId", "")
                endpoints.append({"uid": uid, "type": "operand"})
            elif kind == "NameCon":
                uid = end.get("UId", "")
                endpoints.append({
                    "uid": uid, "type": "pin", "name": end.get("Name", ""),
                })
        if not endpoints:
            continue
        wires.append({"uid": wire.get("UId", ""), "endpoints": endpoints})
        # Only one unequivocal source Access with direct AND/OR input pins.
        sources = [x["uid"] for x in endpoints
                   if x["type"] == "operand" and x["uid"] in accesses]
        if len(sources) != 1:
            continue
        source = accesses[sources[0]]
        if not source:
            continue
        for end in endpoints:
            if end["type"] != "pin":
                continue
            gate = end["uid"]
            gate_type = parts.get(gate, "")
            pin = end["name"]
            if gate_type not in {"A", "O", "AND", "OR"} or not pin.startswith("in"):
                continue
            direct_inputs[gate].append((pin, source, pin in negations[gate]))
    findings = []
    for uid, entries in sorted(direct_inputs.items()):
        grouped = defaultdict(list)
        for pin, symbol, inverse in entries:
            grouped[(symbol, inverse)].append(pin)
        for (symbol, inverse), pins in sorted(grouped.items()):
            if len(set(pins)) < 2:
                continue
            findings.append({
                "rule": "LAD_FBD_DUPLICATE_DIRECT_GATE_INPUT",
                "category": "source_redundancy_candidate",
                "priority": "P2",
                "confidence": "high_for_direct_wiring",
                "source_path": path, "block": block, "plc": plc,
                "network": ordinal, "language": language,
                "gate_type": parts[uid], "gate_uid": uid,
                "input_pins": sorted(set(pins)),
                "signal": symbol, "negated": inverse,
                "evidence": "The same directly connected symbol and polarity feeds multiple distinct inputs of one Boolean gate.",
                "impact": "Potential redundant Boolean gate input or copy/paste error; intended control logic not inferred.",
                "verification": "Inspect the exact FlgNet wires, gate pin negation, and intended signals in TIA Portal.",
            })
    result = {
        "network": ordinal, "language": language, "status": "indexed",
        "parts": [{"uid": uid, "name": name, "negated_pins": negations[uid]}
                  for uid, name in sorted(parts.items())],
        "accesses": [{"uid": uid, "symbol": symbol}
                     for uid, symbol in sorted(accesses.items())],
        "wires": wires,
    }
    return result, findings
