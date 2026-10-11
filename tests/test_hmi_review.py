"""Staged HMI translation: no TIA changes before approval and verified import."""
from pathlib import Path

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

import engine.tia_openness as tia_openness
from engine.main import app
import engine.tia.hmi_review as review_module

client = TestClient(app)


def _export_file(path: Path, live_targets: dict):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "User Texts"
    sheet.append([
        "Category", "ViewPath", "Internal ID",
        "Substitutions", "en-US*", "pl-PL", 'ref="0"',
    ])
    records = [
        ("main-1", "Project\\HMI_00_Main\\Screens\\Main\\Text",
         "212BP2 Za zaworem", "Text"),
        ("main-2", "Project\\HMI_00_Main\\Screens\\Status\\Text",
         "Zgniatarka", "Zgniatarka"),
        ("other-1", "Project\\Another_HMI\\Screens\\Main\\Text",
         "Do not translate", "Do not translate"),
    ]
    for internal_id, path_value, source, default_target in records:
        sheet.append([
            "<HMI screen>", path_value, internal_id, "",
            source, live_targets.get(internal_id, default_target), "",
        ])
    sheet2 = workbook.create_sheet("System Texts")
    sheet2.append([
        "Category", "ViewPath", "Internal ID",
        "Substitutions", "en-US*", "pl-PL", 'ref="0"',
    ])
    workbook.save(path)


REQUEST = {
    "process_id": 13940,
    "device_name": "HMI_RT_1",
    "hmi_name": "HMI_RT_1",
    "view_path_root": "HMI_00_Main",
    "source_culture": "en-US",
    "target_culture": "pl-PL",
    "max_rows": 10,
}


def _setup(monkeypatch, *, verify_updates=True, stale=False):
    live = {}
    commands = []
    imported = []

    def adapter(*args):
        commands.append(args[0])
        if args[0] == "add-project-language":
            return ["LANGUAGE_ADDED|pl-PL"]
        if args[0] == "export-project-texts":
            if stale and "add-project-language" in commands:
                live["main-1"] = "Edited by another user"
            _export_file(Path(args[4]), live)
            return ["PROJECT_TEXTS_EXPORTED|" + args[4]]
        if args[0] == "import-project-texts":
            workbook = load_workbook(args[2])
            for row in list(workbook["User Texts"].values)[1:]:
                imported.append((row[2], row[5]))
                if verify_updates:
                    live[row[2]] = row[5]
            workbook.close()
            return [
                "PROJECT_TEXTS_IMPORTED|Success|C:\\TIA\\import.log",
                "PROJECT_SAVED|TestProject",
            ]
        raise AssertionError("Unexpected adapter call " + args[0])

    monkeypatch.setenv("OPENAI_API_KEY", "dummy")
    monkeypatch.setattr(tia_openness, "_run_adapter", adapter)
    monkeypatch.setattr(
        review_module, "_translate_texts",
        lambda texts, target: {
            source: {"212BP2 Za zaworem": "212BP2 Za zaworem",
                     "Zgniatarka": "Zgniatarka"}.get(source, source)
            for source in texts
        },
    )
    review_module._REVIEWS.clear()
    return live, commands, imported


def test_prepare_does_not_modify_tia_and_shows_current_vs_proposed(monkeypatch):
    live, commands, imported = _setup(monkeypatch)
    response = client.post(
        "/api/v1/tia/hmis/prepare-translations", json=REQUEST,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["selected_rows"] == 2
    assert data["unique_texts"] == 2
    assert len(data["review_id"]) == 32
    assert data["examples"][0]["current_target"] == "Text"
    assert data["examples"][0]["proposed_target"] == "212BP2 Za zaworem"
    assert commands == ["export-project-texts"]
    assert imported == []
    assert live == {}


def test_import_only_approved_hmi_and_verify_export(monkeypatch):
    live, commands, imported = _setup(monkeypatch)
    prepared = client.post(
        "/api/v1/tia/hmis/prepare-translations", json=REQUEST,
    ).json()
    response = client.post(
        "/api/v1/tia/hmis/import-reviewed-translations",
        json={"review_id": prepared["review_id"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "verified"
    assert response.json()["imported_rows"] == 2
    assert response.json()["verified_rows"] == 2
    assert imported == [
        ("main-1", "212BP2 Za zaworem"),
        ("main-2", "Zgniatarka"),
    ]
    assert "other-1" not in live
    assert commands == [
        "export-project-texts",   # prepare
        "add-project-language",   # only after approval
        "export-project-texts",   # re-check project just before import
        "import-project-texts",
        "export-project-texts",   # verify actual TIA values
    ]
    repeat = client.post(
        "/api/v1/tia/hmis/import-reviewed-translations",
        json={"review_id": prepared["review_id"]},
    )
    assert repeat.status_code == 404


def test_import_rejects_modified_tia_text_after_review(monkeypatch):
    _live, commands, imported = _setup(monkeypatch, stale=True)
    prepared = client.post(
        "/api/v1/tia/hmis/prepare-translations", json=REQUEST,
    ).json()
    response = client.post(
        "/api/v1/tia/hmis/import-reviewed-translations",
        json={"review_id": prepared["review_id"]},
    )
    assert response.status_code == 409, response.text
    assert imported == []
    assert "import-project-texts" not in commands


def test_import_is_not_reported_success_without_reexport_match(monkeypatch):
    _live, _commands, imported = _setup(monkeypatch, verify_updates=False)
    prepared = client.post(
        "/api/v1/tia/hmis/prepare-translations", json=REQUEST,
    ).json()
    response = client.post(
        "/api/v1/tia/hmis/import-reviewed-translations",
        json={"review_id": prepared["review_id"]},
    )
    assert len(imported) == 2
    assert response.status_code == 502
    assert "verification failed" in response.json()["detail"]
    assert "import.log" in response.json()["detail"]


def test_prepare_rejects_placeholder_for_nonplaceholder_source(monkeypatch):
    _setup(monkeypatch)
    monkeypatch.setattr(
        review_module, "_translate_texts",
        lambda texts, target: {source: "Text" for source in texts},
    )
    response = client.post(
        "/api/v1/tia/hmis/prepare-translations", json=REQUEST,
    )
    assert response.status_code == 502
    assert "placeholder" in response.json()["detail"]


def test_pilot_preserves_unreviewed_sibling_texts_in_same_hmi(monkeypatch):
    _live, _commands, imported = _setup(monkeypatch)
    pilot_request = {**REQUEST, "max_rows": 1}
    prepared = client.post(
        "/api/v1/tia/hmis/prepare-translations",
        json=pilot_request,
    ).json()
    assert prepared["selected_rows"] == 1
    response = client.post(
        "/api/v1/tia/hmis/import-reviewed-translations",
        json={"review_id": prepared["review_id"]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["verified_rows"] == 1
    # Parent-object/sibling rows are preserved, but never retranslated.
    assert imported == [
        ("main-1", "212BP2 Za zaworem"),
        ("main-2", "Zgniatarka"),
    ]
