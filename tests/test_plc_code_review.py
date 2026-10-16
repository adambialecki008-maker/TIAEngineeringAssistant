from fastapi.testclient import TestClient
from engine.main import app
from engine.plc_code_review import ReviewInputFile, analyze_files


def test_scl_and_xml_analysis_resolves_loaded_udt_and_reports_missing_type():
    report = analyze_files([
        ReviewInputFile(name="Types.scl", content="TYPE UDT_Motor\nEND_TYPE"),
        ReviewInputFile(name="Motor.scl", content="FUNCTION_BLOCK FB_Motor\nVAR_INPUT\n Value : UDT_Motor;\n Missing : UDT_No;\nEND_VAR"),
        ReviewInputFile(name="Lad.xml", content='<Document Name="FB_Lad"><Section Name="Static"><Member Name="Delay" Datatype="TON_TIME"/></Section><CompileUnit/></Document>'),
    ])
    assert [item.name for item in report.files] == ["UDT_Motor", "FB_Motor", "FB_Lad"]
    assert report.files[1].dependencies == ["UDT_Motor"]
    assert any(f.category == "Unresolved dependency" and f.evidence == "UDT_No" for f in report.findings)
    assert report.files[2].networks == ["network 1"]


def test_invalid_and_unsupported_files_do_not_stop_other_files():
    report = analyze_files([ReviewInputFile(name="bad.xml", content="<broken"), ReviewInputFile(name="notes.txt", content="x"), ReviewInputFile(name="ok.scl", content="FUNCTION FC_Ok")])
    assert report.files[0].verification_status == "failed"
    assert "unsupported extension" in report.file_warnings[0]
    assert report.files[-1].name == "FC_Ok"


def test_code_review_api_is_read_only():
    response = TestClient(app).post("/api/v1/code-review/analyze-files", json=[{"name":"DB.scl", "content":"DATA_BLOCK DB_A"}])
    assert response.status_code == 200
    assert response.json()["read_only"] is True


def test_multi_instance_cycles_and_iec_context_are_reported_from_loaded_source():
    report = analyze_files([
        ReviewInputFile(name="A.scl", content="FUNCTION_BLOCK FB_A\nVAR_STATIC\n B : FB_B;\n Timer : TON_TIME;\nEND_VAR"),
        ReviewInputFile(name="B.scl", content="FUNCTION_BLOCK FB_B\nVAR_STATIC\n A : FB_A;\nEND_VAR"),
        ReviewInputFile(name="Bad.scl", content="FUNCTION FC_Bad\nVAR_INPUT\n Timer : TON_TIME;\n Call : TON;\nEND_VAR"),
    ])
    cycles = [item for item in report.findings if item.category == "Cyclic multi-instance dependency"]
    assert {item.block for item in cycles} == {"FB_A", "FB_B"}
    assert all(item.evidence == "FB_A -> FB_B -> FB_A" for item in cycles)
    assert any(item.category == "Invalid IEC instance context" and item.evidence == "TON_TIME" for item in report.findings)
    assert any(item.category == "Invalid instruction declaration" and item.evidence == "TON" for item in report.findings)
