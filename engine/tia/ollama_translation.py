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
        if isinstance(exc, (TimeoutError, socket.timeout)):
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
        "Translate into " + target_culture + ". If already in that language, "
        "preserve the original words. Keep PLC/IO identifiers, tags, variables, "
        "placeholder expressions, measurement units, newlines, and numbers. "
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


def translation_batch_size() -> int:
    """Number of source texts per local model request (1-50).

    Larger batches reduce overhead but may increase JSON-format errors on
    smaller models. Defaults to the existing safe batch size (15).
    """
    raw = os.getenv("OLLAMA_TRANSLATION_BATCH_SIZE", "15").strip()
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
    translations = {}
    batch_size = translation_batch_size()
    total = len(texts)
    if progress is not None:
        progress(0, total)
    for start in range(0, total, batch_size):
        batch = texts[start:start + batch_size]
        translations.update(
            translate_ollama_batch(batch, target_culture, model)
        )
        if progress is not None:
            progress(min(start + len(batch), total), total)
    return translations
