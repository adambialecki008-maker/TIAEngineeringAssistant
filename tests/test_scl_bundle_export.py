"""Offline SCL bundle: dependency order, hashes, scope and fail-closed input.

This suite must never require or invoke a running Siemens TIA process.
"""
from __future__ import annotations

import hashlib
import io
import json
import zipfile

from fastapi.testclient import TestClient

from engine.main import app
from engine.tia import source_import

client = TestClient(app)
EXPORT = "/api/v1/tia/plc-structure-import/export"
PREVIEW = "/api/v1/tia/plc-structure-import/preview"


def project():
    return {
        "udts": [
            {"name": "UDT_Parent", "fields": [
                {"name": "Child", "data_type": "UDT_Child",
                 "hmi_visible": True, "comment": "Nested reference"},
                {"name": "Values", "data_type": "Array", "array_element_type": "Real",
                 "array_lower_bound": -2, "array_upper_bound": 4},
            ]},
            {"name": "UDT_Child", "fields": [
                {"name": "Ready", "data_type": "Bool", "start_value": "TRUE"},
            ]},
            {"name": "UDT_Extra", "fields": [
                {"name": "Count", "data_type": "DInt"},
            ]},
        ],
        "dbs": [
            {"name": "DB_Main", "retain": False, "members": [
                {"name": "Motors", "data_type": "Array",
                 "array_element_type": "UDT_Parent",
                 "array_lower_bound": 1, "array_upper_bound": 3},
                {"name": "Retained", "data_type": "Int", "retain": True,
                 "start_value": "25"},
            ]},
            {"name": "DB_Extra", "members": [
                {"name": "Counter", "data_type": "UDT_Extra"}
            ]},
        ],
    }


def select(*, udts=None, dbs=None, config=None):
    return {"project": config if config is not None else project(),
            "selected_udts": udts, "selected_dbs": dbs}


def read_zip(data):
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        files = {name: z.read(name) for name in z.namelist()}
    manifest = json.loads(files["manifest.json"])
    return manifest, files


