import json

from fastapi.testclient import TestClient

from engine.main import app
from engine.plc_code_review import AiReviewRequest, ReviewInputFile, analyze_files, review_with_ollama


def test_xml_with_dtd_is_rejected_without_parsing_entities():
    report = analyze_files([ReviewInputFile(
        name="unsafe.xml",
        content='<!DOCTYPE Document [<!ENTITY xxe SYSTEM "file:///secret">]><Document Name="FB_X">&xxe;</Document>',
    )])
    assert report.files[0].verification_status == "failed"
    assert "rejected" in report.files[0].parsing_warnings[0]


def test_ollama_suggestions_are_validated_and_bound_to_real_source(monkeypatch):
    monkeypatch.setattr("engine.plc_code_review.resolve_ollama_model", lambda requested: "qwen2.5:3b")
    captured = []

    def fake_ollama(endpoint, payload, timeout):
        captured.append((endpoint, payload, timeout))
        return {"message": {"content": json.dumps({"findings": [{
            "severity": "warning", "category": "Style", "explanation": "Potentially unclear name.",
            "suggested_fix": "Use a descriptive name.", "evidence": "X", "location": "line 3", "confidence": 0.4,
        }, {
            "severity": "info", "category": "Location", "explanation": "No trusted location.",
            "location": "line 999", "confidence": 0.2,
        }]})}}

    monkeypatch.setattr("engine.plc_code_review._ollama_json", fake_ollama)
    request = AiReviewRequest(files=[ReviewInputFile(
        name="FB.scl", content="FUNCTION_BLOCK FB_Test\nVAR_INPUT\n X : Bool;\nEND_VAR",
    )])
    report = review_with_ollama(request)
    findings = [item for item in report.findings if item.detection_method == "AI"]
    assert len(findings) == 2
    assert findings[0].source_file == "FB.scl"
    assert findings[0].block == "FB_Test"
    assert findings[0].location == "line 3"
    assert findings[0].verification_status == "AI suggestion — unverified"
    assert findings[1].location == ""
    assert captured[0][0] == "/api/chat"
    assert "untrusted PLC source data" in captured[0][1]["messages"][1]["content"]
    assert captured[0][2] == 90


def test_ollama_endpoint_reports_invalid_json_clearly(monkeypatch):
    monkeypatch.setattr("engine.plc_code_review.resolve_ollama_model", lambda requested: "qwen2.5:3b")
    monkeypatch.setattr("engine.plc_code_review._ollama_json", lambda *args, **kwargs: {"message": {"content": "not json"}})
    response = TestClient(app).post("/api/v1/code-review/ollama", json={
        "files": [{"name": "FC.scl", "content": "FUNCTION FC_Test"}],
    })
    assert response.status_code == 502
    assert response.json()["detail"] == "Ollama returned invalid code-review JSON."


def test_oversized_one_line_xml_is_bounded_for_local_ollama():
    from engine.plc_code_review import (
        MAX_AI_CHUNK_CHARS, MAX_AI_CHUNKS_PER_FILE, _source_chunks,
    )
    chunks, truncated = _source_chunks("<FlgNet>" + "X" * 200000 + "</FlgNet>")
    assert len(chunks) == MAX_AI_CHUNKS_PER_FILE
    assert truncated is True
    assert all(len(chunk) <= MAX_AI_CHUNK_CHARS for chunk in chunks)
    assert all(chunk.startswith("1: ") for chunk in chunks)


def test_mixed_short_lines_and_oversized_lines_preserve_valid_line_numbers():
    from engine.plc_code_review import MAX_AI_CHUNK_CHARS, _source_chunks
    chunks, truncated = _source_chunks("line one\n" + "Y" * 10000 + "\nline three")
    assert truncated is False
    assert all(len(chunk) <= MAX_AI_CHUNK_CHARS for chunk in chunks)
    assert chunks[0].startswith("1: line one\n2: ")
    assert any("3: line three" in chunk for chunk in chunks)
