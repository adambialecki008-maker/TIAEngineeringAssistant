import json
import os
from pathlib import Path
import tempfile
from urllib import error as urllib_error
from urllib import request as urllib_request

from fastapi import APIRouter, HTTPException
from openpyxl import load_workbook

from engine.tia.adapter import (
    read_project_saved,
)
from engine.tia.compat import run_adapter
from engine.tia.models import (
    TranslateHmiTextsRequest,
    TranslateHmiTextsResponse,
)


router = APIRouter()


def _project_text_columns(
    worksheet,
):
    limit = min(
        worksheet.max_row,
        50,
    )


    for row_index in range(
        1,
        limit + 1,
    ):
        values = {
            str(
                cell.value
            )
            .strip()
            .casefold():
                cell.column
            for cell in worksheet[
                row_index
            ]
            if cell.value is not None
        }


        category_column =
            values.get(
                "category"
            )

        reference_column =
            values.get(
                "reference"
            )


        if (
            category_column is None
            or reference_column is None
            or category_column < 3
        ):
            continue


        return (
            row_index,
            category_column - 2,
            category_column - 1,
            category_column,
            reference_column,
        )


    return None


def _reference_matches_hmi(
    reference,
    device_name: str,
    hmi_name: str,
) -> bool:
    text = str(
        reference
        or
        ""
    ).replace(
        "/",
        "\\",
    )


    segments = [
        segment
            .strip()
            .casefold()
        for segment
        in text.split(
            "\\"
        )
        if segment.strip()
    ]


    targets = {
        device_name
            .strip()
            .casefold(),
        hmi_name
            .strip()
            .casefold(),
    }


    for segment in segments:
        for target in targets:
            if not target:
                continue


            if (
                segment == target
                or segment.startswith(
                    target
                    +
                    " ["
                )
            ):
                return True


    return False


def _output_text(
    response_data,
) -> str:
    for item in response_data.get(
        "output",
        [],
    ):
        if item.get(
            "type"
        ) != "message":
            continue


        for content in item.get(
            "content",
            [],
        ):
            if content.get(
                "type"
            ) != "output_text":
                continue


            text = content.get(
                "text"
            )


            if isinstance(
                text,
                str,
            ):
                return text


    raise RuntimeError(
        "Translation model returned no text output."
    )


def _clean_json_text(
    value: str,
) -> str:
    text = value.strip()


    if text.startswith(
        "```"
    ):
        lines = text.splitlines()


        if lines:
            lines = lines[1:]


        if (
            lines
            and lines[-1]
                .strip()
                .startswith(
                    "```"
                )
        ):
            lines = lines[:-1]


        text = "\n".join(
            lines
        ).strip()


    return text


def _translate_batch(
    texts: list[str],
    target_culture: str,
) -> dict[str, str]:
    api_key =
        os.getenv(
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


    model =
        os.getenv(
            "OPENAI_TRANSLATION_MODEL",
            "gpt-6-luna",
        ).strip()


    items = {
        str(
            index
        ):
            text
        for index, text
        in enumerate(
            texts
        )
    }


    payload = {
        "model":
            model,

        "store":
            False,

        "instructions":
            (
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

        "input":
            json.dumps(
                items,
                ensure_ascii=False,
            ),
    }


    request =
        urllib_request.Request(
            "https://api.openai.com/v1/responses",
            data=json.dumps(
                payload
            ).encode(
                "utf-8"
            ),
            headers={
                "Authorization":
                    "Bearer "
                    +
                    api_key,

                "Content-Type":
                    "application/json",
            },
            method="POST",
        )


    try:
        with urllib_request.urlopen(
            request,
            timeout=120,
        ) as response:
            response_data =
                json.loads(
                    response
                        .read()
                        .decode(
                            "utf-8"
                        )
                )

    except urllib_error.HTTPError as exc:
        detail =
            exc.read()
                .decode(
                    "utf-8",
                    errors="replace",
                )


        raise HTTPException(
            status_code=502,
            detail=(
                "OpenAI translation request failed: "
                +
                detail[:800]
            ),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "OpenAI translation request failed: "
                +
                str(
                    exc
                )
            ),
        ) from exc


    raw_text =
        _clean_json_text(
            _output_text(
                response_data
            )
        )


    try:
        translated =
            json.loads(
                raw_text
            )

    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Translation model returned invalid JSON."
            ),
        ) from exc


    if not isinstance(
        translated,
        dict,
    ):
        raise HTTPException(
            status_code=502,
            detail=(
                "Translation model returned an unexpected response."
            ),
        )


    result = {}


    for index, source_text in enumerate(
        texts
    ):
        key =
            str(
                index
            )

        target_text =
            translated.get(
                key
            )


        if not isinstance(
            target_text,
            str,
        ):
            raise HTTPException(
                status_code=502,
                detail=(
                    "Translation model omitted item "
                    +
                    key
                    +
                    "."
                ),
            )


        result[
            source_text
        ] = target_text


    return result