def forbid_tia(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Offline SCL export must never access Openness")
    for name in ("run_adapter", "get_project_context", "get_plc_structures",
                 "get_plc_structure"):
        monkeypatch.setattr(source_import, name, forbidden)


def test_export_selected_db_and_auto_udts_without_tia(monkeypatch):
    forbid_tia(monkeypatch)
    payload = select(udts=[], dbs=["DB_Main"])
    before = json.dumps(payload, sort_keys=True)
    result = client.post(EXPORT, json=payload)
    assert result.status_code == 200, result.text
    assert result.headers["content-type"] == "application/zip"
    assert result.headers["cache-control"] == "no-store"
    assert "attachment;" in result.headers["content-disposition"]
    assert result.content[:2] == b"PK"
    assert json.dumps(payload, sort_keys=True) == before

    manifest, files = read_zip(result.content)
    assert manifest["kind"] == "plc_structure_source_bundle"
    assert manifest["schema_version"] == 1
    assert manifest["safety"]["tia_modified"] is False
    assert manifest["safety"]["tia_compilation_verified"] is False
    assert manifest["requested"] == {"udts": [], "dbs": ["DB_Main"]}
    assert manifest["auto_dependencies"] == ["UDT_Child", "UDT_Parent"]
    assert [x["name"] for x in manifest["files"]] == [
        "UDT_Child", "UDT_Parent", "DB_Main",
    ]
    assert [x["order"] for x in manifest["files"]] == [1, 2, 3]
    assert len(files) == 5  # 3 sources, manifest and README
    assert "UDT_Extra" not in str(manifest)
    for index, entry in enumerate(manifest["files"], start=1):
        name = entry["file"]
        assert name.startswith(f"{index:03}_")
        assert files[name].endswith(b"\n")
        assert hashlib.sha256(files[name]).hexdigest() == entry["sha256"]
    parent = manifest["files"][1]
    db = manifest["files"][2]
    assert parent["requires_udts"] == ["UDT_Child"]
    assert db["requires_udts"] == ["UDT_Parent"]
    assert parent["auto_dependency"] is True
    assert db["auto_dependency"] is False
    assert "Array[1..3]" in files[db["file"]].decode("ascii")
    assert "VAR RETAIN" in files[db["file"]].decode("ascii")
    assert "Retained : Int := 25" in files[db["file"]].decode("ascii")
    assert b"no connection" in files["README.txt"].lower() or b"no connection" in (
        files["README.txt"].lower().replace(b"or write", b"or connection")
    )


def test_export_matches_preview_scope_and_is_reproducible(monkeypatch):
    forbid_tia(monkeypatch)
    payload = select(udts=["UDT_Parent"], dbs=[])
    preview = client.post(PREVIEW, json=payload)
    assert preview.status_code == 200, preview.text
    first = client.post(EXPORT, json=payload)
    second = client.post(EXPORT, json=payload)
    assert first.status_code == 200, first.text
    assert first.content == second.content
    manifest, files = read_zip(first.content)
    assert [x["name"] for x in manifest["files"]] == ["UDT_Child", "UDT_Parent"]
    assert all(x["kind"] == "udt" for x in manifest["files"])
    assert all("DB_" not in filename for filename in files)
    expected_sources = preview.json()["source"].split("\n\n")
    assert [files[item["file"]].decode("ascii").rstrip("\n")
            for item in manifest["files"]] == expected_sources


def test_export_reports_external_udt_without_pretending_it_is_present(monkeypatch):
    forbid_tia(monkeypatch)
    config = {"udts": [], "dbs": [{
        "name": "DB_External", "members": [
            {"name": "External", "data_type": "UDT_NotInLocalConfig"},
        ],
    }]}
    response = client.post(EXPORT, json=select(
        udts=[], dbs=["DB_External"], config=config))
    assert response.status_code == 200, response.text
    manifest, _ = read_zip(response.content)
    assert manifest["external_type_references"] == ["udt_notinlocalconfig"]
    assert manifest["files"][0]["external_udts_or_types"] == [
        "udt_notinlocalconfig",
    ]
    assert manifest["safety"]["tia_compilation_verified"] is False


def test_invalid_selection_and_structure_never_access_tia(monkeypatch):
    forbid_tia(monkeypatch)
    for payload in (
        select(udts=[], dbs=[]),
        select(udts=[], dbs=["DB_Missing"]),
        select(udts=["UDT_Child", "UDT_Child"], dbs=[]),
    ):
        response = client.post(EXPORT, json=payload)
        assert response.status_code == 422, response.status_code

    cyclic = project()
    cyclic["udts"][1]["fields"] = [{"name": "Parent", "data_type": "UDT_Parent"}]
    response = client.post(EXPORT, json=select(
        udts=["UDT_Parent"], dbs=[], config=cyclic))
    assert response.status_code == 422, response.text
    assert "Circular" in response.text

    bad = project()
    bad["dbs"][0]["members"][0]["array_upper_bound"] = 0
    response = client.post(EXPORT, json=select(
        udts=[], dbs=["DB_Main"], config=bad))
    assert response.status_code == 422, response.text

    duplicate = project()
    duplicate["udts"].append(duplicate["udts"][1].copy())
    response = client.post(EXPORT, json=select(
        udts=["UDT_Child"], dbs=[], config=duplicate))
    assert response.status_code == 422, response.text


def test_all_selected_sources_have_consistent_manifest(monkeypatch):
    forbid_tia(monkeypatch)
    response = client.post(EXPORT, json=select(udts=None, dbs=None))
    assert response.status_code == 200, response.text
    manifest, files = read_zip(response.content)
    assert [entry["name"] for entry in manifest["files"]][-2:] == [
        "DB_Main", "DB_Extra",
    ]
    assert set(files) == {entry["file"] for entry in manifest["files"]} | {
        "manifest.json", "README.txt",
    }
    assert manifest["external_type_references"] == []
