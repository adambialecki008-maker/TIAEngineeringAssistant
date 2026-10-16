"""Offline contract for read-only Function Block import from TIA exports."""
from pathlib import Path

from fastapi.testclient import TestClient

from engine.main import app
from engine.tia import program


client = TestClient(app)


def test_function_block_validation_endpoint_accepts_static_system_instance():
    response = client.post("/api/v1/function-block-specifications", json={
        "name": "FB_Timer",
        "number": 41,
        "language": "SCL",
        "input": {"name": "Input", "members": []},
        "output": {"name": "Output", "members": []},
        "inout": {"name": "InOut", "members": []},
        "static": {"name": "Static", "members": [{
            "name": "Delay", "data_type": "TON_TIME", "system_instance": True,
        }]},
        "temp": {"name": "Temp", "members": []},
        "constant": {"name": "Constant", "members": []},
    })
    assert response.status_code == 200, response.text
    assert response.json()["static"]["members"][0]["system_instance"] is True


def test_program_block_export_retains_fb_declaration_sections(monkeypatch):
    def adapter(*arguments):
        output = Path(arguments[-1])
        output.write_text("""<Document><SW.Blocks.FB><AttributeList><Interface><Sections>
          <Section Name=\"Input\"><Member Name=\"Enable\" Datatype=\"Bool\" /></Section>
          <Section Name=\"Static\"><Member Name=\"State\" Datatype=\"Int\" /></Section>
        </Sections></Interface></AttributeList></SW.Blocks.FB></Document>""", encoding="utf-8")
        return ["PROGRAM_BLOCK_EXPORTED|Logic|FB_Motor|FB|12|SCL|true|100|40"]

    monkeypatch.setattr(program, "run_adapter", adapter)
    response = client.get("/api/v1/tia/plc-program-block", params={
        "process_id": 22, "device_name": "Station", "plc_name": "PLC",
        "group_path": "Logic", "name": "FB_Motor",
    })
    assert response.status_code == 200, response.text
    assert [(row["section"], row["name"]) for row in response.json()["members"]] == [
        ("Input", "Enable"), ("Static", "State"),
    ]


def test_fb_import_ui_is_wired_to_read_only_program_block_endpoints():
    root = Path(__file__).resolve().parents[1]
    page = (root / "gui" / "index.html").read_text(encoding="utf-8")
    ui = (root / "gui" / "js" / "fb_import.js").read_text(encoding="utf-8")
    converter = (root / "gui" / "js" / "fb_import_converter.js").read_text(encoding="utf-8")
    assert 'id="tia-fb-scan"' in page and 'id="tia-fb-load"' in page
    assert 'plc-program-blocks' in ui and 'plc-program-block?' in ui
    assert 'function-block-specifications' in ui
    assert 'TIA Portal was NOT modified' in ui
    assert 'unsupported FB section' in converter
