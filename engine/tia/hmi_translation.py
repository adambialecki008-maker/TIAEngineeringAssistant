import json
import os
from pathlib import Path
import tempfile
from urllib import error as urllib_error
from urllib import request as urllib_request

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from openpyxl import load_workbook

from engine.tia.adapter import read_project_saved
from engine.tia.compat import run_adapter
from engine.tia.models import (
    HmiProjectTextPreviewRow,
    HmiProjectTextRoot,
    HmiProjectTextSheetDiagnostic,
    HmiProjectTextsPreviewResponse,
    TranslateHmiTextsRequest,
    TranslateHmiTextsResponse,
)


load_dotenv()


router = APIRouter()


def _project_text_columns(worksheet, source_culture=None, target_culture=None):
    # Siemens TIA V21: Category | ViewPath | Internal ID |
    # Substitutions | en-US* | de-DE | ref="0" ...
    # Older/other layouts may use Category and Reference at the end.
    for row_index, row in enumerate(
        worksheet.iter_rows(min_row=1, max_row=50, values_only=True),
        start=1,
    ):
        names = {
            str(value).strip().casefold(): index
            for index, value in enumerate(row, start=1)
            if value is not None
        }
        category_col = names.get("category")
        reference_col = names.get("viewpath") or names.get("reference")
        if category_col is None or reference_col is None:
            continue

        if "viewpath" in names:
            source = (source_culture or "").strip().casefold()
            target = (target_culture or "").strip().casefold()
            source_col = names.get(source + "*") if source else None
            if source_col is None and source:
                source_col = names.get(source)
            if source_col is None:
                source_col = next(
                    (index for index, value in enumerate(row, start=1)
                     if isinstance(value, str) and value.strip().endswith("*")
                     and index > names["substitutions"]),
                    None,
                ) if "substitutions" in names else None

            target_col = names.get(target) if target else None
            if target_col is None and source:
                # In exports made before the target was enabled, TIA can
                # return source* and source as the two language columns.
                target_col = next(
                    (index for index, value in enumerate(row, start=1)
                     if index != source_col
                     and isinstance(value, str)
                     and value.strip().casefold() == source),
                    None,
                )
            if target_col is None and source_col is not None:
                # The next language column is adjacent to the source in
                # the two-language ExportProjectTexts XLSX format.
                possible = source_col + 1
                if possible <= len(row) and isinstance(row[possible - 1], str):
                    name = row[possible - 1].strip()
                    if name and not name.startswith('ref="'):
                        target_col = possible

            if source_col and target_col and source_col != target_col:
                return (
                    row_index, source_col, target_col,
                    category_col, reference_col,
                )
            continue

        # Previous workbook layout: languages precede Category, Reference.
        if category_col >= 3:
            return (
                row_index, category_col - 2, category_col - 1,
                category_col, reference_col,
            )
    return None



def _canonical_reference_part(
    value,
) -> str:
    text = str(
        value
        or
        ""
    ).casefold()

    result = []
    pending_separator = False

    for character in text:
        if character.isalnum():
            if pending_separator and result:
                result.append(
                    " "
                )

            result.append(
                character
            )

            pending_separator = False

        else:
            pending_separator = True

    return "".join(
        result
    ).strip()


def _segment_matches_target(
    segment: str,
    target: str,
) -> bool:
    if not target:
        return False

    if segment == target:
        return True

    if not segment.startswith(
        target
    ):
        return False

    if len(segment) == len(target):
        return True

    return not segment[
        len(target)
    ].isalnum()


def _view_path_root(reference) -> str:
    parts = str(reference or "").replace("/", "\\\\").split("\\\\")
    return parts[1].strip() if len(parts) >= 2 else ""


