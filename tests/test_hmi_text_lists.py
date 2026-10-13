"""Project texts XLSX must exclude Text lists and Graphic lists."""
from pathlib import Path

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

from engine.main import app
from engine.tia import hmi_review, hmi_translation, hmi_batches
import engine.tia_openness as tia_openness


client = TestClient(app)
ROOT = "Project\\HMI_00_Main\\Text and graphic lists"
SOURCE_1 = "Karuzela płyta gotowa, prawa strona"
SOURCE_2 = "Ladowanie plyty na stacje 1"
REQUEST = {
    "process_id": 13940,
    "device_name": "HMI_RT_1",
    "hmi_name": "HMI_RT_1",
    "view_path_root": "HMI_00_Main",
    "source_culture": "en-US",
    "target_culture": "pl-PL",
    "ollama_model": "test-model",
    "max_rows": 10,
}


def _export(path, values):
    wb = Workbook()
    ws = wb.active
    ws.title = "User Texts"
    ws.append([
        "Category", "ViewPath", "Internal ID", "Substitutions",
        "en-US*", "pl-PL", 'ref="0"',
    ])
    data = [
        ("screen-1", "<HMI screen>",
         "Project\\HMI_00_Main\\Screens\\Main\\Text",
         "Awaria pompy"),
        ("textlist-1", "<HMI text list>", ROOT +
         "\\Text lists\\Auto Status\\Text_list_entry_3\\Text",
         SOURCE_1),
        ("textlist-2", "<HMI text list>", ROOT +
         "\\Text lists\\Auto Status\\Text_list_entry_18\\Text",
         SOURCE_2),
        ("graphic-1", "<HMI graphic list>", ROOT +
         "\\Graphic lists\\Lamp Status\\Graphic_list_entry_1\\Graphic",
         "lamp_status_red.png"),
        ("other-1", "<HMI text list>",
         "Project\\Another_HMI\\Text and graphic lists\\Text lists"
         "\\Other List\\Text_list_entry_1\\Text",
         "Other HMI label"),
    ]
    for row_id, category, viewpath, text in data:
        ws.append([
            category, viewpath, row_id, "", text,
            values.get(row_id, "Text"), "",
        ])
    wb.save(path)
    wb.close()


def test_classifies_only_actual_text_list_entries():
    classify = hmi_translation._hmi_project_text_kind
    assert classify(
        "<HMI text list>", ROOT + "\\Text lists\\Auto Status"
        "\\Text_list_entry_3\\Text",
    ) == "text_list"
    assert classify(
        "<HMI text>", ROOT + "\\Text lists\\Auto Status"
        "\\Text_list_entry_3\\Text",
    ) == "text_list"
    assert classify(
        "<HMI graphic list>", ROOT + "\\Graphic lists\\Lamp"
        "\\Graphic_list_entry_1",
    ) == "graphic_list"
    assert classify(
        "<HMI screen>", ROOT + "\\Screens\\Main\\Text",
    ) == "other"
    # The shared TIA parent is not in itself a graphic-list entry.
    assert classify(
        "<HMI screen>", ROOT + "\\Screens\\Main\\Text",
    ) != "graphic_list"


def test_project_texts_scan_excludes_text_and_graphic_lists(monkeypatch):
    values = {}
    calls = []

    def fake_adapter(*args):
        calls.append(args[0])
        assert args[0] == "export-project-texts"
        _export(Path(args[-1]), values)
        return ["PROJECT_TEXTS_EXPORTED|" + args[-1]]

    monkeypatch.setattr(tia_openness, "_run_adapter", fake_adapter)
    result = client.post("/api/v1/tia/hmis/preview-texts", json=REQUEST)
    assert result.status_code == 200, result.text
    payload = result.json()
    assert payload["matched_text_rows"] == 1
    assert payload["matched_missing_target_rows"] == 1
    assert payload["matched_text_list_rows"] == 0
    assert payload["matched_text_list_unique_texts"] == 0
    assert payload["matched_missing_text_list_rows"] == 0
    assert payload["matched_missing_text_list_unique_texts"] == 0
    assert payload["excluded_graphic_list_rows"] == 1
    assert payload["text_list_sample_rows"] == []
    assert {r["source_text"] for r in payload["sample_rows"]} == {
        "Awaria pompy",
    }
    assert all("graphic" not in r["category"].lower()
               for r in payload["sample_rows"])
    assert "Other HMI label" not in {
        r["source_text"] for r in payload["text_list_sample_rows"]
    }
    assert calls == ["export-project-texts"]


