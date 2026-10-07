from fastapi.testclient import TestClient

from engine.main import app

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
