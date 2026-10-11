from pathlib import Path
import re
from zipfile import ZipFile

from fastapi.testclient import TestClient
from openpyxl import Workbook, load_workbook

import engine.tia_openness as tia_openness
from engine.main import app


client = TestClient(app)


def _write_sample_export(path: Path):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["English (United States)", "Polish (Poland)", "Category", "Reference"])
    sheet.append(["Zmiana", None, "Screen", "Project\\HMI_RT_1 [Runtime]\\Main"])
    sheet.append(["Zgniatarka", None, "Screen", "Project\\HMI_RT_10 [Runtime]\\Main"])
    sheet.append(["Zezwolenie na jazdę", None, "Screen", "Project\\HM_Conveyors [HMI]\\Main"])
    workbook.save(path)


def test_preview_is_read_only_and_filters_exact_hmi(monkeypatch):
    commands = []

    def adapter(*args):
        commands.append(args)
        if args[0] == "export-project-texts":
            _write_sample_export(Path(args[4]))
            return ["PROJECT_TEXTS_EXPORTED|" + args[4]]
        raise AssertionError("Preview must not add languages, import or save")

    monkeypatch.setattr(tia_openness, "_run_adapter", adapter)

    response = client.post(
        "/api/v1/tia/hmis/preview-texts",
        json={
            "process_id": 3544,
            "device_name": "HMI_RT_1",
            "hmi_name": "HMI_RT_1",
            "source_culture": "en-US",
            "target_culture": "pl-PL",
        },
    )

    assert response.status_code == 200
    result = response.json()
    assert result["total_text_rows"] == 3
    assert result["matched_text_rows"] == 1
    assert result["source_column_header"] == "English (United States)"
    assert result["target_column_header"] == "Polish (Poland)"
    assert any(r["source_text"] == "Zmiana" and r["matches_hmi"]
               for r in result["sample_rows"])
    assert any("HMI_RT_10" in ref for ref in result["reference_examples"])
    assert len(commands) == 1
    assert commands[0][0] == "export-project-texts"


def test_preview_rejects_same_language_without_export(monkeypatch):
    def forbidden(*args):
        raise AssertionError("No adapter call expected")

    monkeypatch.setattr(tia_openness, "_run_adapter", forbidden)
    response = client.post(
        "/api/v1/tia/hmis/preview-texts",
        json={
            "process_id": 3544,
            "device_name": "HMI_RT_1",
            "hmi_name": "HMI_RT_1",
            "source_culture": "pl-PL",
            "target_culture": "pl-PL",
        },
    )
    assert response.status_code == 400


def test_preview_handles_read_only_sheet_with_unknown_dimensions(monkeypatch):
    def adapter(*args):
        assert args[0] == "export-project-texts"
        path = Path(args[-1])
        _write_sample_export(path)

        # Simulate an XLSX exported without worksheet dimension metadata.
        with ZipFile(path, "r") as source:
            members = [
                (item, source.read(item.filename))
                for item in source.infolist()
            ]
        with ZipFile(path, "w") as destination:
            for item, data in members:
                if item.filename == "xl/worksheets/sheet1.xml":
                    data, count = re.subn(
                        rb"<dimension\\b[^>]*/>", b"", data, count=1
                    )
                    assert count == 1
                destination.writestr(item, data)

        workbook = load_workbook(path, read_only=True)
        try:
            assert workbook.active.max_row is None
        finally:
            workbook.close()
        return ["PROJECT_TEXTS_EXPORTED|" + str(path)]

    monkeypatch.setattr(tia_openness, "_run_adapter", adapter)

    response = client.post(
        "/api/v1/tia/hmis/preview-texts",
        json={
            "process_id": 13940,
            "device_name": "HMI_RT_1",
            "hmi_name": "HMI_RT_1",
            "source_culture": "en-US",
            "target_culture": "pl-PL",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total_text_rows"] == 3
    assert data["matched_text_rows"] == 1
    assert data["sample_rows"][0]["source_text"] == "Zmiana"
