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

    # Keep PLC/tag identifiers with mixed letters+digits (212BP2, M10.0 etc.).
    ids = re.findall(r"(?<!\w)[A-Za-z]*\d+[A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*(?!\w)", source)
    for identifier in ids:
        if identifier not in translated:
            _reject_unsafe_proposal(
                source, translated,
                "changed HMI/PLC identifier " + repr(identifier),
            )
