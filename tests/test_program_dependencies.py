"""Pure offline FB/FC and UDT/DB dependency graph, with no Openness writes."""
from fastapi.testclient import TestClient

from engine.main import app
from engine.program_dependencies import report_program_dependencies
from engine.project import ProjectSpecification


def test_dependency_order_and_unverified_instance_db_are_explicit():
    project = ProjectSpecification.model_validate({
        "udts": [
            {"name": "UDT_Base", "fields": [{"name": "Enable", "data_type": "Bool"}]},
            {"name": "UDT_Wrap", "fields": [{"name": "Child", "data_type": "UDT_Base"}]},
        ],
        "dbs": [{"name": "DB_Data", "members": [{"name": "Payload", "data_type": "UDT_Wrap"}]}],
        "fbs": [
            {"name": "FB_Motor", "source_mode": "tia_read_only",
             "source_xml": "<FB/>", "input": {"name": "Input", "members": [
                 {"name": "Motor", "data_type": "UDT_Wrap"}]}},
            {"name": "FB_Line", "source_mode": "tia_read_only",
             "source_xml": "<FB/>", "static": {"name": "Static", "members": [
                 {"name": "Motor", "data_type": "FB_Motor"}]}},
        ],
        "fcs": [{"name": "FC_Util", "source_mode": "tia_read_only",
                 "source_xml": "<FC/>", "input": {"name": "Input", "members": [
                     {"name": "Data", "data_type": "UDT_Base"}]}}],
        "instance_dbs": [{"name": "DB_Line", "block_kind": "InstanceDB",
                          "source_mode": "tia_read_only", "is_consistent": True,
                          "relationship_status": "unverified"}],
    })
    result = report_program_dependencies(project)
    order = [row["name"] for row in result["order"]]
    assert order.index("UDT_Base") < order.index("UDT_Wrap") < order.index("FB_Motor")
    assert order.index("FB_Motor") < order.index("FB_Line") < order.index("DB_Line")
    assert any(e["relation"] == "multi-instance" and e["dependent"] == "FB_Line"
               for e in result["edges"])
    assert any(e["dependent"] == "FC_Util" for e in result["edges"])
    assert any(i["object"] == "DB_Line" for i in result["unresolved"])
    assert result["tia_write_allowed"] is False
    assert result["tia_compilation_verified"] is False


def test_program_dependency_api_is_read_only(monkeypatch):
    from engine.tia import compat
    monkeypatch.setattr(compat, "run_adapter", lambda *args: (_ for _ in ()).throw(
        AssertionError("Dependency analysis must never contact TIA")))
    response = TestClient(app).post("/api/v1/program-dependencies", json={
        "udts": [{"name": "UDT_Station", "fields": [{"name": "Ok", "data_type": "Bool"}]}],
        "fcs": [{"name": "FC_Test", "source_mode": "tia_read_only",
                 "source_xml": "<FC/>", "input": {"name": "Input",
                 "members": [{"name": "State", "data_type": "UDT_Station"}]}}],
    })
    assert response.status_code == 200, response.text
    assert response.json()["edges"][0]["relation"] == "uses UDT"
    assert response.json()["tia_write_allowed"] is False
