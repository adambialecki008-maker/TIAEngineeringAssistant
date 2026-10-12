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


# High-confidence Polish operator/HMI vocabulary. A positive match must not
# result in a machine translation request when the target culture is pl-PL:
# many TIA exports use en-US* as a slot while containing Polish text.
_POLISH_HMI_WORDS = frozenset({
    "awaria", "awarii", "alarmowy", "ostrzezenie", "ostrzezenia",
    "pneumatyczna", "pneumatyczne", "pneumatyczny", "pneumatycznego",
    "hydrauliczna", "hydrauliczne", "hydrauliczny", "hydraulicznego",
    "wozek", "wozka", "wozku", "poprzeczny", "poprzeczna",
    "naciagnij", "naciaganie", "napnij", "linke", "linka", "linki",
    "poziom", "oleju", "agregacie", "glownym", "uzupelnij",
    "czujnik", "czujnika", "szafce", "zaworem", "zaworu",
    "brak", "cisnienia", "napiecia", "niski", "wysoki",
    "glowna", "szafa", "szafie", "podajnik", "przesuw", "przesun",
    "zamkniety", "otwarty", "otworz", "zamknij", "przy",
    "uszkodzony", "uruchom", "wylacz", "wlacz", "sprawdz",
    "maszyna", "maszyny", "silnika", "pompy", "pompa", "pompe",
    "chlodnicy", "hydrauliki", "sygnal", "nieaktywny",
    "od", "strony", "strona", "stronie", "karuzela", "karuzeli",
    "stanowisko", "stanowiska", "pozycja", "pozycje", "pozycji",
    "wózek", "wózka", "tor", "toru", "powrot", "powrotu",
    "lewy", "lewa", "prawej", "prawy", "stacji", "skladania",
    "naped", "napedu", "wrotny", "podnoszenie", "opuszczanie",
    "podnies", "opusc", "przenosnik", "transport", "przyciski",
    "panel", "aktywny", "blokada", "zabezpieczenie", "poczatek",
    "wysun", "wciagnij", "warunki", "pracy", "silownikow",
    "sterowanie", "zalaczone", "wciaganie", "klatki", "schodowej",
    "koniec", "ustaw", "pozycjonowanie", "wymagane",
})
_ENGLISH_MARKERS = frozenset({
    "the", "and", "with", "without", "please", "press", "pull",
    "pressure", "temperature", "sensor", "warning", "error",
    "fault", "hydraulic", "pneumatic", "cable", "rope", "line",
    "ready", "valve", "conveyor", "open", "closed", "low", "high",
})


def is_likely_polish_hmi_source(source: str, target_culture: str = "pl-PL") -> bool:
    """High-precision source-copy guard, not a general language detector.

    Avoid rewriting Polish user text that TIA exports in the en-US* slot.
    Ambiguous or mixed-language sources still go to Ollama for translation.
    """
    if not target_culture.casefold().startswith("pl") or not isinstance(source, str):
        return False
    words = set(_tokens(source))
    return bool(words & _POLISH_HMI_WORDS) and not bool(
        words & _ENGLISH_MARKERS
    )


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

    # The source is already recognizably Polish. Large lexical drift in
    # an existing Polish target can be legitimate, so this is a warning
    # only and never triggers automatic rewriting of the TIA workbook.
    if is_likely_polish_hmi_source(source, target_culture):
        # Once we can establish the source is already Polish, an AI rewrite
        # has no translation benefit and can corrupt technical meaning.
        # Permit only diacritic/case/whitespace normalization, including TIA's
        # literal backslash-n versus a real line break.
        def canonical(text: str) -> str:
            return " ".join(
                _fold(
                    text.replace(r"\n", " ").replace(r"\r", " ")
                    .replace("ł", "l")
                ).split()
            )
        if canonical(source) != canonical(target):
            reasons.append(
                "Source is already Polish; unexpected paraphrase. "
                "Copy the source unchanged or correct only diacritics/spacing."
            )

    return reasons
