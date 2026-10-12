"""Offline tests for one-shot repair of unsafe Ollama HMI translations."""
import json

import pytest
from fastapi import HTTPException

from engine.tia import hmi_review, ollama_translation


def test_autorepair_sends_only_failed_source_and_uses_strict_json(monkeypatch):
    requests = []
    source = "Wozek poprzeczny 1:Brak powietrza"
    rejected = "(Pneumatyczna) " + source

    def mock_ollama(endpoint, payload, timeout):
        requests.append((endpoint, payload, timeout))
        return {
            "message": {
                "content": json.dumps({"translation": source}, ensure_ascii=False)
            }
        }
    monkeypatch.setattr(ollama_translation, "_ollama_json", mock_ollama)
    result = hmi_review.try_repair_unsafe_translation(
        source, rejected, "changed count of '(' delimiters",
        "pl-PL", "qwen2.5:3b",
    )
    assert result == source
    assert len(requests) == 1
    endpoint, payload, _timeout = requests[0]
    assert endpoint == "/api/chat"
    assert payload["model"] == "qwen2.5:3b"
    assert payload["options"]["temperature"] == 0
    message = json.loads(payload["messages"][1]["content"])
    assert message["source"] == source
    assert message["unsafe_previous_proposal"] == rejected
    assert payload["format"]["required"] == ["translation"]
    assert "Never import" not in payload["messages"][1]["content"]


def test_autorepair_rejects_second_unsafe_candidate(monkeypatch):
    source = "Poziom oleju w agregacie glownym jest niski (US620)"
    calls = []
    def mock_ollama(endpoint, payload, timeout):
        calls.append(payload)
        return {
            "message": {"content": json.dumps({
                "translation": "(Pneumatyczna) " + source
            })}
        }
    monkeypatch.setattr(ollama_translation, "_ollama_json", mock_ollama)
    result = hmi_review.try_repair_unsafe_translation(
        source, "(Pneumatyczna) " + source, "changed delimiters",
        "pl-PL", "qwen2.5:3b",
    )
    assert result is None
    assert len(calls) == 1


def test_autorepair_handles_ollama_failure_without_import(monkeypatch):
    attempts = []

    def unavailable(endpoint, payload, timeout):
        attempts.append(endpoint)
        raise HTTPException(503, "Ollama is offline")
    monkeypatch.setattr(ollama_translation, "_ollama_json", unavailable)
    result = hmi_review.try_repair_unsafe_translation(
        "Pneumatyczny", "(Pneumatyczna) Pneumatyczny",
        "changed count of '(' delimiters", "pl-PL", "qwen2.5:3b",
    )
    assert result is None
    assert attempts == ["/api/chat"]


@pytest.mark.parametrize("bad_response", [
    {"message": {"content": "not json"}},
    {"message": {"content": "{}"}},
    {"message": {"content": '{"translation": ""}'}},
])
def test_repair_rejects_malformed_model_output(monkeypatch, bad_response):
    monkeypatch.setattr(
        ollama_translation, "_ollama_json",
        lambda *args, **kwargs: bad_response,
    )
    assert hmi_review.try_repair_unsafe_translation(
        "Awaria PLC", "(Pneumatyczna) Awaria PLC",
        "invalid delimiters", "pl-PL", "qwen2.5:3b",
    ) is None
