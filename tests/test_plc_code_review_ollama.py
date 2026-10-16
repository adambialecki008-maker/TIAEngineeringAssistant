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


def test_ollama_invalid_json_retries_then_keeps_deterministic_report(monkeypatch):
    monkeypatch.setattr("engine.plc_code_review.resolve_ollama_model", lambda requested: "qwen2.5:3b")
    calls = []

    def invalid(endpoint, payload, timeout):
        calls.append(payload)
        return {"message": {"content": "not json"}}

    monkeypatch.setattr("engine.plc_code_review._ollama_json", invalid)
    response = TestClient(app).post("/api/v1/code-review/ollama", json={
        "files": [{"name": "FC.scl", "content": "FUNCTION FC_Test\nVAR_INPUT\n Ghost : UDT_Missing;\nEND_VAR"}],
    })
    assert response.status_code == 200
    report = response.json()
    assert report["read_only"] is True
    assert report["ai_review_status"] == "unavailable"
    assert any(f["category"] == "Unresolved dependency" for f in report["findings"])
    assert any("Ollama returned invalid JSON" in warning for warning in report["file_warnings"])
    assert len(calls) == 2
    assert isinstance(calls[0]["format"], dict)
    assert calls[1]["format"] == "json"


def test_ollama_markdown_wrapped_json_is_accepted_without_retry(monkeypatch):
    monkeypatch.setattr("engine.plc_code_review.resolve_ollama_model", lambda requested: "qwen2.5:3b")
    calls = []

    def wrapped(endpoint, payload, timeout):
        calls.append(payload)
        fence = chr(96) * 3
        output = 'JSON response:\n' + fence + 'json\n{"findings":[{"severity":"warning","category":"Potential issue","explanation":"Review this code.","location":"line 1"}]}\n' + fence
        return {"message": {"content": output}}

    monkeypatch.setattr("engine.plc_code_review._ollama_json", wrapped)
    report = review_with_ollama(AiReviewRequest(files=[
        ReviewInputFile(name="FB.scl", content="FUNCTION_BLOCK FB_Foo\nEND_FUNCTION_BLOCK"),
    ]))
    assert report.ai_review_status == "complete"
    assert len(calls) == 1
    assert len([x for x in report.findings if x.detection_method == "AI"]) == 1


def test_ollama_skips_invalid_candidates_without_losing_valid_findings(monkeypatch):
    monkeypatch.setattr("engine.plc_code_review.resolve_ollama_model", lambda requested: "qwen2.5:3b")
    monkeypatch.setattr("engine.plc_code_review._ollama_json", lambda *args, **kwargs: {
        "message": {"content": json.dumps({"findings": [
            {"severity": "warning", "category": "Valid", "explanation": "Review this carefully."},
            {"severity": "invalid", "category": "No", "explanation": "Reject."},
            {"category": "No", "explanation": "Missing severity"},
        ]})}
    })
    report = review_with_ollama(AiReviewRequest(files=[
        ReviewInputFile(name="FC.scl", content="FUNCTION FC_Example\nEND_FUNCTION"),
    ]))
    ai = [finding for finding in report.findings if finding.detection_method == "AI"]
    assert report.ai_review_status == "complete"
    assert [(f.category, f.severity) for f in ai] == [("Valid", "warning")]
    assert any("ignored 2 malformed" in warning for warning in report.file_warnings)


def test_ollama_retry_recovers_structured_json(monkeypatch):
    monkeypatch.setattr("engine.plc_code_review.resolve_ollama_model", lambda requested: "qwen2.5:3b")
    calls = []

    def fake(endpoint, payload, timeout):
        calls.append(payload)
        if len(calls) == 1:
            return {"message": {"content": '{"findings": [invalid'}}
        return {"message": {"content": '{"findings": []}'}}

    monkeypatch.setattr("engine.plc_code_review._ollama_json", fake)
    report = review_with_ollama(AiReviewRequest(files=[
        ReviewInputFile(name="FC.scl", content="FUNCTION FC_Example\nEND_FUNCTION"),
    ]))
    assert report.ai_review_status == "complete"
    assert len(calls) == 2
    assert calls[1]["format"] == "json"
    assert report.file_warnings == []



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
    assert chunks[0] == "1: line one"
    assert any(chunk.startswith("2: ") for chunk in chunks)
    assert any("3: line three" in chunk for chunk in chunks)



def test_ai_review_refreshes_project_priority_and_method_counts(monkeypatch):
    monkeypatch.setattr("engine.plc_code_review.resolve_ollama_model", lambda requested: "qwen2.5:3b")
    monkeypatch.setattr("engine.plc_code_review._ollama_json", lambda *args, **kwargs: {
        "message": {"content": json.dumps({"findings": [
            {"severity": "error", "category": "Suggestion", "explanation": "Unverified risk."},
        ]})}
    })
    result = review_with_ollama(AiReviewRequest(files=[ReviewInputFile(
        name="A.scl", content="FUNCTION_BLOCK FB_Main\nEND_FUNCTION_BLOCK",
    )]))
    assert result.ai_review_status == "complete"
    assert result.summary.total_findings == len(result.findings)
    assert result.summary.by_method["AI"] == 1
    assert result.summary.by_priority["P0"] == 0
    assert result.summary.by_priority["P1"] == 1
    assert result.findings[-1].priority == "P1"