def test_project_reviewed_import_excludes_text_lists_graphics_and_other_hmis(
    monkeypatch,
):
    values = {}
    calls = []
    imports = []

    def adapter(*args):
        calls.append(args[0])
        if args[0] == "export-project-texts":
            _export(Path(args[-1]), values)
            return ["PROJECT_TEXTS_EXPORTED|" + args[-1]]
        if args[0] == "add-project-language":
            return ["LANGUAGE_ADDED|pl-PL"]
        if args[0] == "import-project-texts":
            wb = load_workbook(args[2])
            for row in list(wb["User Texts"].values)[1:]:
                imports.append((row[2], row[4], row[5]))
                values[row[2]] = row[5]
            wb.close()
            return [
                "PROJECT_TEXTS_IMPORTED|Success|test-import.log",
                "PROJECT_SAVED|TestProject",
            ]
        raise AssertionError(args)

    monkeypatch.setattr(tia_openness, "_run_adapter", adapter)
    monkeypatch.setattr(
        hmi_review, "resolve_ollama_model", lambda model: "test-model",
    )
    monkeypatch.setattr(
        hmi_review, "_translate_texts",
        lambda texts, culture, model, progress=None:
            {source: source for source in texts},
    )
    hmi_review._REVIEWS.clear()
    response = client.post(
        "/api/v1/tia/hmis/prepare-translations", json=REQUEST,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["selected_rows"] == 1
    assert data["skipped_unique"] == 0
    assert {row["source_text"] for row in data["examples"]} == {
        "Awaria pompy",
    }
    assert calls == ["export-project-texts"]
    approved = client.post(
        "/api/v1/tia/hmis/import-reviewed-translations",
        json={"review_id": data["review_id"]},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["verified_rows"] == 1
    assert "textlist-1" not in values
    assert "textlist-2" not in values
    assert values["screen-1"] == "Awaria pompy"
    assert "graphic-1" not in values
    assert "other-1" not in values
    assert {key for key, _source, _target in imports} == {
        "screen-1",
    }
    assert all(source == target for _, source, target in imports)
    assert calls.count("import-project-texts") == 1
    assert calls.count("export-project-texts") == 3



def test_project_batch_does_not_import_text_or_graphic_lists(
    monkeypatch, tmp_path,
):
    values = {}
    calls = []
    imported_ids = []
    monkeypatch.setattr(hmi_batches, "JOB_DIR", tmp_path)
    hmi_batches._ACTIVE_JOBS.clear()
    monkeypatch.setattr(
        hmi_batches, "resolve_ollama_model", lambda model: "test-model",
    )
    monkeypatch.setattr(
        hmi_review, "_translate_texts",
        lambda texts, culture, model, progress=None:
            {source: source for source in texts},
    )

    def adapter(*args):
        calls.append(args[0])
        if args[0] == "export-project-texts":
            _export(Path(args[-1]), values)
            return ["PROJECT_TEXTS_EXPORTED|" + args[-1]]
        if args[0] == "add-project-language":
            return ["LANGUAGE_ADDED|pl-PL"]
        if args[0] == "import-project-texts":
            wb = load_workbook(args[2])
            for row in list(wb["User Texts"].values)[1:]:
                imported_ids.append(row[2])
                values[row[2]] = row[5]
            wb.close()
            return [
                "PROJECT_TEXTS_IMPORTED|Success|test-import.log",
                "PROJECT_SAVED|TestProject",
            ]
        raise AssertionError(args)

    monkeypatch.setattr(tia_openness, "_run_adapter", adapter)
    started = client.post(
        "/api/v1/tia/hmis/batch-translations/start",
        json={**REQUEST, "batch_size": 2, "total_to_translate": 3},
    )
    assert started.status_code == 200, started.text
    job_id = started.json()["job_id"]
    for _ in range(2):
        current = client.post(
            f"/api/v1/tia/hmis/batch-translations/{job_id}/next", json={},
        )
        assert current.status_code == 200, current.text
    assert current.json()["status"] == "completed"
    assert current.json()["completed_unique"] == 1
    assert current.json()["skipped_unique"] == 0
    assert "textlist-1" not in values
    assert "textlist-2" not in values
    assert values["screen-1"] == "Awaria pompy"
    assert "graphic-1" not in values
    assert "other-1" not in values
    assert "textlist-1" not in imported_ids
    assert "textlist-2" not in imported_ids
    assert "graphic-1" not in imported_ids
    assert "other-1" not in imported_ids
    assert calls.count("import-project-texts") == 1
