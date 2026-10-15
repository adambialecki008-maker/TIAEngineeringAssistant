"""UDT and DB work must not depend on Create PLC family selection."""
from fastapi.testclient import TestClient

from engine.main import app

client = TestClient(app)

UDT = {"name": "UDT_Test", "fields": [{"name": "Ready", "data_type": "Bool"}]}
DB = {"name": "DB_Test", "retain": False,
      "members": [{"name": "Unit", "data_type": "UDT_Test"}]}


def test_project_source_without_plc_family():
    response = client.post("/api/v1/project-source",
                           json={"udts": [UDT], "dbs": [DB]})
    assert response.status_code == 200, response.text
    source = response.json()["source"]
    assert 'TYPE "UDT_Test"' in source
    assert 'DATA_BLOCK "DB_Test"' in source
    assert '"UDT_Test"' in source


def test_project_source_with_empty_plc_family():
    response = client.post("/api/v1/project-source",
                           json={"plc_family": "", "udts": [UDT], "dbs": [DB]})
    assert response.status_code == 200, response.text


def test_udt_and_db_validation_without_plc_family():
    udt_response = client.post("/api/v1/udt-specifications", json=UDT)
    db_response = client.post("/api/v1/db-specifications", json=DB)
    assert udt_response.status_code == 200, udt_response.text
    assert db_response.status_code == 200, db_response.text


def test_structure_preview_without_plc_family():
    response = client.post("/api/v1/tia/plc-structure-import/preview",
                           json={"project": {"udts": [UDT], "dbs": [DB]},
                                 "selected_udts": ["UDT_Test"],
                                 "selected_dbs": ["DB_Test"]})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert 'TYPE "UDT_Test"' in payload["source"]
    assert 'DATA_BLOCK "DB_Test"' in payload["source"]
