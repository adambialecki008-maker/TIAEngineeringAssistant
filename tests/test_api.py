from fastapi.testclient import TestClient
from database.repository import get_latest_sample
from engine.main import app
from datetime import datetime

client = TestClient(app)


def test_scale_endpoint_returns_scaled_value() -> None:
    response = client.post(
        "/api/v1/scale",
        json={
            "raw_value": 13824,
            "raw_min": 0,
            "raw_max": 27648,
            "engineering_min": 0,
            "engineering_max": 100,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "scaled_value": 50.0,
    }


def test_scale_endpoint_rejects_equal_raw_limits() -> None:
    response = client.post(
        "/api/v1/scale",
        json={
            "raw_value": 100,
            "raw_min": 0,
            "raw_max": 0,
            "engineering_min": 0,
            "engineering_max": 100,
        },
    )

    assert response.status_code == 422


def test_insert_process_samples(clean_process_samples) -> None:
    response = client.post(
        "/api/v1/process-samples",
        json={
            "tag_name": "Furnace.TempPV",
            "value": 1250.4,
            "unit": "C",
        },
    )
    assert response.status_code == 201
    result = get_latest_sample("Furnace.TempPV")
    assert result[1] == "Furnace.TempPV"
    assert result[2] == 1250.4
    assert result[3] == "C"


def test_get_last_process_sample(clean_process_samples) -> None:
    client.post(
        "/api/v1/process-samples",
        json={
            "tag_name": "Furnace.TempPV",
            "value": 1250.4,
            "unit": "C",
        },
    )
    response = client.get("/api/v1/process-samples/Furnace.TempPV/latest")
    result = response.json()
    assert response.status_code == 200
    assert result["tag_name"] == "Furnace.TempPV"
    assert result["value"] == 1250.4
    assert result["unit"] == "C"


def test_get_last_process_sample_returns_404_if_no_sample(
    clean_process_samples,
) -> None:
    response = client.get("/api/v1/process-samples/Furnace.TempPV/latest")
    assert response.status_code == 404


def test_get_process_samples_by_tag(clean_process_samples) -> None:
    client.post(
        "/api/v1/process-samples",
        json={
            "tag_name": "Furnace.TempPV",
            "value": 1250.4,
            "unit": "C",
        },
    )
    client.post(
        "/api/v1/process-samples",
        json={
            "tag_name": "Furnace.TempPV",
            "value": 1450.4,
            "unit": "C",
        },
    )
    response = client.get("/api/v1/process-samples/Furnace.TempPV?limit=2")
    results = response.json()
    assert len(results) == 2
    assert response.status_code == 200
    assert results[0]["tag_name"] == "Furnace.TempPV"
    assert results[0]["value"] == 1450.4
    assert results[0]["unit"] == "C"
    assert results[1]["value"] == 1250.4
    parsed_timestamp = datetime.fromisoformat(results[1]["timestamp"])
    assert isinstance(parsed_timestamp, datetime)


def test_get_process_sampless_by_tag_returns_422_if_limit_is_outside_boundaries(
    clean_process_samples,
) -> None:

    response_1 = client.get("/api/v1/process-samples/Furnace.TempPV?limit=0")
    response_2 = client.get("/api/v1/process-samples/Furnace.TempPV?limit=101")
    assert response_1.status_code == 422
    assert response_2.status_code == 422


def test_create_udt_specification() -> None:
    response = client.post(
        "/api/v1/udt-specifications",
        json={
            "name": "UDT_TemperatureZone",
            "fields": [
                {
                    "name": "PV",
                    "data_type": "Real",
                    "comment": "Process value",
                },
                {
                    "name": "SP",
                    "data_type": "Real",
                    "comment": "Setpoint",
                },
            ],
        },
    )

    assert response.status_code == 200
