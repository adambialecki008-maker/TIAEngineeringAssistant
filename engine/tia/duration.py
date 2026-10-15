"""Exact, fail-closed parsing for Siemens TIME and LTIME duration literals."""
from __future__ import annotations

import re


TIME_MIN = -(2 ** 31)
TIME_MAX = 2 ** 31 - 1
LTIME_MIN = -(2 ** 63)
LTIME_MAX = 2 ** 63 - 1

_LITERAL = re.compile(r"^(?P<prefix>LT|T)#(?P<sign>[+-]?)(?P<body>(?:\d+(?:ns|us|ms|s|m|h|d|w))(?:_\d+(?:ns|us|ms|s|m|h|d|w))*)$", re.I)
_PART = re.compile(r"(\d+)(ns|us|ms|s|m|h|d|w)", re.I)
_NANOSECONDS = {"ns": 1, "us": 1_000, "ms": 1_000_000, "s": 1_000_000_000,
                "m": 60_000_000_000, "h": 3_600_000_000_000,
                "d": 86_400_000_000_000, "w": 604_800_000_000_000}


def normalize_duration_literal(value: str, data_type: str) -> str:
    """Validate and canonically spell a T#/LT# literal without floats.

    Weeks are an explicit seven-day duration. Months and years deliberately do
    not exist here because Siemens TIME/LTIME are durations, not calendars.
    """
    text = (value or "").strip()
    match = _LITERAL.fullmatch(text)
    if not match:
        raise ValueError("Duration Start value must be a Siemens T# or LT# literal.")
    kind = data_type.casefold()
    prefix = match["prefix"].upper()
    if kind == "time" and prefix != "T":
        raise ValueError("TIME Start value must use a T# literal.")
    if kind == "ltime" and prefix != "LT":
        raise ValueError("LTIME Start value must use an LT# literal.")
    parts = [(int(amount), unit.casefold()) for amount, unit in _PART.findall(match["body"])]
    if any(not amount for amount, _ in parts):
        raise ValueError("Duration components must be greater than zero.")
    if kind == "time" and any(unit in {"ns", "us"} for _, unit in parts):
        raise ValueError("TIME supports millisecond precision; use LTIME for ns or us.")
    nanoseconds = sum(amount * _NANOSECONDS[unit] for amount, unit in parts)
    sign = -1 if match["sign"] == "-" else 1
    nanoseconds *= sign
    if kind == "time":
        if nanoseconds % _NANOSECONDS["ms"]:
            raise ValueError("TIME must be an exact millisecond duration.")
        milliseconds = nanoseconds // _NANOSECONDS["ms"]
        if not TIME_MIN <= milliseconds <= TIME_MAX:
            raise ValueError("TIME Start value out of range.")
    elif kind == "ltime":
        if not LTIME_MIN <= nanoseconds <= LTIME_MAX:
            raise ValueError("LTIME Start value out of range.")
    else:
        raise ValueError("Duration validation is only available for TIME and LTIME.")
    canonical_parts = "_".join(f"{amount}{unit}" for amount, unit in parts)
    return f"{prefix}#{match['sign']}{canonical_parts}"


def duration_literal_from_quantity(quantity: int, unit: str, data_type: str) -> str:
    """Build then validate an exact literal from the UI's integer quantity."""
    if not isinstance(quantity, int):
        raise ValueError("Duration quantity must be an integer.")
    prefix = "LT" if data_type.casefold() == "ltime" else "T"
    sign = "-" if quantity < 0 else ""
    return normalize_duration_literal(f"{prefix}#{sign}{abs(quantity)}{unit}", data_type)