def _translate_texts(
    texts: list[str],
    target_culture: str,
) -> dict[str, str]:
    translated = {}


    for start in range(
        0,
        len(
            texts
        ),
        50,
    ):
        batch =
            texts[
                start:
                start + 50
            ]


        translated.update(
            _translate_batch(
                batch,
                target_culture,
            )
        )


    return translated


@router.post(
    "/hmis/translate-texts",
    response_model=TranslateHmiTextsResponse,
)
def translate_hmi_texts(
    request: TranslateHmiTextsRequest,
):
    source_culture =
        request
            .source_culture
            .strip()

    target_culture =
        request
            .target_culture
            .strip()


    if (
        source_culture.casefold()
        ==
        target_culture.casefold()
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
        str(
            request.process_id
        ),
        target_culture,
    )


    temporary_path = None


    try:
        with tempfile.NamedTemporaryFile(
            suffix=".xlsx",
            delete=False,
        ) as handle:
            temporary_path =
                Path(
                    handle.name
                )


        run_adapter(
            "export-project-texts",
            str(
                request.process_id
            ),
            source_culture,
            target_culture,
            str(
                temporary_path
            ),
        )


        if (
            not temporary_path.exists()
            or temporary_path.stat().st_size
            ==
            0
        ):
            raise HTTPException(
                status_code=502,
                detail=(
                    "TIA Portal did not create the project-text XLSX file."
                ),
            )


        workbook =
            load_workbook(
                temporary_path
            )


        matching_cells = []


        for worksheet in workbook.worksheets:
            columns =
                _project_text_columns(
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
                reference =
                    worksheet.cell(
                        row=row_index,
                        column=reference_column,
                    ).value


                if not _reference_matches_hmi(
                    reference,
                    request.device_name,
                    request.hmi_name,
                ):
                    continue


                source_cell =
                    worksheet.cell(
                        row=row_index,
                        column=source_column,
                    )

                target_cell =
                    worksheet.cell(
                        row=row_index,
                        column=target_column,
                    )

                source_text =
                    source_cell.value


                if (
                    source_text is None
                    or not str(
                        source_text
                    ).strip()
                ):
                    continue


                matching_cells.append(
                    (
                        str(
                            source_text
                        ),
                        target_cell,
                    )
                )


        if not matching_cells:
            raise HTTPException(
                status_code=404,
                detail=(
                    "No project-text rows were found for HMI "
                    f'"{request.hmi_name}". '
                    "Check that the HMI name appears in the TIA Project texts Reference column."
                ),
            )


        unique_texts = list(
            dict.fromkeys(
                text
                for text, _cell
                in matching_cells
            )
        )


        translations =
            _translate_texts(
                unique_texts,
                target_culture,
            )


        for source_text, target_cell in matching_cells:
            target_cell.value =
                translations[
                    source_text
                ]


        workbook.save(
            temporary_path
        )


        import_lines =
            run_adapter(
                "import-project-texts",
                str(
                    request.process_id
                ),
                str(
                    temporary_path
                ),
                "false",
            )


        import_state = ""
        import_log = ""


        for line in import_lines:
            if not line.startswith(
                "PROJECT_TEXTS_IMPORTED|"
            ):
                continue


            parts = line.split(
                "|",
                2,
            )


            if len(parts) >= 2:
                import_state =
                    parts[1]


            if len(parts) == 3:
                import_log =
                    parts[2]


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
