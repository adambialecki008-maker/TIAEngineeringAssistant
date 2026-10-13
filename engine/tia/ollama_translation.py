"""Local Ollama translation client for Siemens TIA HMI texts.

No OpenAI API key or external API service is required. Uses Ollama's
local /api/tags and /api/chat HTTP endpoints with a JSON-schema response.
"""
import json
import os
import socket
from collections.abc import Callable
from urllib import error as urllib_error
from urllib import request as urllib_request

from dotenv import load_dotenv
from fastapi import HTTPException

from engine.tia.hmi_semantic_qa import is_likely_polish_hmi_source

load_dotenv()

DEFAULT_BASE_URL = "http://127.0.0.1:11434"
DEFAULT_TIMEOUT = 300


def ollama_base_url() -> str:
    base = os.getenv("OLLAMA_BASE_URL", DEFAULT_BASE_URL).strip().rstrip("/")
    if not base.startswith(("http://", "https://")):
        raise HTTPException(422, "OLLAMA_BASE_URL must start with http:// or https://")
    return base


def _ollama_json(endpoint: str, payload: dict | None = None,
                 timeout: int = DEFAULT_TIMEOUT) -> dict:
    url = ollama_base_url() + endpoint
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = urllib_request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST" if data is not None else "GET",
    )
    try:
        with urllib_request.urlopen(request, timeout=timeout) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:400]
        raise HTTPException(
            502,
            "Ollama returned HTTP " + str(exc.code) + " for " + endpoint
            + ": " + detail,
        ) from exc
    except (urllib_error.URLError, ConnectionError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        if isinstance(reason, (TimeoutError, socket.timeout)):
            raise HTTPException(
                504, "Ollama did not respond before timeout at " + url,
            ) from exc
        raise HTTPException(
            503,
            "Cannot connect to Ollama at " + ollama_base_url()
            + ". Start Ollama (ollama serve) and verify it is running. "
            + str(getattr(exc, "reason", exc))[:200],
        ) from exc
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(502, "Ollama returned invalid JSON.") from exc

    if not isinstance(result, dict):
        raise HTTPException(502, "Ollama returned an unexpected response structure.")
    if result.get("error"):
        raise HTTPException(502, "Ollama error: " + str(result["error"])[:400])
    return result


def list_ollama_models() -> list[str]:
    result = _ollama_json("/api/tags", timeout=10)
    models = result.get("models")
    if not isinstance(models, list):
        raise HTTPException(502, "Ollama /api/tags did not return a models list.")
    names = [
        item.get("name") or item.get("model")
        for item in models if isinstance(item, dict)
    ]
    return sorted(set(name for name in names if isinstance(name, str) and name))


def resolve_ollama_model(requested: str | None = None,
                         available: list[str] | None = None) -> str:
    names = available if available is not None else list_ollama_models()
    if not names:
        raise HTTPException(
            503,
            "No Ollama models installed. Run 'ollama list' or 'ollama pull <model>'.",
        )

    preferred = (requested or "").strip()
    if not preferred:
        preferred = os.getenv("OLLAMA_TRANSLATION_MODEL", "").strip()
    if preferred:
        if preferred not in names:
            raise HTTPException(
                422,
                "Ollama model '" + preferred
                + "' is not installed. Available: " + ", ".join(names),
            )
        return preferred
    if len(names) == 1:
        return names[0]
    raise HTTPException(
        422, "Choose an Ollama translation model. Installed: " + ", ".join(names),
    )


def translate_ollama_batch(
    texts: list[str],
    target_culture: str,
    model_name: str,
) -> dict[str, str]:
    if not texts:
        return {}
    indexed = {str(index): text for index, text in enumerate(texts)}
    schema = {
        "type": "object",
        "properties": {key: {"type": "string"} for key in indexed},
        "required": list(indexed),
        "additionalProperties": False,
    }
    instructions = (
        "You translate industrial Siemens HMI/SCADA interface text. "
        "The TIA Portal source culture can be incorrect: detect the actual "
        "language separately for each item from its text. "
        "Translate into " + target_culture + ". The en-US* source column "
        "may contain Polish text despite its culture label. If a source is "
        "already in the target language, return the entire source string "
        "EXACTLY character-for-character. Do not paraphrase it, replace "
        "technical terms with synonyms, or translate a Polish word into "
        "another Polish word. Every item is independent; NEVER copy a word, "
        "label, prefix, suffix or technical description from a different item, "
        "from these instructions, or from an imagined machine context. "
        "Do not add explanations, annotations, type labels or clarifications "
        "(including parenthesized descriptions such as pneumatic/hydraulic). "
        "Preserve the EXACT number and placement of source parentheses, "
        "braces and square brackets: do not add, remove or relocate delimiters. "
        "Preserve PLC/IO identifiers, tags, variables, placeholders, "
        "measurement units, newlines and numbers unchanged. "
        "If the input is already Polish (even with missing diacritics), "
        "do not invent content. "
        "Do not replace meaningful words with placeholder 'Text'. "
        "Respond with a JSON object mapping each provided numeric key "
        "to one translated string; no prose."
    )
    payload = {
        "model": model_name,
        "stream": False,
        "format": schema,
        "options": {"temperature": 0},
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": json.dumps(indexed, ensure_ascii=False)},
        ],
    }
    result = _ollama_json("/api/chat", payload, timeout=DEFAULT_TIMEOUT)
    if result.get("done") is False:
        raise HTTPException(502, "Ollama translation did not finish.")
    message = result.get("message") or {}
    output = message.get("content") if isinstance(message, dict) else None
    if not isinstance(output, str) or not output.strip():
        raise HTTPException(502, "Ollama returned no translation text.")
    try:
        decoded = json.loads(output)
    except ValueError as exc:
        raise HTTPException(
            502, "Ollama did not return JSON translations. Raw excerpt: "
            + output[:200],
        ) from exc

    if not isinstance(decoded, dict) or set(decoded) != set(indexed):
        raise HTTPException(
            502, "Ollama returned missing or unexpected translation IDs.",
        )
    translations = {}
    for index, source in enumerate(texts):
        translation = decoded[str(index)]
        if not isinstance(translation, str) or not translation.strip():
            raise HTTPException(
                502, "Ollama returned empty/non-text translation for item "
                + str(index),
            )
        if translation.strip().casefold() == "text" and source.strip().casefold() != "text":
            raise HTTPException(
                502, "Ollama returned placeholder 'Text' for: " + source[:80],
            )
        translations[source] = translation
    return translations


