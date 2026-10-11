from pathlib import Path
import tempfile

from fastapi import APIRouter, HTTPException, Query

from engine.tia.adapter import read_project_saved
from engine.tia.compat import run_adapter
from engine.tia.models import (
    CreatePlcTagsRequest,
    CreatePlcTagsResponse,
    PlcTagInfo,
)


router = APIRouter()


@router.get(
    "/plc-tags",
    response_model=list[PlcTagInfo],
)
def get_plc_tags(
    process_id: int = Query(
        ge=1
    ),
    device_name: str = Query(
        min_length=1,
        max_length=128,
    ),
    plc_name: str = Query(
        min_length=1,
        max_length=128,
    ),
):
    lines = run_adapter(
        "list-tags",
        str(
            process_id
        ),
        device_name.strip(),
        plc_name.strip(),
    )


    tags = []


    for line in lines:
        if not line.startswith(
            "PLC_TAG|"
        ):
            continue


        parts = line.split(
            "|",
            4,
        )


        if len(parts) != 5:
            continue


        tags.append(
            PlcTagInfo(
                table_path=parts[1],
                name=parts[2],
                data_type=parts[3],
                logical_address=parts[4],
            )
        )


    tags.sort(
        key=lambda tag: (
            tag.table_path.casefold(),
            tag.name.casefold(),
        )
    )


    return tags


@router.post(
    "/plc-tags",
    response_model=CreatePlcTagsResponse,
    status_code=201,
)
def create_plc_tags(
    request: CreatePlcTagsRequest,
):
    for tag in request.tags:
        for value in (
            tag.name,
            tag.data_type,
            tag.logical_address,
        ):
            if (
                "\t" in value
                or "\n" in value
                or "\r" in value
            ):
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "Tag fields cannot contain "
                        "tabs or line breaks."
                    ),
                )


    temporary_path = None


    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            suffix=".tsv",
            delete=False,
        ) as temporary_file:
            temporary_path = Path(
                temporary_file.name
            )


            for tag in request.tags:
                temporary_file.write(
                    f"{tag.name}\t"
                    f"{tag.data_type}\t"
                    f"{tag.logical_address}\n"
                )


        lines = run_adapter(
            "create-tags",
            str(
                request.process_id
            ),
            request.device_name.strip(),
            request.plc_name.strip(),
            request.tag_table_name.strip(),
            str(
                temporary_path
            ),
        )

    finally:
        if (
            temporary_path is not None
            and temporary_path.exists()
        ):
            try:
                temporary_path.unlink()

            except OSError:
                pass


    created_count = 0
    tag_table_name = (
        request.tag_table_name.strip()
    )


    for line in lines:
        if line.startswith(
            "TAG_CREATED|"
        ):
            created_count += 1

        elif line.startswith(
            "TAG_TABLE|"
        ):
            parts = line.split(
                "|",
                1,
            )


            if len(parts) == 2:
                tag_table_name = parts[1]


    if created_count != len(
        request.tags
    ):
        raise HTTPException(
            status_code=502,
            detail=(
                "Adapter did not confirm creation "
                "of all PLC tags."
            ),
        )


    return CreatePlcTagsResponse(
        status="created",
        tag_table_name=tag_table_name,
        created_count=created_count,
        project_saved=read_project_saved(
            lines
        ),
    )
