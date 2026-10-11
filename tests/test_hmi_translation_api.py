"""Ollama local HMI translation API tests — no network or API key required."""
import io
import json
from urllib.error import HTTPError, URLError

import pytest
from fastapi import HTTPException

import engine.tia.ollama_translation as ollama


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def test_local_ollama_model_discovery_and_translation(monkeypatch):
    requests = []
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OLLAMA_TRANSLATION_MODEL", raising=False)
    monkeypatch.setenv("OLLAMA_TRANSLATION_BATCH_SIZE", "15")

    def fake_urlopen(request, timeout):
        requests.append(request)
        if request.full_url.endswith("/api/tags"):
            return FakeResponse({"models": [
                {"name": "qwen2.5:7b"},
                {"name": "gemma3:4b"},
            ]})
        assert request.full_url.endswith("/api/chat")
        data = json.loads(request.data)
        assert data["stream"] is False
        assert data["format"]["type"] == "object"
        assert data["format"]["required"] == ["0", "1"]
        assert data["options"] == {"temperature": 0}
        assert data["model"] == "qwen2.5:7b"
        return FakeResponse({
            "done": True,
            "message": {"role": "assistant", "content": json.dumps({
                "0": "Zgniatarka", "1": "Za zaworem",
            })},
        })

    monkeypatch.setattr(ollama.urllib_request, "urlopen", fake_urlopen)
    assert ollama.list_ollama_models() == ["gemma3:4b", "qwen2.5:7b"]
    assert ollama.translate_ollama_texts(
        ["Zgniatarka", "Za zaworem"], "pl-PL", "qwen2.5:7b",
    ) == {
        "Zgniatarka": "Zgniatarka",
        "Za zaworem": "Za zaworem",
    }
    assert any(req.full_url.endswith("/api/tags") for req in requests)
    assert any(req.full_url.endswith("/api/chat") for req in requests)


def test_one_installed_model_autoselected(monkeypatch):
    monkeypatch.delenv("OLLAMA_TRANSLATION_MODEL", raising=False)
    assert ollama.resolve_ollama_model(available=["qwen2.5:7b"]) == "qwen2.5:7b"


def test_multiple_models_require_selection(monkeypatch):
    monkeypatch.delenv("OLLAMA_TRANSLATION_MODEL", raising=False)
    with pytest.raises(HTTPException) as err:
        ollama.resolve_ollama_model(available=["gemma3:4b", "qwen2.5:7b"])
    assert err.value.status_code == 422
    assert "Choose" in err.value.detail


def test_missing_model_returns_available_names():
    with pytest.raises(HTTPException) as err:
        ollama.resolve_ollama_model(
            requested="unknown-model", available=["qwen2.5:7b"],
        )
    assert err.value.status_code == 422
    assert "qwen2.5:7b" in err.value.detail


def test_local_ollama_unavailable_error(monkeypatch):
    def unavailable(request, timeout):
        raise URLError("Connection refused")

    monkeypatch.setattr(ollama.urllib_request, "urlopen", unavailable)
    with pytest.raises(HTTPException) as err:
        ollama.list_ollama_models()
    assert err.value.status_code == 503
    assert "Ollama" in err.value.detail


def test_local_ollama_model_not_installed_http_error(monkeypatch):
    def missing_model(request, timeout):
        raise HTTPError(
            request.full_url, 404, "Not Found", {},
            io.BytesIO(b'{"error":"model not found"}'),
        )

    monkeypatch.setattr(ollama.urllib_request, "urlopen", missing_model)
    with pytest.raises(HTTPException) as err:
        ollama.translate_ollama_batch(["Zgniatarka"], "pl-PL", "missing")
    assert err.value.status_code == 502
    assert "model not found" in err.value.detail


def test_local_ollama_rejects_placeholder_output(monkeypatch):
    monkeypatch.setattr(
        ollama.urllib_request, "urlopen",
        lambda req, timeout: FakeResponse({
            "done": True,
            "message": {"content": '{"0":"Text"}'},
        }),
    )
    with pytest.raises(HTTPException) as err:
        ollama.translate_ollama_batch(["Zgniatarka"], "pl-PL", "qwen2.5:7b")
    assert err.value.status_code == 502
    assert "placeholder" in err.value.detail


def test_local_ollama_rejects_missing_translation_id(monkeypatch):
    monkeypatch.setattr(
        ollama.urllib_request, "urlopen",
        lambda req, timeout: FakeResponse({
            "done": True,
            "message": {"content": '{"0":"Zgniatarka"}'},
        }),
    )
    with pytest.raises(HTTPException) as err:
        ollama.translate_ollama_batch(
            ["Zgniatarka", "Za zaworem"], "pl-PL", "qwen2.5:7b",
        )
    assert err.value.status_code == 502
    assert "IDs" in err.value.detail


def test_configured_translation_batches_report_progress(monkeypatch):
    monkeypatch.setenv("OLLAMA_TRANSLATION_BATCH_SIZE", "20")
    monkeypatch.setattr(
        ollama, "resolve_ollama_model",
        lambda selected: "local-test-model",
    )
    batch_sizes = []
    events = []

    def fake_batch(texts, target_culture, model):
        batch_sizes.append(len(texts))
        return {text: text for text in texts}

    monkeypatch.setattr(ollama, "translate_ollama_batch", fake_batch)
    texts = ["Label " + str(i) for i in range(45)]
    result = ollama.translate_ollama_texts(
        texts, "pl-PL", "local-test-model",
        progress=lambda done, total: events.append((done, total)),
    )
    assert len(result) == 45
    assert batch_sizes == [20, 20, 5]
    assert events == [(0, 45), (20, 45), (40, 45), (45, 45)]


@pytest.mark.parametrize("size", ["foo", "0", "51"])
def test_translation_batch_size_validates_configuration(monkeypatch, size):
    monkeypatch.setenv("OLLAMA_TRANSLATION_BATCH_SIZE", size)
    with pytest.raises(HTTPException) as error:
        ollama.translation_batch_size()
    assert error.value.status_code == 422


def test_default_ollama_fragment_size_is_one(monkeypatch):
    monkeypatch.delenv("OLLAMA_TRANSLATION_BATCH_SIZE", raising=False)
    monkeypatch.setattr(
        ollama, "resolve_ollama_model",
        lambda requested: "local-test-model",
    )
    batches = []

    def fake_batch(texts, target, model):
        batches.append(list(texts))
        return {source: source for source in texts}

    monkeypatch.setattr(ollama, "translate_ollama_batch", fake_batch)
    result = ollama.translate_ollama_texts(
        ["Label one", "Label two", "Label three"],
        "pl-PL", "local-test-model",
    )
    assert list(result) == ["Label one", "Label two", "Label three"]
    assert batches == [["Label one"], ["Label two"], ["Label three"]]
