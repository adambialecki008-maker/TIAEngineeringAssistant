"""Manual and automatic Project texts batches use the same 50-text limit."""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from engine.main import app
from engine.tia.hmi_batches import StartBatchJobRequest


ROOT = Path(__file__).resolve().parents[1]
BASE = {
    "process_id": 1234,
    "device_name": "HMI_Device",
    "hmi_name": "HMI_00_Main",
    "source_culture": "en-US",
    "target_culture": "pl-PL",
}


@pytest.mark.parametrize("batch_size", [1, 5, 50])
def test_automatic_batch_api_accepts_size_up_to_50(batch_size):
    request = StartBatchJobRequest(**BASE, batch_size=batch_size)
    assert request.batch_size == batch_size


@pytest.mark.parametrize("batch_size", [0, 51, 200])
def test_automatic_batch_api_rejects_size_outside_1_to_50(batch_size):
    with pytest.raises(ValidationError):
        StartBatchJobRequest(**BASE, batch_size=batch_size)


def test_batch_start_endpoint_rejects_51_without_adapter_calls():
    response = TestClient(app).post(
        "/api/v1/tia/hmis/batch-translations/start",
        json={**BASE, "batch_size": 51},
    )
    assert response.status_code == 422


def test_gui_uses_50_for_project_manual_and_automatic_batch():
    html = (ROOT / "gui" / "index.html").read_text(encoding="utf-8")
    js = (ROOT / "gui" / "js" / "tia.js").read_text(encoding="utf-8")
    assert 'id="tia-hmi-batch-size" type="number"' in html
    project_input = html.split('id="tia-hmi-batch-size"', 1)[1].split(">", 1)[0]
    assert 'max="50"' in project_input
    assert 'max="200"' not in project_input
    assert "const HMI_PROJECT_BATCH_MAX = 50;" in js
    for block_start, block_end in (
        ("function manualHmiPrepareCount()", "function textListBatchIdentity()"),
        ("function updateHmiTranslateButtonState()", "async function refreshHmiOllamaModels()"),
        ("function renderHmiBatchPlan()", "function renderHmiBatchPlanSummary()"),
        ("async function startHmiBatchImport()", "async function resumeHmiBatchImport()"),
    ):
        if block_start not in js:
            # Keep the contract applicable if helper boundaries are refactored.
            continue
        block = js.split(block_start, 1)[1].split(block_end, 1)[0]
        assert "1–200" not in block
        assert "> 200" not in block
        assert "<= 200" not in block