def _reference_matches_hmi(
    reference,
    device_name: str,
    hmi_name: str,
    view_path_root: str | None = None,
) -> bool:
    # Match the actual device/root of ViewPath, never arbitrary nested
    # screen or object names that might coincide with another HMI.
    root = _canonical_reference_part(_view_path_root(reference))
    targets = (
        [view_path_root]
        if view_path_root
        else [device_name, hmi_name]
    )
    return any(
        _segment_matches_target(root, _canonical_reference_part(name))
        for name in targets if name
    )



def _output_text(response_data) -> str:
    for item in response_data.get("output", []):
        if item.get("type") != "message":
            continue

        for content in item.get("content", []):
            if content.get("type") != "output_text":
                continue

            text = content.get("text")

            if isinstance(text, str):
                return text

    raise RuntimeError(
        "Translation model returned no text output."
    )


def _clean_json_text(value: str) -> str:
    text = value.strip()

    if text.startswith("```"):
        lines = text.splitlines()

        if lines:
            lines = lines[1:]

        if (
            lines
            and lines[-1].strip().startswith("```")
        ):
            lines = lines[:-1]

        text = "\n".join(lines).strip()

    return text


def _translate_batch(
    texts: list[str],
    target_culture: str,
) -> dict[str, str]:
    api_key = os.getenv(
        "OPENAI_API_KEY",
        "",
    ).strip()

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "OPENAI_API_KEY is not configured. "
                "Set it in the environment or .env before using automatic HMI translation."
            ),
        )

    model = os.getenv(
        "OPENAI_TRANSLATION_MODEL",
        "gpt-6-luna",
    ).strip()

    items = {
        str(index): text
        for index, text in enumerate(texts)
    }

    payload = {
        "model": model,
        "store": False,
        "instructions": (
            "Translate industrial HMI user-interface texts. "
            "The source-language metadata from TIA Portal may be wrong, "
            "so detect the actual source language from each text itself. "
            f"Translate every item to BCP-47 target language {target_culture}. "
            "If an item is already in the target language, keep its wording. "
            "Preserve PLC/HMI identifiers, placeholders, formatting tokens, "
            "numbers, units, punctuation and line breaks. "
            "Return JSON only: an object whose keys are the original item IDs "
            "and whose values are the translated strings. "
            "Do not add explanations."
        ),
        "input": json.dumps(
            items,
            ensure_ascii=False,
        ),
    }

    http_request = urllib_request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer " + api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(
            http_request,
            timeout=120,
        ) as response:
            response_data = json.loads(
                response.read().decode("utf-8")
            )

    except urllib_error.HTTPError as exc:
        detail = exc.read().decode(
            "utf-8",
            errors="replace",
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "OpenAI translation request failed: "
                + detail[:800]
            ),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "OpenAI translation request failed: "
                + str(exc)
            ),
        ) from exc

    raw_text = _clean_json_text(
        _output_text(response_data)
    )

    try:
        translated = json.loads(raw_text)

    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Translation model returned invalid JSON."
            ),
        ) from exc

    if not isinstance(translated, dict):
        raise HTTPException(
            status_code=502,
            detail=(
                "Translation model returned an unexpected response."
            ),
        )

    result = {}

    for index, source_text in enumerate(texts):
        key = str(index)
        target_text = translated.get(key)

        if not isinstance(target_text, str):
            raise HTTPException(
                status_code=502,
                detail=(
                    "Translation model omitted item "
                    + key
                    + "."
                ),
            )

        result[source_text] = target_text

    return result


def _translate_texts(
    texts: list[str],
    target_culture: str,
) -> dict[str, str]:
    translated = {}

    for start in range(0, len(texts), 50):
        batch = texts[start:start + 50]
        translated.update(
            _translate_batch(
                batch,
                target_culture,
            )
        )

    return translated


