"""Conservative safety rules for TIA HMI text imports.

Default workflow fills missing destination values only. Existing non-placeholder
translations are never overwritten by a generative model.
"""
import re
from collections import Counter

from fastapi import HTTPException


def needs_target_fill(source: str, target: str) -> bool:
    """True only for a missing value or TIA's generic 'Text' placeholder."""
    source = (source or "").strip()
    target = (target or "").strip()
    if not source or not any(c.isalpha() for c in source):
        return False
    # Literal source 'Text' is an actual, ambiguous label, not a safe candidate.
    if source.casefold() == "text":
        return False
    return not target or target.casefold() == "text"


def _reject_unsafe_proposal(source: str, translated: str, problem: str) -> None:
    """Make translation errors actionable without silently accepting AI output."""
    raise HTTPException(
        status_code=502,
        detail=(
            "Unsafe Ollama translation rejected BEFORE TIA import: "
            + problem + ". Source: " + repr(source[:100])
            + "; proposed: " + repr(translated[:100])
            + ". Do not import this result. If the source label is already "
            + "in the target language (for example Polish -> pl-PL), "
            + "select Text handling: 'Copy original Polish labels into "
            + "missing target cells (no AI)', then scan/prepare again. "
            + "For text in another language, select a suitable model and "
            + "prepare a new, corrected proposal for review before importing."
        ),
    )


def validate_hmi_translation(source: str, translated: str) -> None:
    """Reject structurally damaged translations before ANY TIA import."""
    if not isinstance(translated, str) or not translated.strip():
        raise HTTPException(502, "Translation returned empty text.")
    if translated.strip().casefold() == "text" and source.strip().casefold() != "text":
        raise HTTPException(502, "Translation returned the placeholder 'Text'.")

    # Preserve numbered instruction prefixes without treating the following
    # human-language word as part of an identifier: "1.Naciagnij" is prose,
    # NOT a PLC tag. Accept spelling/diacritic corrections after "1.".
    step_prefix = r"(?m)^[ \t]*(\d+[.)])(?=\s*[^\W\d_])"
    if re.findall(step_prefix, source) != re.findall(step_prefix, translated):
        _reject_unsafe_proposal(
            source, translated, "changed numbered instruction prefix",
        )

    # Keep syntactic delimiters, used as status/parameter indicators in HMI.
    for ch in "(){}[]":
        if source.count(ch) != translated.count(ch):
            _reject_unsafe_proposal(
                source, translated, "changed count of '" + ch + "' delimiters"
            )

    # Braced placeholders like {0}, {tag} and format markers must be unchanged.
    placeholders = r"\{[^{}]+\}|%(?:\d+\$)?[-+#0 .\d]*[a-zA-Z%]|\$\{[^{}]+\}"
    if Counter(re.findall(placeholders, source)) != Counter(re.findall(placeholders, translated)):
        _reject_unsafe_proposal(
            source, translated, "changed a dynamic placeholder"
        )

    # PLC identifiers require both a letter and a digit in the identifier
    # itself (e.g. 212BP2, M10.0, DB1.DBX2.0, I0.0, QW128).
    # Pure numeric prefixes followed by a dot and a word are NOT identifiers.
    plc_identifier = (
        r"(?<!\w)(?:"
        r"[A-Za-z]+\d+[A-Za-z0-9]*(?:\.(?:[A-Za-z]+\d+[A-Za-z0-9]*|\d+))*"
        r"|"
        r"\d+[A-Za-z]+\d*[A-Za-z0-9]*(?:\.(?:[A-Za-z]+\d+[A-Za-z0-9]*|\d+))*"
        r")(?!\w)"
    )
    ids = Counter(re.findall(plc_identifier, source))
    found = Counter(re.findall(plc_identifier, translated))
    if ids != found:
        _reject_unsafe_proposal(
            source, translated,
            "changed HMI/PLC identifier(s): expected "
            + repr(dict(ids)) + ", proposed " + repr(dict(found)),
        )
