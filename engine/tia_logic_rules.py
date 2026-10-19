"""Conservative PLC boolean-rule checks using reconstructed Siemens SCL.

No LLM, runtime PLC access or safety certification. Every reported finding has
a source path, compilation-unit/network ordinal and a reproducible condition.
Unknown syntax is skipped rather than guessed.
"""
from __future__ import annotations

from collections import Counter
from itertools import combinations, product
import re
from typing import Any


_IF = re.compile(r"\bIF\s+(.*?)\s+THEN\b", re.IGNORECASE | re.DOTALL)
_SIMPLE_IF = re.compile(
    r"\bIF\s+(.*?)\s+THEN\s+(.*?)\s+ELSE\s+(.*?)\s+END_IF\s*;?",
    re.IGNORECASE | re.DOTALL,
)
_ASSIGN = re.compile(
    r"^\s*(#?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*:=\s*(TRUE|FALSE)\s*;\s*$",
    re.IGNORECASE,
)
_TOKEN = re.compile(
    r"\s*(\(|\)|[A-Za-z_#][\w#]*(?:\.[A-Za-z_]\w*)*)",
    re.IGNORECASE,
)
_ALLOWED = {"NOT", "AND", "OR", "TRUE", "FALSE"}
_STOP = re.compile(r"(?:stopped|stoped)$", re.IGNORECASE)
_RUN = re.compile(r"(?:ison|running)$", re.IGNORECASE)


def _tokens(source: str) -> list[str] | None:
    """Tokenize *all* characters; unsupported Siemens expressions are skipped."""
    output = []
    pos = 0
    while pos < len(source):
        if not source[pos:].strip():
            break
        match = _TOKEN.match(source, pos)
        if not match:
            return None
        output.append(match.group(1))
        pos = match.end()
        if len(output) > 150:
            return None
    return output


class _BoolReader:
    def __init__(self, tokens: list[str]):
        self.tokens = tokens
        self.position = 0

    def next(self):
        return self.tokens[self.position].upper() if self.position < len(self.tokens) else ""

    def pop(self):
        token = self.next()
        self.position += 1
        return token

    def atom(self):
        if self.next() == "NOT":
            self.pop()
            return ("not", self.atom())
        if self.next() == "(":
            self.pop()
            child = self.or_expr()
            if self.pop() != ")":
                raise ValueError("Missing closing parenthesis")
            return child
        token = self.next()
        if not token or token in {"AND", "OR", ")"}:
            raise ValueError("Invalid operand")
        self.pop()
        if token in {"TRUE", "FALSE"}:
            return ("const", token == "TRUE")
        return ("var", token)

    def and_expr(self):
        node = self.atom()
        while self.next() == "AND":
            self.pop()
            node = ("and", node, self.atom())
        return node

    def or_expr(self):
        node = self.and_expr()
        while self.next() == "OR":
            self.pop()
            node = ("or", node, self.and_expr())
        return node


def _parse(source: str):
    tokens = _tokens(source)
    if not tokens:
        return None
    try:
        reader = _BoolReader(tokens)
        node = reader.or_expr()
        return node if reader.position == len(tokens) else None
    except (ValueError, IndexError, RecursionError):
        return None


def _variables(tree) -> set[str]:
    kind = tree[0]
    if kind == "var":
        return {tree[1]}
    if kind == "const":
        return set()
    if kind == "not":
        return _variables(tree[1])
    return _variables(tree[1]) | _variables(tree[2])


def _value(tree, assigned: dict[str, bool]) -> bool:
    kind = tree[0]
    if kind == "var":
        return assigned[tree[1]]
    if kind == "const":
        return tree[1]
    if kind == "not":
        return not _value(tree[1], assigned)
    if kind == "and":
        return _value(tree[1], assigned) and _value(tree[2], assigned)
    return _value(tree[1], assigned) or _value(tree[2], assigned)


def _and_literals(tree) -> list[tuple[str, bool]] | None:
    kind = tree[0]
    if kind == "and":
        left = _and_literals(tree[1])
        right = _and_literals(tree[2])
        return left + right if left is not None and right is not None else None
    if kind == "var":
        return [(tree[1], True)]
    if kind == "not" and tree[1][0] == "var":
        return [(tree[1][1], False)]
    return None


