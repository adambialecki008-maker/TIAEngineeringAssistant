"""Offline, evidence-first index of every available Siemens PLC XML source.

Runs only on bytes already exported by Openness. No TIA API, code execution,
LLM request, online CPU connection, project write or safety certification.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import json
import re
from typing import Mapping
from xml.etree import ElementTree as ET

from engine.tia_logic_rules import inspect_scl_boolean_logic


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _symbol(access: ET.Element) -> str:
    """Qualified PLC access path; retain indices as markers, not invented names."""
    symbol = next((x for x in access if _local(x.tag) == "Symbol"), None)
    if symbol is None:
        constant = next((x for x in access.iter() if _local(x.tag) == "ConstantValue"), None)
        return constant.text.strip() if constant is not None and constant.text else ""
    parts = []
    for member in symbol:
        name = _local(member.tag)
        if name == "Component":
            parts.append(member.get("Name", ""))
        elif name in ("Token", "Text") and (member.get("Text") or member.text) in ("[", "]"):
            # A symbolic array index is not necessarily constant, and must not
            # be thrown away when assessing whether two accesses are identical.
            parts.append((member.get("Text") or member.text or ""))
    return ".".join(p for p in parts if p and p not in ("[", "]"))


def _scl(st: ET.Element) -> str:
    """Reconstruct immediate StructuredText children including access operands."""
    chunks = []
    for part in st:
        kind = _local(part.tag)
        if kind == "Token":
            chunks.append(part.get("Text", ""))
        elif kind == "Blank":
            chunks.append(" " * min(30, int(part.get("Num", "1"))))
        elif kind == "NewLine":
            chunks.append("\n" * min(3, int(part.get("Num", "1"))))
        elif kind == "Text":
            chunks.append(part.text or "")
        elif kind == "Access":
            chunks.append(_symbol(part))
    return "".join(chunks)


def _plc_source(path: str) -> bool:
    return path.casefold().startswith("tia-project/plc/") and path.casefold().endswith(".xml")


def _name(path: str, obj: ET.Element) -> str:
    node = obj.find("./AttributeList/Name")
    if node is not None and node.text and node.text.strip():
        return node.text.strip()
    stem = path.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    return re.sub(r"^\d+_", "", stem)


def _compile_networks(block: ET.Element) -> list[ET.Element]:
    # Never scan nested interface/source elements as independent networks.
    return [x for x in block.iter() if x.tag == "SW.Blocks.CompileUnit"]


def _network_title(network: ET.Element) -> str:
    for item in network.iter():
        if item.get("CompositionName") != "Title":
            continue
        for text in item.iter("Text"):
            if text.text and text.text.strip():
                return text.text.strip()[:120]
    return ""


def _lad_writes(network: ET.Element) -> set[str]:
    """Conservative coil operand identification from FlgNet UIds and Wires.

    Other parts (e.g. MOVE outputs and calls) are NOT guessed as assignments.
    """
    flg = next((x for x in network.iter() if _local(x.tag) == "FlgNet"), None)
    if flg is None:
        return set()
    part_by_id = {}
    access_by_id = {}
    for part in flg.iter():
        kind = _local(part.tag)
        uid = part.get("UId")
        if kind == "Part" and uid:
            part_by_id[uid] = part.get("Name", "")
        elif kind == "Access" and uid:
            access_by_id[uid] = _symbol(part)
    writes = set()
    for wire in flg.iter():
        if _local(wire.tag) != "Wire":
            continue
        identifiers = [x.get("UId") for x in wire if _local(x.tag) == "IdentCon"]
        outputs = [x for x in wire if _local(x.tag) == "NameCon"
                   and x.get("Name", "").casefold() == "operand"]
        if not identifiers or not outputs:
            continue
        for connector in outputs:
            if part_by_id.get(connector.get("UId", "")) in {"Coil", "SCoil", "RCoil"}:
                writes.update(access_by_id[uid] for uid in identifiers
                              if uid in access_by_id and access_by_id[uid])
    return writes


_ASSIGNMENT = re.compile(
    r'(?<![\w.])([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\s*:=',
    re.IGNORECASE,
)
_CASE = re.compile(r"\bCASE\s+([^;\n]+?)\s+OF\b", re.IGNORECASE | re.DOTALL)
_CASE_LABEL = re.compile(r"(?m)^\s*(?:\d+(?:\s*,\s*\d+)*|[A-Za-z_]\w*)\s*:")
_CALL_SCL = re.compile(r"\b([A-Za-z_]\w*)\s*\(", re.IGNORECASE)
_KEYWORDS = {"IF", "ELSIF", "CASE", "FOR", "WHILE", "REGION", "NOT", "AND",
             "OR", "XOR", "TO", "BY", "RETURN", "CONCAT", "SIZEOF"}


def analyze_exported_plc(files: Mapping[str, bytes]) -> dict:
    """Analyze *all* exported PLC XML with auditable, bounded output.

    Results are indexes/evidence and review hypotheses, not validated defects.
    """
    paths = sorted(p for p in files if _plc_source(p))
    blocks = []
    errors = []
    call_edges = []
    readers: dict[str, set[str]] = defaultdict(set)
    writers: dict[str, set[str]] = defaultdict(set)
    kinds = Counter()
    languages = Counter()
    groups = Counter()
    total_networks = 0
    networks_with_lad_wires = 0
    logic_findings = []
    logic_stats = Counter()
    for path in paths:
        try:
            root = ET.fromstring(files[path])
        except (ET.ParseError, ValueError) as exc:
            errors.append({"path": path, "error": str(exc)[:180]})
            continue
        program = next((child for child in root if child.tag.startswith("SW.Blocks.")
                        or child.tag.startswith("SW.Types.")), None)
        if program is None:
            errors.append({"path": path, "error": "No PLC block/type root"})
            continue
        kind = program.tag.split(".")[-1]
        block_name = _name(path, program)
        source_id = path
        kinds[kind] += 1
        parts = path.split("/")
        group = "/".join(parts[5:-1]) if len(parts) > 6 else "root"
        groups[group] += 1
        active = {"path": path, "plc": parts[3] if len(parts) > 3 else "",
                  "name": block_name, "type": kind, "group": group,
                  "languages": {}, "network_count": 0, "calls": [],
                  "case_statements": [], "global_references": 0,
                  "scl_writes": [], "lad_coil_writes": [],
                  "network_samples": []}
        scl_written = set()
        coil_written = set()
        block_calls = set()
        for idx, network in enumerate(_compile_networks(program), 1):
            lang = network.findtext("./AttributeList/ProgrammingLanguage") or "Unknown"
            languages[lang] += 1
            active["languages"][lang] = active["languages"].get(lang, 0) + 1
            active["network_count"] += 1
            total_networks += 1
            title = _network_title(network)
            found_calls = set()
            access_count = 0
            for el in network.iter():
                tag = _local(el.tag)
                if tag == "CallInfo":
                    target = el.get("Name", "").strip()
                    if target:
                        found_calls.add(target)
                elif tag == "Access" and el.get("Scope") == "GlobalVariable":
                    signal = _symbol(el)
                    if signal:
                        readers[signal].add(source_id)
                        access_count += 1
            text_fragments = []
            for st in network.iter():
                if _local(st.tag) == "StructuredText":
                    text_fragments.append(_scl(st))
            for fragment in text_fragments:
                if lang == "SCL":
                    found, inspected = inspect_scl_boolean_logic(
                        fragment, path=path, block=block_name,
                        plc=parts[3] if len(parts) > 3 else "", network=idx,
                    )
                    logic_findings.extend(found)
                    logic_stats.update(inspected)
                for signal in _ASSIGNMENT.findall(fragment):
                    scl_written.add(signal)
                    writers[signal].add(source_id)
                for call in _CALL_SCL.findall(fragment):
                    if call.upper() not in _KEYWORDS and call.lower().startswith(("fc_", "fb_")):
                        found_calls.add(call)
                for match in _CASE.finditer(fragment):
                    state = " ".join(match.group(1).split())[:100]
                    # Labels are syntactic candidates, not confirmed transitions.
                    scope = fragment[match.end():]
                    end_match = re.search(r"\bEND_CASE\b", scope, re.IGNORECASE)
                    segment = scope[:end_match.start()] if end_match else scope
                    labels = list(_CASE_LABEL.finditer(segment))
                    # A syntactic map of candidate state changes only. Nested
                    # CASE and branch conditions require source verification.
                    assignments = re.compile(
                        r"(?<![\w.])" + re.escape(state)
                        + r"\s*:=\s*(\d+)\b", re.IGNORECASE,
                    ) if state and re.fullmatch(r"[#\w.]+", state) else None
                    transitions = []
                    if assignments:
                        for branch_index, label in enumerate(labels[:300]):
                            finish = (labels[branch_index + 1].start()
                                      if branch_index + 1 < len(labels)
                                      else len(segment))
                            candidate_targets = sorted(set(
                                assignments.findall(segment[label.end():finish])
                            ))
                            if candidate_targets:
                                transitions.append({
                                    "state_label": label.group().strip().rstrip(":"),
                                    "target_candidates": candidate_targets[:40],
                                })
                    active["case_statements"].append({
                        "network": idx, "state_expression": state,
                        "label_count_estimate": len(labels),
                        "has_end_case": bool(end_match),
                        "transition_candidates": transitions[:150],
                        "evidence_limitations": "Textual assignments only; "
                            "conditions, nested CASE and runtime sequence not proven.",
                    })
            coils = _lad_writes(network) if lang in {"LAD", "F_LAD", "FBD", "F_FBD"} else set()
            if lang in {"LAD", "F_LAD", "FBD", "F_FBD"}:
                if any(_local(n.tag) == "Wires" for n in network.iter()):
                    networks_with_lad_wires += 1
            coil_written.update(coils)
            for signal in coils:
                writers[signal].add(source_id)
            for target in found_calls:
                block_calls.add(target)
                call_edges.append({"from": path, "to_name": target, "network": idx})
            if access_count and len(active["network_samples"]) < 5:
                active["network_samples"].append({
                    "network": idx, "language": lang, "title": title,
                    "global_accesses": access_count, "calls": sorted(found_calls)[:15],
                })
        active["calls"] = sorted(block_calls)
        active["scl_writes"] = sorted(scl_written)
        active["lad_coil_writes"] = sorted(coil_written)
        active["global_references"] = sum(1 for signal in readers if source_id in readers[signal])
        # Absolute paths and network indexes are retained to reopen evidence.
        blocks.append(active)
    known = defaultdict(list)
    for b in blocks:
        known[b["name"].casefold()].append(b["path"])
    for edge in call_edges:
        candidates = known.get(edge["to_name"].casefold(), [])
        edge["resolved_paths"] = candidates
        edge["resolution"] = "unique" if len(candidates) == 1 else (
            "ambiguous" if candidates else "external_or_unresolved"
        )
    cross_refs = []
    for signal in sorted(readers.keys() | writers.keys()):
        rs = readers.get(signal, set())
        ws = writers.get(signal, set())
        if not (rs or ws):
            continue
        cross_refs.append({
            "signal": signal, "writers": sorted(ws), "referenced_in": sorted(rs),
        })
    multiple_writers = [
        {"signal": x["signal"], "writer_count": len(x["writers"]),
         "writer_paths": x["writers"][:15],
         "note": "Multiple writing blocks (SCL assignment / LAD coil only). "
                 "May be intentional; review execution order and modes."}
        for x in cross_refs if len(x["writers"]) > 1
    ]
    multiple_writers.sort(key=lambda x: (-x["writer_count"], x["signal"]))
    coverage = {
        "plc_xml_in_archive": len(paths),
        "plc_xml_parsed": len(blocks),
        "plc_xml_parse_failed": len(errors),
        "network_count": total_networks,
        "lad_fbd_networks_with_wires": networks_with_lad_wires,
        "block_types": dict(sorted(kinds.items())),
        "network_languages": dict(sorted(languages.items())),
        "groups": dict(sorted(groups.items())),
        "boolean_logic": {
            **dict(sorted(logic_stats.items())),
            "findings": len(logic_findings),
            "duplicate_operands": sum(x["rule"] == "SCL_DUPLICATE_AND_OPERAND"
                                      for x in logic_findings),
            "opposing_status_overlaps": sum(x["rule"] == "SCL_OPPOSING_STATUS_OVERLAP"
                                             for x in logic_findings),
        },
        "note": "All available PLC XMLs were parsed if no errors; this does NOT "
                "mean all LAD/FBD signal-flow or runtime paths were proven.",
    }
    return {
        "schema_version": 1,
        "scope": "all_available_plc_xml",
        "method": "offline Siemens XML structural parsing; conservative SCL writes "
                  "and LAD coil writes; no PLC execution",
        "coverage": coverage,
        "parse_errors": errors,
        "blocks": blocks,
        "call_edges": call_edges,
        "signals": cross_refs,
        "review_candidates": {"multiple_writing_blocks": multiple_writers},
        "logic_findings": sorted(logic_findings, key=lambda x: (
            x["source_path"], x["network"], x["rule"], x.get("if_ordinal", 0),
        )),
        "limitations": [
            "Boolean overlap findings prove expression satisfiability only. "
            "They do not prove reachable machine states, Safety defects or runtime behavior.",
            "Complex Siemens expressions and nested IFs are counted but not inferred; "
            "unsupported syntax is never treated as an error.",
            "SCL extraction may not preserve all expression/index constructs; "
            "write recognition is best-effort and must be checked against source XML.",
            "LAD/FBD Wires are inspected and coil operands resolved; complete "
            "Boolean/signal flow, MOVE outputs and indirect writes are NOT inferred.",
            "Unresolved calls may be built-in or third-party functions; not automatically bugs.",
            "A shared signal writer or absent local timeout is not automatically a defect.",
            "Missing/protected F-blocks cannot be examined. No Safety validation.",
        ],
    }


def audit_artifacts(audit: dict, static_coverage: Mapping) -> dict[str, bytes]:
    coverage = audit["coverage"]
    parsed = coverage["plc_xml_parsed"]
    total = coverage["plc_xml_in_archive"]
    blocks = audit["blocks"]
    ranked = sorted(blocks, key=lambda b: (-b["network_count"], b["path"]))
    calls = Counter(edge["to_name"] for edge in audit["call_edges"])
    relevant = audit["review_candidates"]["multiple_writing_blocks"]
    findings = audit.get("logic_findings", [])
    logic_coverage = coverage.get("boolean_logic", {})
    summary = [
        "# TIA Engineering Assistant — offline PLC engineering inventory", "",
        "**This is a structural analysis, NOT a confirmed defect list or Safety validation.**",
        f"PLC XML parsed: **{parsed}/{total}**; parse failures: **{len(audit['parse_errors'])}**.",
        f"Networks inspected: **{coverage['network_count']}**; "
        f"LAD/FBD networks containing Wires: **{coverage['lad_fbd_networks_with_wires']}**.",
        f"Call edges: **{len(audit['call_edges'])}**; indexed signals: **{len(audit['signals'])}**.",
        f"Potential shared-writer signals: **{len(relevant)}** (unverified review candidates).",
        f"SCL Boolean conditions parsed: **{logic_coverage.get('simple_boolean_conditions', 0)}**; "
        f"unsupported: **{logic_coverage.get('unsupported_boolean_conditions', 0)}**.",
        f"Evidence-based Boolean findings: **{len(findings)}** "
        "(not proof of machine failure).",
        "", "## Evidence-based SCL logic review",
        *[
            f"- **{x['priority']}** {x['rule']} — "
            f"{x['block']} (network {x['network']}) — "
            f"`{x['source_path']}`"
            for x in findings[:70]
        ],
        *(["- Further details in review/LOGIC_FINDINGS.json."] if len(findings) > 70 else []),
        "", "## Languages",
        *[f"- {name}: {count} networks" for name, count in coverage["network_languages"].items()],
        "", "## Source groups",
        *[f"- {group}: {count} XML sources" for group, count in
          sorted(coverage["groups"].items(), key=lambda x: (-x[1], x[0]))[:40]],
        "", "## Largest logic sources (inspect first)",
        *[f"- {b['name']} [{b['type']}] — {b['network_count']} networks — \`{b['path']}\`"
          for b in ranked[:20]],
        "", "## Frequently called blocks (calls, not fault counts)",
        *[f"- {name}: {count}" for name, count in calls.most_common(20)],
        "", "## Shared-writer candidates (not necessarily incorrect)",
        *[f"- {x['signal']}: {x['writer_count']} writers"
          for x in relevant[:25]],
        "", "## Next step for a human or LLM",
        "Read the relevant source XML for every claimed finding. Resolve call "
        "paths and PLC writes, verify LAD/FBD wiring and SCL array indexing, "
        "then cite exact evidence. Do not repeat unverified static P0s.",
        "", "## Coverage disclaimer",
        "Previously generated DETERMINISTIC_ANALYSIS.json is a sampled review "
        "and has separate limits. This full XML index does not guarantee "
        "exhaustive logical verification, runtime behavior or Safety integrity.",
    ]
    brief = [
        "# Compact LLM review briefing (no full-archive read required)", "",
        "Start here before opening individual PLC source XMLs.",
        "The Python offline pass indexed all available PLC files and mapped "
        "calls plus selected signal writes without spending LLM tokens.",
        "SOURCE OF TRUTH: review/ENGINEERING_AUDIT.json, "
        "review/ENGINEERING_SUMMARY.md and original tia-project/plc/*.xml.",
        "Do not diagnose from names or heuristics alone.", "",
        f"Parsed: {parsed}/{total} PLC XML, {coverage['network_count']} networks; "
        f"{len(audit['call_edges'])} call references; "
        f"{len(relevant)} shared-writer review candidates.", "",
        f"Source-grounded SCL Boolean findings: {len(findings)}.",
        "Read review/LOGIC_FINDINGS.json for condition evidence, counterexamples "
        "and precise XML paths; verify each against original Siemens sources.",
        "", "## Priority entry points by network count",
        *[f"- {b['name']}: {b['path']}" for b in ranked[:12]],
        "", "## Rules for the LLM",
        "Choose a subsystem; look up blocks and edges in ENGINEERING_AUDIT.json; "
        "load only needed XMLs; reconstruct LAD/FBD Parts + Wires; analyze "
        "SCL expressions including indices; cross-check writes with runtime "
        "order; produce a source-cited, confidence-rated finding or dismiss it.",
        "Do not claim full Safety assessment, SIL/PL, or functional correctness.",
        "See REVIEW_PROMPT_PL.md for the full audit structure.",
    ]
    logic_document = {
        "schema_version": 1,
        "scope": "all_available_scl_networks_in_exported_plc_xml",
        "coverage": logic_coverage,
        "disclaimer": "Satisfiable source expressions, not proven runtime or Safety defects. "
                      "Only simple supported IF Boolean expressions are evaluated.",
        "findings": findings,
    }
    return {
        "review/LOGIC_FINDINGS.json": (
            json.dumps(logic_document, ensure_ascii=False, sort_keys=True,
                       indent=2) + "\n").encode("utf-8"),
        "review/ENGINEERING_AUDIT.json": (
            json.dumps(audit, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":")) + "\n").encode("utf-8"),
        "review/ENGINEERING_SUMMARY.md": ("\n".join(summary) + "\n").encode("utf-8"),
        "review/LLM_BRIEF_PL.md": ("\n".join(brief) + "\n").encode("utf-8"),
    }