def _preview_workbook(workbook, request):
    from collections import Counter

    matched_rows = []
    unmatched_rows = []
    references = []
    reference_set = set()
    roots = Counter()
    diagnostics = []
    total = 0
    matched = 0
    headers = ("", "")
    sheets_found = 0

    for worksheet in workbook.worksheets:
        if hasattr(worksheet, "reset_dimensions"):
            worksheet.reset_dimensions()

        # Capture raw structure even when no expected column headers exist.
        sample = []
        for index, row in enumerate(
            worksheet.iter_rows(min_row=1, max_row=5, values_only=True),
            start=1,
        ):
            sample.append(
                str(index) + ": " + " | ".join(
                    str(value or "")[:100] for value in row[:6]
                )
            )

        columns = _project_text_columns(
            worksheet, request.source_culture, request.target_culture,
        )
        diagnostics.append(
            HmiProjectTextSheetDiagnostic(
                sheet_name=worksheet.title,
                declared_rows=worksheet.max_row,
                declared_columns=worksheet.max_column,
                sample_rows=sample,
            )
        )
        if columns is None:
            continue

        sheets_found += 1
        header_row, source_col, target_col, category_col, reference_col = columns

        head = next(
            worksheet.iter_rows(
                min_row=header_row, max_row=header_row, values_only=True
            ), (),
        )
        if not headers[0]:
            headers = (
                str(head[source_col - 1] or "")
                if len(head) >= source_col else "",
                str(head[target_col - 1] or "")
                if len(head) >= target_col else "",
            )

        for index, row in enumerate(
            worksheet.iter_rows(min_row=header_row + 1, values_only=True),
            start=header_row + 1,
        ):
            def cell_value(column):
                return row[column - 1] if len(row) >= column else None

            source = cell_value(source_col)
            reference = str(cell_value(reference_col) or "").strip()
            category = str(cell_value(category_col) or "")
            if reference and len(references) < 50 and reference not in reference_set:
                reference_set.add(reference)
                references.append(reference)

            if source is None or not str(source).strip():
                continue

            total += 1
            if "viewpath" in str(head[reference_col - 1]).casefold():
                root = _view_path_root(reference)
                if root and category.casefold().startswith("<hmi"):
                    roots[root] += 1

            matches = _reference_matches_hmi(
                reference, request.device_name, request.hmi_name,
                request.view_path_root,
            )
            if matches:
                matched += 1

            dest = matched_rows if matches else unmatched_rows
            if len(dest) < 50:
                dest.append(
                    HmiProjectTextPreviewRow(
                        sheet=worksheet.title,
                        row=index,
                        source_text=str(source),
                        target_text=str(cell_value(target_col) or ""),
                        category=category,
                        reference=reference,
                        matches_hmi=matches,
                    )
                )

    return HmiProjectTextsPreviewResponse(
        hmi_name=request.hmi_name,
        device_name=request.device_name,
        source_culture=request.source_culture,
        target_culture=request.target_culture,
        source_column_header=headers[0],
        target_column_header=headers[1],
        worksheets_found=sheets_found,
        worksheet_count=len(workbook.worksheets),
        sheet_diagnostics=diagnostics,
        view_path_roots=[
            HmiProjectTextRoot(root=name, rows=count)
            for name, count in roots.most_common(50)
        ],
        total_text_rows=total,
        matched_text_rows=matched,
        reference_examples=references,
        sample_rows=matched_rows + unmatched_rows,
    )


@router.post(
    "/hmis/preview-texts",
    response_model=HmiProjectTextsPreviewResponse,
)
def preview_hmi_texts(request: TranslateHmiTextsRequest):
    if request.source_culture.casefold() == request.target_culture.casefold():
        raise HTTPException(400, "Source and target slots must differ.")

    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as handle:
            temporary_path = Path(handle.name)

        run_adapter(
            "export-project-texts",
            str(request.process_id),
            request.source_culture.strip(),
            request.target_culture.strip(),
            str(temporary_path),
        )
        if not temporary_path.exists() or temporary_path.stat().st_size == 0:
            raise HTTPException(502, "TIA Portal did not create the project-text XLSX file.")

        workbook = load_workbook(temporary_path, read_only=True, data_only=True)
        try:
            return _preview_workbook(workbook, request)
        finally:
            workbook.close()
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink(missing_ok=True)


