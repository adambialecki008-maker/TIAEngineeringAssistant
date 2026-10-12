"""Semantic QA regression, Polish source-copy guard, read-only TIA audit."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from engine.main import app
from engine.tia import hmi_semantic_qa as qa
from engine.tia import ollama_translation
import engine.tia_openness as tia_openness


client = TestClient(app)


@pytest.mark.parametrize("source", [
    "(Hydrauliczna)",
    "(Pneumatyczne)",
    "Naciągnij linkę",
    "Wozek poprzeczny 1:Brak powietrza, czujnik w szafce",
    "Poziom oleju w agregacie glownym jest niski, uzupelnij",
    "Awaria pompy chłodnicy hydrauliki",
])
def test_recognizes_polish_labels_even_in_english_source_slot(source):
    assert qa.is_likely_polish_hmi_source(source, "pl-PL")
    assert not qa.is_likely_polish_hmi_source(source, "en-US")


@pytest.mark.parametrize("source", [
    "Hydraulic pressure low", "Tension the cable",
    "WARNING: Pneumatic system", "Temperature sensor error",
    "Awaria pressure low",
])
def test_english_or_mixed_source_is_not_assumed_polish(source):
    assert not qa.is_likely_polish_hmi_source(source)


@pytest.mark.parametrize("source,target,reason", [
    ("Naciągnij linkę", "Naciągnij linię", "linka"),
    ("(Hydrauliczna)", "(cykliski)", "hydraul"),
    ("(Pneumatyczna)", "(cykliski)", "pneumat"),
    ("Awaria pompy", "Ostrzeżenie pompy", "awaria"),
    ("Zawór pompy", "Wentyl pompy", "zawór"),
])
def test_known_technical_meaning_drift_is_flagged(source, target, reason):
    assert any(
        reason in warning.lower()
        for warning in qa.semantic_qa_warnings(source, target)
    )


def test_no_false_alarm_for_unchanged_polish_or_valid_english_translation():
    assert qa.semantic_qa_warnings("Naciągnij linkę", "Naciągnij linkę") == []
    assert qa.semantic_qa_warnings("Hydraulic pressure", "Ciśnienie hydrauliczne") == []
    assert qa.semantic_qa_warnings("Awaria pompy", "Awaria pompy") == []
    assert qa.semantic_qa_warnings("Naciągnij linkę", "Naciągnij linię", "en-US") == []


def test_translate_ollama_texts_bypasses_model_for_polish_sources(monkeypatch):
    requested = []
    progress_values = []
    monkeypatch.setattr(
        ollama_translation, "resolve_ollama_model",
        lambda _model: "test-model",
    )
    monkeypatch.setattr(
        ollama_translation, "translation_batch_size", lambda: 1,
    )
    def model_batch(texts, culture, model):
        requested.extend(texts)
        return {src: "Ciśnienie niskie" for src in texts}
    monkeypatch.setattr(ollama_translation, "translate_ollama_batch", model_batch)
    translations = ollama_translation.translate_ollama_texts(
        ["Naciągnij linkę", "(Hydrauliczna)", "Pressure low"],
        "pl-PL", "test-model",
        progress=lambda done, total: progress_values.append((done, total)),
    )
    assert requested == ["Pressure low"]
    assert translations["Naciągnij linkę"] == "Naciągnij linkę"
    assert translations["(Hydrauliczna)"] == "(Hydrauliczna)"
    assert translations["Pressure low"] == "Ciśnienie niskie"
    assert progress_values[-1] == (3, 3)


def test_english_target_does_not_bypass_polish_source(monkeypatch):
    requested = []
    monkeypatch.setattr(ollama_translation, "resolve_ollama_model",
                        lambda _model: "test-model")
    monkeypatch.setattr(ollama_translation, "translation_batch_size", lambda: 1)
    def model_batch(texts, culture, model):
        requested.extend(texts)
        return {src: "Hydraulic" for src in texts}
    monkeypatch.setattr(ollama_translation, "translate_ollama_batch", model_batch)
    result = ollama_translation.translate_ollama_texts(
        ["Hydrauliczna"], "en-US", "test-model",
    )
    assert requested == ["Hydrauliczna"]
    assert result["Hydrauliczna"] == "Hydraulic"


def test_full_existing_target_audit_reads_all_selected_hmi_rows(monkeypatch):
    calls = []
    def mock_adapter(*args):
        calls.append(args[0])
        assert args[0] == "export-project-texts"
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "User Texts"
        sheet.append([
            "Category", "ViewPath", "Internal ID", "Substitutions",
            "en-US*", "pl-PL", 'ref="0"',
        ])
        for index, root, source, target in [
            (1, "HMI_00_Main", "(Hydrauliczna)", "(cykliski)"),
            (2, "HMI_00_Main", "Naciągnij linkę", "Naciągnij linię"),
            (3, "HMI_00_Main", "Awaria pompy", "Awaria pompy"),
            (4, "Other_HMI", "Naciągnij linkę", "Naciągnij linię"),
        ]:
            sheet.append([
                "<HMI screen>",
                f"Project\\{root}\\Screens\\Main\\Text",
                str(index), "", source, target, "",
            ])
        workbook.save(Path(args[-1]))
        workbook.close()
        return ["PROJECT_TEXTS_EXPORTED|" + args[-1]]
    monkeypatch.setattr(tia_openness, "_run_adapter", mock_adapter)
    monkeypatch.setattr(
        ollama_translation, "_ollama_json",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("Audit must never call Ollama")
        ),
    )
    response = client.post(
        "/api/v1/tia/hmis/audit-existing-translations",
        json={
            "process_id": 123,
            "device_name": "HMI_RT_1",
            "hmi_name": "HMI_RT_1",
            "view_path_root": "HMI_00_Main",
            "source_culture": "en-US",
            "target_culture": "pl-PL",
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["scanned_rows"] == 3
    assert payload["filled_target_rows"] == 3
    assert payload["suspicious_rows"] == 2
    assert payload["shown_rows"] == 2
    assert any("cykliski" in item["target_text"] for item in payload["findings"])
    assert any("linię" in item["target_text"] for item in payload["findings"])
    assert all("HMI_00_Main" in item["view_path"]
               for item in payload["findings"])
    assert calls == ["export-project-texts"]


def test_new_translation_quality_guards_reject_linka_linia_and_hydraulic_hallucinations():
    from fastapi import HTTPException
    from engine.tia.hmi_review import validate_hmi_translation_quality
    for source, proposed in [
        ("Naciągnij linkę", "Naciągnij linię"),
        ("(Hydrauliczna)", "(cykliski)"),
    ]:
        with pytest.raises(HTTPException) as error:
            validate_hmi_translation_quality(source, proposed, "pl-PL")
        assert error.value.status_code == 502
    validate_hmi_translation_quality("Hydraulic pressure", "Ciśnienie hydrauliczne", "pl-PL")
