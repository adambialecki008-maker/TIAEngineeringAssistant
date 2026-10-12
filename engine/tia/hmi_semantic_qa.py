"""Conservative, deterministic semantic QA for Polish industrial HMI labels.

These heuristics are NOT a translator or proof of correctness. They surface
explicit high-risk terminology drift for human correction. Do not use
Levenshtein distance or blanket 'all words must match' rules: valid
translations may legitimately use different phrasing.
"""
import re
import unicodedata


def _fold(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold())
    return "".join(char for char in value if not unicodedata.combining(char))


def _tokens(value: str) -> list[str]:
    return re.findall(r"[a-ząćęłńóśźż]+", _fold(value or "").replace("ł", "l"))


def semantic_qa_warnings(source: str, target: str,
                         target_culture: str = "pl-PL") -> list[str]:
    """Return review-worthy reasons, never automatically modify text.

    The high-confidence checks apply to Polish target text only. Sources
    already in Polish can be stored under the en-US* culture slot in TIA.
    """
    if not target_culture.casefold().startswith("pl"):
        return []
    if not source or not target or source.strip() == target.strip():
        return []
    src = _tokens(source)
    dst = _tokens(target)
    source_words, target_words = set(src), set(dst)
    if not source_words or not target_words:
        return []

    def has(words: set[str], stem: str) -> bool:
        return any(word.startswith(stem) for word in words)

    reasons = []
    # "Naciągnij linkę" must not turn into "Naciągnij linię".
    if has(source_words, "link") and not has(target_words, "link") \
            and has(target_words, "lini"):
        reasons.append("Technical meaning changed: linka (cable/rope) → linia (line).")

    # Explicit mechanism names are critical for operator diagnostics.
    for concept, stem in (
        ("hydraulika/hydrauliczny", "hydraul"),
        ("pneumatyka/pneumatyczny", "pneumat"),
    ):
        if has(source_words, stem) and not has(target_words, stem):
            reasons.append(
                "Technical mechanism missing or replaced: " + concept + "."
            )

    # Changing alarm to warning is unsafe. Preserve when both exist in
    # source (e.g. "ostrzeżenie, nie awaria") and the output preserves both.
    if has(source_words, "awar") and not has(target_words, "awar") \
            and has(target_words, "ostrz"):
        reasons.append(
            "Safety status changed or omitted: awaria versus ostrzeżenie."
        )
    if has(source_words, "ostrz") and not has(target_words, "ostrz") \
            and has(target_words, "awar"):
        reasons.append(
            "Safety status changed or omitted: ostrzeżenie versus awaria."
        )

    if has(source_words, "zawor") and not has(target_words, "zawor") \
            and has(target_words, "wentyl"):
        reasons.append(
            "Check technical terminology: zawór replaced with wentyl."
        )

    # Known hallucinated malformed label seen in exported TIA targets.
    if "cykliski" in target_words and "cykliski" not in source_words:
        reasons.append("Unexpected malformed word: 'cykliski'.")

    return reasons