@router.post(
    "/hmis/translate-texts",
    response_model=TranslateHmiTextsResponse,
)
def translate_hmi_texts(
    request: TranslateHmiTextsRequest,
):
    source_culture = request.source_culture.strip()
    target_culture = request.target_culture.strip()

    if (
        source_culture.casefold()
        == target_culture.casefold()
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "The TIA source language slot and target language must differ. "
                "The actual language of the source text is detected from the text content."
            ),
        )

    run_adapter(
        "add-project-language",
        str(request.process_id),
        target_culture,
    )

    temporary_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=".xlsx",
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)

        run_adapter(
            "export-project-texts",
            str(request.process_id),
            source_culture,
            target_culture,
            str(temporary_path),
        )

        if (
            not temporary_path.exists()
            or temporary_path.stat().st_size == 0
        ):
            raise HTTPException(
                status_code=502,
                detail=(
                    "TIA Portal did not create the project-text XLSX file."
                ),
            )

        workbook = load_workbook(temporary_path)
        matching_cells = []
        seen_references = []

        for worksheet in workbook.worksheets:
            columns = _project_text_columns(
                worksheet
            )

            if columns is None:
                continue

            (
                header_row,
                source_column,
                target_column,
                _category_column,
                reference_column,
            ) = columns

            for row_index in range(
                header_row + 1,
                worksheet.max_row + 1,
            ):
                reference = worksheet.cell(
                    row=row_index,
                    column=reference_column,
                ).value

                if (
                    reference is not None
                    and str(reference).strip()
                    and len(seen_references) < 12
                ):
                    reference_text = str(
                        reference
                    ).strip()

                    if reference_text not in seen_references:
                        seen_references.append(
                            reference_text
                        )

                if not _reference_matches_hmi(
                    reference,
                    request.device_name,
                    request.hmi_name,
                ):
                    continue

                source_cell = worksheet.cell(
                    row=row_index,
                    column=source_column,
                )
                target_cell = worksheet.cell(
                    row=row_index,
                    column=target_column,
                )
                source_text = source_cell.value

                if (
                    source_text is None
                    or not str(source_text).strip()
                ):
                    continue

                matching_cells.append(
                    (
                        str(source_text),
                        target_cell,
                    )
                )

        if not matching_cells:
            examples = (
                " | ".join(
                    seen_references[:5]
                )
                if seen_references
                else "(no non-empty Reference values found)"
            )

            raise HTTPException(
                status_code=404,
                detail=(
                    "No project-text rows were found for HMI "
                    f'"{request.hmi_name}". '
                    "Example Reference values from the exported XLSX: "
                    + examples
                ),
            )

        unique_texts = list(
            dict.fromkeys(
                text
                for text, _cell in matching_cells
            )
        )

        translations = _translate_texts(
            unique_texts,
            target_culture,
        )

        for source_text, target_cell in matching_cells:
            target_cell.value = translations[
                source_text
            ]

        workbook.save(temporary_path)

        import_lines = run_adapter(
            "import-project-texts",
            str(request.process_id),
            str(temporary_path),
            "false",
        )

        import_state = ""
        import_log = ""

        for line in import_lines:
            if not line.startswith(
                "PROJECT_TEXTS_IMPORTED|"
            ):
                continue

            parts = line.split("|", 2)

            if len(parts) >= 2:
                import_state = parts[1]

            if len(parts) == 3:
                import_log = parts[2]

        return TranslateHmiTextsResponse(
            status="translated",
            hmi_name=request.hmi_name,
            source_culture=source_culture,
            target_culture=target_culture,
            translated_rows=len(
                matching_cells
            ),
            unique_texts=len(
                unique_texts
            ),
            import_state=import_state,
            import_log=import_log,
            project_saved=read_project_saved(
                import_lines
            ),
        )

    finally:
        if (
            temporary_path
            and temporary_path.exists()
        ):
            temporary_path.unlink(
                missing_ok=True
            )
