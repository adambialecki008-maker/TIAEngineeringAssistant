"""LLM ZIP export: manifest integrity, PLC scope and no built-in AI."""
import hashlib
import io
import json
import zipfile
from fastapi.testclient import TestClient
from engine.main import app

client = TestClient(app)
API = "/api/v1/code-review/export-for-llm-review"


def contents(response):
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["cache-control"] == "no-store"
    assert response.content[:2] == b"PK"
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        data = {name:archive.read(name) for name in archive.namelist()}
    manifest = json.loads(data["MANIFEST.json"])
    return manifest, data


def test_export_loaded_whole_profile_and_selected_sources_as_reviewable_zip():
    payload = {
        "profile_name":"Test engineering project",
        "project":{
            "plc_family":"S7-1500",
            "tia_target":{"device_name":"CPU_1","plc_name":"PLC_1"},
            "udts":[{"name":"UDT_Item","fields":[{"name":"Ready","data_type":"Bool"}]}],
            "dbs":[{"name":"DB_Item","members":[{"name":"Ready","data_type":"Bool"}]}],
            "fbs":[{"name":"FB_Logic","language":"LAD","source_mode":"tia_read_only",
                    "source_xml":'<SW.Blocks.FB Name="FB_Logic"><CompileUnit/></SW.Blocks.FB>'}],
            "fcs":[{"name":"FC_Unloaded","language":"SCL","source_mode":"tia_read_only"}],
            "instance_dbs":[{"name":"DB_Instance","function_block":"FB_Logic"}],
            "device_config":{"secret_token":"MUST_NEVER_EXPORT"},
            "unrelated_password":"MUST_NEVER_EXPORT",
        },
        "files":[{"name":"../suspect/FC_Analyzed.scl",
                  "content":"FUNCTION FC_Analyzed : Bool\nBEGIN\nEND_FUNCTION\n"}],
    }
    original = json.dumps(payload, sort_keys=True)
    manifest, files = contents(client.post(API, json=payload))
    assert json.dumps(payload, sort_keys=True) == original
    assert manifest["format"] == "TIAEngineeringAssistant_LLM_review"
    assert manifest["full_native_tia_project"] is False
    assert manifest["scope"] == "loaded_profile_only"
    assert manifest["ollama_used"] is False
    assert manifest["has_unloaded_sources"] is True
    assert all(not name.startswith("../") and "/../" not in name for name in files)
    assert len(files) == len(manifest["files"]) + 1
    assert {"MANIFEST.json", "MISSING_SOURCES.json", "README_FOR_CHATGPT.md",
            "review/OFFLINE_ANALYSIS.json", "project/fbs.json",
            "project/fcs.json", "project/instance_dbs.json"} <= files.keys()
    assert any(name.startswith("tia/fbs/") and name.endswith(".xml") for name in files)
    assert any(name.startswith("generated/udts/") and name.endswith(".scl") for name in files)
    assert any(name.startswith("generated/dbs/") and name.endswith(".scl") for name in files)
    assert any(name.startswith("selected/") and name.endswith(".scl") for name in files)
    assert b"FC_Unloaded" in files["MISSING_SOURCES.json"]
    assert b"MUST_NEVER_EXPORT" not in b"".join(files.values())
    assert b"not a native TIA project" in files["README_FOR_CHATGPT.md"]
    review = json.loads(files["review/OFFLINE_ANALYSIS.json"])
    assert any(x["name"] == "FC_Analyzed" for x in review["blocks"])
    for record in manifest["files"]:
        binary = files[record["path"]]
        assert hashlib.sha256(binary).hexdigest() == record["sha256"]
        assert len(binary) == record["bytes"]


def test_export_only_uploaded_scl_xml_without_tia():
    manifest, data = contents(client.post(API, json={
        "project":{},
        "files":[{"name":"C:\\source\\FC_Local.scl",
                  "content":"FUNCTION FC_Local : Bool\nEND_FUNCTION"}],
    }))
    assert manifest["profile"]["objects"] == {k:0 for k in (
        "udts", "dbs", "fbs", "fcs", "instance_dbs"
    )}
    assert any(n.startswith("selected/") for n in data)
    assert manifest["has_unloaded_sources"] is False


def test_empty_request_and_unsupported_source_are_rejected():
    assert client.post(API,json={"project":{}, "files":[]}).status_code == 422
    assert client.post(API,json={"files":[{"name":"binary.ap21","content":"x"}]}).status_code == 422
    assert client.post(API,json={"project":{"fbs":[{"name":"FB_One"},{"name":"FB_One"}]},
                                 "files":[]}).status_code == 200


def test_ollama_code_review_route_removed_but_deterministic_kept():
    assert client.post("/api/v1/code-review/ollama", json={
        "files":[{"name":"FC.scl","content":"FUNCTION FC_X"}],
    }).status_code == 404
    response = client.post("/api/v1/code-review/analyze-files", json=[
        {"name":"FC.scl","content":"FUNCTION FC_X"},
    ])
    assert response.status_code == 200
    assert response.json()["read_only"] is True


def test_xml_with_dtd_stays_rejected_in_deterministic_review():
    from engine.plc_code_review import ReviewInputFile, analyze_files
    report = analyze_files([ReviewInputFile(
        name="unsafe.xml",
        content='<!DOCTYPE X [<!ENTITY xxe SYSTEM "file:///secret">]><X>&xxe;</X>',
    )])
    assert report.files[0].verification_status == "failed"
    assert "rejected" in report.files[0].parsing_warnings[0]