def repair_ollama_translation(
    source: str, rejected: str, validation_error: str,
    target_culture: str, model_name: str,
) -> str:
    """One targeted repair attempt. Never import or bypass safety validation.

    Called only after the original model output fails HMI structural checks.
    The caller validates this result separately and may still reject it.
    """
    schema = {
        "type": "object",
        "properties": {"translation": {"type": "string"}},
        "required": ["translation"],
        "additionalProperties": False,
    }
    instructions = (
        "You are correcting ONE rejected Siemens HMI/SCADA translation "
        "into " + target_culture + ". Only the SOURCE is authoritative. "
        "The PREVIOUS PROPOSAL is unsafe and must NOT be copied unchanged. "
        "Remove every invented annotation, word, prefix or suffix. "
        "Do not add explanatory text or mention machine technology unless "
        "it appears in the SOURCE. Preserve identifiers, numbers, units, "
        "line breaks, placeholders, and source punctuation. In particular, "
        "preserve all parentheses/brackets/braces at their original locations "
        "and do not introduce any extra delimiters. If the text is already "
        "in the target language, return it unchanged rather than paraphrase. "
        "Return only the JSON field translation."
    )
    payload = {
        "model": model_name,
        "stream": False,
        "format": schema,
        "options": {"temperature": 0},
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": json.dumps({
                "source": source,
                "unsafe_previous_proposal": rejected,
                "validation_error": validation_error[:300],
            }, ensure_ascii=False)},
        ],
    }
    result = _ollama_json("/api/chat", payload, timeout=DEFAULT_TIMEOUT)
    if result.get("done") is False:
        raise HTTPException(502, "Ollama repair response was incomplete.")
    message = result.get("message")
    output = message.get("content") if isinstance(message, dict) else None
    if not isinstance(output, str) or not output.strip():
        raise HTTPException(502, "Ollama returned an empty repair response.")
    try:
        data = json.loads(output)
    except ValueError as exc:
        raise HTTPException(502, "Ollama repair returned invalid JSON.") from exc
    if not isinstance(data, dict) or set(data) != {"translation"}:
        raise HTTPException(502, "Ollama repair returned an unexpected JSON shape.")
    translation = data["translation"]
    if not isinstance(translation, str) or not translation.strip():
        raise HTTPException(502, "Ollama repair returned an empty translation.")
    return translation


def translation_batch_size() -> int:
    """Number of source texts per local model request (1-50).

    Small local GPUs can time out on large JSON-schema responses.
    Default to one text per Ollama request; advanced users may increase
    it after verifying model throughput and output reliability.
    """
    raw = os.getenv("OLLAMA_TRANSLATION_BATCH_SIZE", "1").strip()
    try:
        size = int(raw)
    except ValueError as exc:
        raise HTTPException(
            422, "OLLAMA_TRANSLATION_BATCH_SIZE must be an integer (1-50).",
        ) from exc
    if not 1 <= size <= 50:
        raise HTTPException(
            422, "OLLAMA_TRANSLATION_BATCH_SIZE must be between 1 and 50.",
        )
    return size


def translate_ollama_texts(
    texts: list[str], target_culture: str,
    model_name: str | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> dict[str, str]:
    model = resolve_ollama_model(model_name)
    # TIA's en-US* slot can already contain Polish operator text. A strong
    # Polish vocabulary match is copied EXACTLY instead of being paraphrased
    # by the local model. Ambiguous/mixed-language strings go to Ollama.
    preserved = {
        source: source for source in texts
        if is_likely_polish_hmi_source(source, target_culture)
    }
    to_translate = [source for source in texts if source not in preserved]
    translations = dict(preserved)
    batch_size = translation_batch_size()
    total = len(texts)
    if progress is not None:
        progress(0, total)
        if preserved:
            progress(len(preserved), total)
    for start in range(0, len(to_translate), batch_size):
        batch = to_translate[start:start + batch_size]
        translations.update(
            translate_ollama_batch(batch, target_culture, model)
        )
        if progress is not None:
            progress(len(preserved) + start + len(batch), total)
    return translations
