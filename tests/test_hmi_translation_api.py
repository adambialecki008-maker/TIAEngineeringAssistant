"""OpenAI Responses API translation integration: requests and errors."""
import io
import json
from urllib.error import HTTPError

import pytest
from fastapi import HTTPException

import engine.tia.hmi_translation as translation


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def test_translation_model_uses_structured_json(monkeypatch):
    captured = {}
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_TRANSLATION_MODEL", "gpt-6-luna")

    def fake_urlopen(request, timeout):
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse({
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "content": [
                        {
                            "type": "output_text",
                            "text": json.dumps({
                                "0": "Zgniatarka",
                                "1": "Za zaworem",
                            }),
                        }
                    ],
                }
            ],
        })

    monkeypatch.setattr(translation.urllib_request, "urlopen", fake_urlopen)

    result = translation._translate_batch(
        ["Zgniatarka", "Za zaworem"], "pl-PL",
    )
    assert result == {
        "Zgniatarka": "Zgniatarka",
        "Za zaworem": "Za zaworem",
    }

    payload = captured["payload"]
    assert payload["model"] == "gpt-6-luna"
    assert payload["reasoning"] == {"effort": "none"}
    assert payload["text"]["format"]["type"] == "json_schema"
    assert payload["text"]["format"]["strict"] is True
    assert payload["text"]["format"]["schema"]["required"] == ["0", "1"]


def test_insufficient_quota_has_actionable_error(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_TRANSLATION_MODEL", "gpt-6-luna")

    def fake_urlopen(request, timeout):
        body = json.dumps({
            "error": {
                "code": "insufficient_quota",
                "message": "You exceeded your current quota.",
            }
        }).encode("utf-8")
        raise HTTPError(request.full_url, 429, "Too Many Requests", {}, io.BytesIO(body))

    monkeypatch.setattr(translation.urllib_request, "urlopen", fake_urlopen)

    with pytest.raises(HTTPException) as error:
        translation._translate_batch(["Zgniatarka"], "pl-PL")

    assert error.value.status_code == 429
    assert "billing/quota" in error.value.detail
    assert "ChatGPT Plus" in error.value.detail


def test_incomplete_model_response_is_reported(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_TRANSLATION_MODEL", "gpt-6-luna")

    monkeypatch.setattr(
        translation.urllib_request,
        "urlopen",
        lambda _req, timeout: FakeResponse({
            "status": "incomplete",
            "incomplete_details": {"reason": "max_output_tokens"},
            "output": [],
        }),
    )
    with pytest.raises(HTTPException) as error:
        translation._translate_batch(["Zgniatarka"], "pl-PL")

    assert error.value.status_code == 502
    assert "max_output_tokens" in error.value.detail
