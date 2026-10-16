"""Conservative SCL variable and interface usage analysis.

This is not a Siemens SCL compiler. Definite-assignment results are produced
only for a fully recognized single-block body with simple assignments and
bounded IF/ELSIF/ELSE and CASE/ELSE control flow. Unsupported constructs mark
the flow partial and suppress *all* read-before-write claims.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import re


_IDENT = r'(?:"[^"\r\n]+"|[A-Za-z_][A-Za-z0-9_]*)'
_ASSIGN = re.compile(r"^\s*(#?" + _IDENT + r")\s*:=\s*(.+?)\s*;\s*$", re.I)
_OPERAND = re.compile(r"#(" + _IDENT + r")")
_IF = re.compile(r"^\s*IF\s+(.+?)\s+THEN\s*$", re.I)
_ELSIF = re.compile(r"^\s*ELSIF\s+(.+?)\s+THEN\s*$", re.I)
_CASE = re.compile(r"^\s*CASE\s+(.+?)\s+OF\s*$", re.I)
_LABEL = re.compile(r"^\s*[A-Za-z0-9_]+(?:\s*,\s*[A-Za-z0-9_]+)*\s*:\s*$", re.I)
_END = {"END_FUNCTION", "END_FUNCTION_BLOCK", "END_ORGANIZATION_BLOCK"}
_UNSUPPORTED = ("FOR", "WHILE", "REPEAT", "UNTIL", "RETURN", "EXIT", "CONTINUE", "GOTO")
_MAX_NESTING = 24


@dataclass
class FlowEvent:
    kind: str
    variable: str
    line: int


@dataclass
class VariableSummary:
    name: str
    section: str
    reads: int | None = None
    writes: int | None = None
    assigned_on_exit: bool | None = None
    analysis_status: str = "partial"


@dataclass
class FlowResult:
    complete_body: bool = False
    complete_flow: bool = False
    summaries: list[VariableSummary] = field(default_factory=list)
    issues: list[FlowEvent] = field(default_factory=list)


@dataclass
class _Statement:
    kind: str
    line: int
    text: str = ""
    name: str = ""
    branches: list[tuple[str | None, list[_Statement]]] = field(default_factory=list)
    otherwise: list[_Statement] | None = None


class _UnsupportedSyntax(Exception):
    pass


def _normalized(name: str) -> str:
    name = name.removeprefix("#")
    if len(name) > 1 and name[0] == '"' and name[-1] == '"':
        name = name[1:-1]
    return name.casefold()


def _operands(expr: str) -> list[str]:
    return [_normalized(match.group(1)) for match in _OPERAND.finditer(expr)]


def _parse_body(body: list[tuple[int, str]]) -> list[_Statement]:
    """Parse only known line-based constructs; any ambiguity invalidates flow."""
    position = 0

    def walk(end: set[str], depth: int) -> list[_Statement]:
        nonlocal position
        if depth > _MAX_NESTING:
            raise _UnsupportedSyntax()
        output: list[_Statement] = []
        while position < len(body):
            lineno, line = body[position]
            stripped = line.strip()
            upper = stripped.upper()
            marker = (
                "ELSIF" if _ELSIF.fullmatch(stripped) else
                "ELSE" if upper == "ELSE" else
                "END_IF" if upper in {"END_IF", "END_IF;"} else
                "END_CASE" if upper in {"END_CASE", "END_CASE;"} else
                "LABEL" if _LABEL.fullmatch(stripped) else ""
            )
            if marker in end:
                return output
            if marker or any(upper.startswith(word + " ") for word in _UNSUPPORTED):
                raise _UnsupportedSyntax()
            if not stripped:
                position += 1
                continue
            if match := _IF.fullmatch(stripped):
                if "(" in match.group(1) or ")" in match.group(1):
                    raise _UnsupportedSyntax()
                position += 1
                branches = [(match.group(1), walk({"ELSIF", "ELSE", "END_IF"}, depth + 1))]
                while position < len(body) and _ELSIF.fullmatch(body[position][1].strip()):
                    cond = _ELSIF.fullmatch(body[position][1].strip()).group(1)
                    if "(" in cond or ")" in cond:
                        raise _UnsupportedSyntax()
                    position += 1
                    branches.append((cond, walk({"ELSIF", "ELSE", "END_IF"}, depth + 1)))
                alternative = None
                if position < len(body) and body[position][1].strip().upper() == "ELSE":
                    position += 1
                    alternative = walk({"END_IF"}, depth + 1)
                if position >= len(body) or body[position][1].strip().upper() not in {"END_IF", "END_IF;"}:
                    raise _UnsupportedSyntax()
                position += 1
                output.append(_Statement("if", lineno, branches=branches, otherwise=alternative))
                continue
            if match := _CASE.fullmatch(stripped):
                if "(" in match.group(1) or ")" in match.group(1):
                    raise _UnsupportedSyntax()
                position += 1
                branches: list[tuple[str | None, list[_Statement]]] = []
                alternative = None
                while position < len(body):
                    entry = body[position][1].strip()
                    marker = entry.upper()
                    if marker in {"END_CASE", "END_CASE;"}:
                        break
                    if marker == "ELSE":
                        position += 1
                        alternative = walk({"END_CASE"}, depth + 1)
                        break
                    if not _LABEL.fullmatch(entry):
                        raise _UnsupportedSyntax()
                    position += 1
                    branches.append((None, walk({"LABEL", "ELSE", "END_CASE"}, depth + 1)))
                if not branches or position >= len(body) or body[position][1].strip().upper() not in {"END_CASE", "END_CASE;"}:
                    raise _UnsupportedSyntax()
                position += 1
                output.append(_Statement("case", lineno, text=match.group(1), branches=branches, otherwise=alternative))
                continue
            match = _ASSIGN.fullmatch(stripped)
            if not match:
                raise _UnsupportedSyntax()
            lhs = match.group(1)
            rhs = match.group(2)
            # A function call or subexpression could have effects that this
            # static analyzer cannot model. Fail closed rather than guess.
            if "(" in rhs or ")" in rhs:
                raise _UnsupportedSyntax()
            output.append(_Statement("assign", lineno, rhs, _normalized(lhs)))
            position += 1
        if end:
            raise _UnsupportedSyntax()
        return output

    result = walk(set(), 0)
    if position != len(body):
        raise _UnsupportedSyntax()
    return result


def analyze_scl_variables(
    masked_lines: list[str],
    declarations: list[tuple[str, str, str]],
) -> FlowResult:
    """Analyze masked-comment, masked-string SCL source lines.

    Input declaration tuples: (name, section, data_type).
    Output counts are source-occurrence counts, not runtime execution counts.
    """
    result = FlowResult()
    names: dict[str, tuple[str, str, str]] = {}
    repeated: set[str] = set()
    for name, section, dtype in declarations:
        if "." in name or section.casefold() not in {"input", "output", "inout", "temp"}:
            continue
        key = name.casefold()
        if key in names:
            repeated.add(key)
        names[key] = (name, section, dtype)
    for key in repeated:
        names.pop(key, None)
    if not names:
        return result

    started = False
    finished = False
    body: list[tuple[int, str]] = []
    for number, text in enumerate(masked_lines, 1):
        token = text.strip().upper()
        if token == "BEGIN" and not finished:
            if started:
                return result
            started = True
            continue
        if started and token in _END:
            started = False
            finished = True
            continue
        if started:
            body.append((number, text))
    if started or not finished:
        return result
    result.complete_body = True

    observed = "\n".join(text for _, text in body)
    uses = {
        key for key in names
        if re.search(r"(?<![A-Za-z0-9_])" + re.escape(key) + r"(?![A-Za-z0-9_])", observed, re.I)
    }
    for key, (name, section, dtype) in names.items():
        if key not in uses and section.casefold() in {"temp", "input"}:
            result.issues.append(FlowEvent("unused_temp" if section.casefold() == "temp" else "unused_input", name, 0))
    try:
        statements = _parse_body(body)
    except _UnsupportedSyntax:
        result.summaries = [VariableSummary(name, section) for name, section, _ in names.values()]
        return result
    result.complete_flow = True
    counters: dict[str, list[int]] = {key: [0, 0] for key in names}
    reads_before: set[str] = set()
    scalar_temps = {
        key for key, (_, section, dtype) in names.items()
        if section.casefold() == "temp"
        and re.fullmatch(r"(?i:BOOL|SINT|USINT|INT|UINT|DINT|UDINT|LINT|ULINT|REAL|LREAL|BYTE|WORD|DWORD|LWORD)", dtype.strip())
    }

    def check_read(key: str, number: int, assigned: set[str]) -> None:
        if key not in names:
            return
        counters[key][0] += 1
        if key in scalar_temps and key not in assigned and key not in reads_before:
            reads_before.add(key)
            result.issues.append(FlowEvent("read_before_write", names[key][0], number))

    def evaluate(nodes: list[_Statement], incoming: set[str]) -> set[str]:
        assigned = set(incoming)
        for node in nodes:
            if node.kind == "assign":
                for key in _operands(node.text):
                    check_read(key, node.line, assigned)
                if node.name in counters:
                    counters[node.name][1] += 1
                    assigned.add(node.name)
            elif node.kind == "if":
                endpoints = []
                for condition, branch in node.branches:
                    for key in _operands(condition or ""):
                        check_read(key, node.line, assigned)
                    endpoints.append(evaluate(branch, assigned))
                endpoints.append(evaluate(node.otherwise, assigned) if node.otherwise is not None else set(assigned))
                assigned = set.intersection(*endpoints)
            elif node.kind == "case":
                for key in _operands(node.text):
                    check_read(key, node.line, assigned)
                endpoints = [evaluate(branch, assigned) for _, branch in node.branches]
                endpoints.append(evaluate(node.otherwise, assigned) if node.otherwise is not None else set(assigned))
                assigned = set.intersection(*endpoints)
        return assigned

    assigned_at_exit = evaluate(statements, set())
    result.summaries = [
        VariableSummary(
            name=name, section=section,
            reads=counters[key][0], writes=counters[key][1],
            assigned_on_exit=key in assigned_at_exit if section.casefold() in {"temp", "output"} else None,
            analysis_status="complete",
        )
        for key, (name, section, _) in names.items()
    ]
    for row in result.summaries:
        if row.section.casefold() == "output" and row.writes == 0 and row.name.casefold() not in uses:
            result.issues.append(FlowEvent("output_not_written", row.name, 0))
    return result
