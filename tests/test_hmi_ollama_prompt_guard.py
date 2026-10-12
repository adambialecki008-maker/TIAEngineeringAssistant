"""Prevents cross-item example contamination in the HMI Ollama prompt.

No live model/TIA installation is required.
"""
import json
from pathlib import Path

from engine.tia import ollama_translation


ROOT = Path(__file__).resolve().parents[1]


def test_no_pneumatic_hydraulic_few_shot_contamination(monkeypatch):
    captured = {}
    source = (
        "Wozek poprzeczny 1:Brak powietrza, czujnik w szafce "
        "przy hyd na wozku"
    )

    def fake_ollama(endpoint, payload, timeout):
        assert endpoint == "/api/chat"
        captured["prompt"] = payload["messages"][0]["content"]
        captured["input"] = payload["messages"][1]["content"]
        return {"message": {"content": json.dumps({"0": source})}}

    monkeypatch.setattr(ollama_translation, "_ollama_json", fake_ollama)
    translated = ollama_translation.translate_ollama_batch(
        [source], "pl-PL", "test-model",
    )
    assert translated[source] == source
    assert "'(Pneumatyczna)'" not in captured["prompt"]
    assert "'(Hydrauliczna)'" not in captured["prompt"]
    assert "NEVER copy a word" in captured["prompt"]
    assert "do not add, remove or relocate delimiters" in captured["prompt"]
    assert json.loads(captured["input"]) == {"0": source}


def test_prepare_skipped_editor_is_reviewed_before_tia_import():
    code = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")
    backend = (ROOT / "engine" / "tia" / "hmi_review.py").read_text(
        encoding="utf-8"
    )
    assert 'sourceButton.textContent = "Use source text"' in code
    assert 'validateButton.textContent = "Validate & add to review"' in code
    assert '"/api/v1/tia/hmis/repair-prepared-translation"' in code
    assert "preparedHmiRepairId = result.prepare_id || null" in code
    assert "if safe_rows else None" in backend
    assert 'validate_hmi_translation(source, proposal)' in backend
    assert 'row["proposal"] = proposal' in backend
    assert 'if review and not review["rows"]:' in backend
