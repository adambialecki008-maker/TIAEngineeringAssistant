from fastapi import APIRouter, Query

from engine.tia.adapter import (
    read_project_saved,
)
from engine.tia.compat import run_adapter
from engine.tia.models import (
    AddProjectLanguageRequest,
    AddProjectLanguageResponse,
    ProjectLanguageInfo,
)


router = APIRouter()


@router.get(
    "/languages",
    response_model=list[ProjectLanguageInfo],
)
def get_project_languages(
    process_id: int = Query(
        ge=1
    ),
):
    lines = run_adapter(
        "list-project-languages",
        str(
            process_id
        ),
    )


    languages = []


    for line in lines:
        if not line.startswith(
            "PROJECT_LANGUAGE|"
        ):
            continue


        parts = line.split(
            "|",
            6,
        )


        if len(parts) != 7:
            continue


        languages.append(
            ProjectLanguageInfo(
                culture=parts[1],
                english_name=parts[2],
                native_name=parts[3],
                is_active=(
                    parts[4]
                    .strip()
                    .casefold()
                    ==
                    "true"
                ),
                is_editing=(
                    parts[5]
                    .strip()
                    .casefold()
                    ==
                    "true"
                ),
                is_reference=(
                    parts[6]
                    .strip()
                    .casefold()
                    ==
                    "true"
                ),
            )
        )


    languages.sort(
        key=lambda language: (
            not language.is_active,
            language.english_name.casefold(),
            language.culture.casefold(),
        )
    )


    return languages


@router.post(
    "/languages",
    response_model=AddProjectLanguageResponse,
)
def add_project_language(
    request: AddProjectLanguageRequest,
):
    lines = run_adapter(
        "add-project-language",
        str(
            request.process_id
        ),
        request.culture.strip(),
    )


    culture = request.culture.strip()


    for line in lines:
        if not line.startswith(
            "LANGUAGE_ADDED|"
        ):
            continue


        parts = line.split(
            "|",
            1,
        )


        if len(parts) == 2:
            culture = parts[1]


    return AddProjectLanguageResponse(
        status="added",
        culture=culture,
        project_saved=read_project_saved(
            lines
        ),
    )