def _opposites(first: str, second: str) -> bool:
    if "." in first and "." in second and first.rsplit(".", 1)[0] != second.rsplit(".", 1)[0]:
        return False
    a = first.rsplit(".", 1)[-1]
    b = second.rsplit(".", 1)[-1]
    return bool(
        _STOP.search(a) and _RUN.search(b)
        and _STOP.sub("", a).casefold() == _RUN.sub("", b).casefold()
        or _STOP.search(b) and _RUN.search(a)
        and _STOP.sub("", b).casefold() == _RUN.sub("", a).casefold()
    )


def _simple_assignment(branch: str):
    match = _ASSIGN.fullmatch(branch)
    if not match:
        return None
    return match.group(1), match.group(2).upper() == "TRUE"


def _witness(left: dict, right: dict) -> dict[str, bool] | None:
    variables = sorted(_variables(left["ast"]) | _variables(right["ast"]))
    if len(variables) > 12:
        return None
    # Prefer a sparse reproducible counterexample rather than a random state.
    for active in range(len(variables) + 1):
        for enabled in combinations(variables, active):
            values = {name: name in enabled for name in variables}
            if (
                _value(left["ast"], values) == left["true_when"]
                and _value(right["ast"], values) == right["true_when"]
            ):
                return values
    return None


def inspect_scl_boolean_logic(
    source: str, *, path: str, block: str, plc: str, network: int,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Find redundant AND operands and provable status overlap in simple IFs.

    A witness proves only satisfiability of two source expressions, not actual
    machine operation or Safety. Unparsed IFs are explicitly counted.
    """
    found = []
    checked = 0
    skipped = 0
    branches = []
    for index, match in enumerate(_IF.finditer(source), 1):
        parsed = _parse(match.group(1))
        if parsed is None:
            skipped += 1
            continue
        checked += 1
        literals = _and_literals(parsed)
        if literals is not None:
            repeats = [key for key, count in Counter(literals).items() if count > 1]
            if repeats:
                found.append({
                    "rule": "SCL_DUPLICATE_AND_OPERAND",
                    "category": "confirmed_source_redundancy",
                    "priority": "P2",
                    "confidence": "high",
                    "block": block, "plc": plc, "source_path": path,
                    "network": network, "if_ordinal": index,
                    "condition": " ".join(match.group(1).split())[:800],
                    "repeated_operands": [
                        {"signal": signal, "negated": not positive}
                        for signal, positive in repeats
                    ],
                    "evidence": "Identical Boolean operand occurs more than once in the same AND clause.",
                    "impact": "May indicate a copy/paste error; no missing signal is inferred without other evidence.",
                    "verification": "Compare input feedbacks and the intended condition in TIA; test the affected status transitions.",
                })

    # Match strictly uncomplicated IF THEN assignment ELSE assignment END_IF,
    # reject nested logic rather than incorrectly interpreting its branches.
    for match in _SIMPLE_IF.finditer(source):
        body_true, body_false = match.group(2), match.group(3)
        if re.search(r"\b(?:IF|ELSIF|CASE|FOR|WHILE)\b", body_true + body_false, re.I):
            continue
        a, b = _simple_assignment(body_true), _simple_assignment(body_false)
        condition = _parse(match.group(1))
        if not (a and b and condition and a[0].casefold() == b[0].casefold()
                and a[1] != b[1]):
            continue
        branches.append({
            "target": a[0], "true_when": a[1], "ast": condition,
            "condition": " ".join(match.group(1).split())[:800],
        })

    for left, right in combinations(branches, 2):
        if not _opposites(left["target"], right["target"]):
            continue
        if len(_variables(left["ast"]) | _variables(right["ast"])) > 12:
            skipped += 1
            continue
        sample = _witness(left, right)
        if sample is None:
            continue
        found.append({
            "rule": "SCL_OPPOSING_STATUS_OVERLAP",
            "category": "confirmed_source_condition_overlap",
            "priority": "P1",
            "confidence": "high_for_source_conditions",
            "block": block, "plc": plc, "source_path": path,
            "network": network,
            "targets": [left["target"], right["target"]],
            "conditions": [left["condition"], right["condition"]],
            "counterexample": sample,
            "evidence": "Both nominally opposing Boolean status outputs can evaluate TRUE in these source IF conditions.",
            "impact": "Potentially inconsistent operating-status flags; downstream use and runtime scan order require inspection.",
            "verification": "Check every writer and consumer, confirm intended signal mapping and replay the input combination in simulation.",
        })
    return found, {"simple_boolean_conditions": checked,
                   "unsupported_boolean_conditions": skipped,
                   "simple_status_assignments": len(branches)}
