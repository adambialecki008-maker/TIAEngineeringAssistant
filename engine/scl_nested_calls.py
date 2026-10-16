"""Bounded read-only scanner of SCL user FB/FC call expressions.

This is deliberately a lexical call-site extractor, not a TIA SCL compiler.
It observes parenthesis nesting and quoted tokens without inferring PLC runtime
semantics, implicit conversions, or the validity of control flow.
"""
from __future__ import annotations

from dataclasses import dataclass
import re

_TOKEN = re.compile(
    r"(?P<string>'(?:''|[^'])*')"
    r'|(?P<symbol>"(?:""|[^"])*")'
    r"|(?P<name>[A-Za-z_][A-Za-z0-9_]*)"
    r"|(?P<other>\S)"
)


@dataclass(frozen=True)
class SclCallSite:
    name: str
    line: int
    after_open: int
    begin: int
    finish: int | None


@dataclass(frozen=True)
class _Token:
    value: str
    kind: str
    line: int
    col: int


def scan_scl_call_sites(lines: list[str]) -> list[SclCallSite]:
    """Return candidate syntactic calls in the first SCL executable body.

    Caller must resolve candidates against declared instances or loaded FB/FC
    names. Broken parentheses are retained for partial/unverified reporting.
    """
    tokens: list[_Token] = []
    in_body = False
    ended = False
    for line_number, line in enumerate(lines, 1):
        marker = line.strip().upper()
        if marker == "BEGIN" and not ended:
            in_body = True
            continue
        if in_body and marker in {
            "END_FUNCTION", "END_FUNCTION_BLOCK", "END_ORGANIZATION_BLOCK",
        }:
            in_body = False
            ended = True
            continue
        if not in_body:
            continue
        for match in _TOKEN.finditer(line):
            tokens.append(_Token(
                value=match.group(), kind=match.lastgroup or "other",
                line=line_number, col=match.start(),
            ))

    # Parenthesis pairing includes grouping, indexed expressions and nested
    # function calls. A missing close remains None (caller marks incomplete).
    opened: list[int] = []
    closes: dict[int, int] = {}
    for pos, token in enumerate(tokens):
        if token.value == "(" and token.kind == "other":
            opened.append(pos)
        elif token.value == ")" and token.kind == "other" and opened:
            closes[opened.pop()] = pos

    candidates: list[SclCallSite] = []
    for i in range(len(tokens) - 1):
        token = tokens[i]
        if token.kind not in {"name", "symbol"}:
            continue
        if tokens[i + 1].value != "(" or tokens[i + 1].kind != "other":
            continue
        # No method/array-member or namespace inference for dotted calls.
        if i and tokens[i - 1].value == ".":
            continue
        # Siemens typed literals (T#..., INT#...) are not call expressions.
        if i and tokens[i - 1].value == "#":
            # A # before the name denotes a local symbolic instance, whereas
            # a typed literal would have # after the name, not before it.
            pass
        name = token.value
        if token.kind == "symbol":
            name = name[1:-1].replace('""', '"')
        candidates.append(SclCallSite(
            name=name, line=token.line, after_open=tokens[i + 1].col + 1,
            begin=i + 1, finish=closes.get(i + 1),
        ))
    return candidates
