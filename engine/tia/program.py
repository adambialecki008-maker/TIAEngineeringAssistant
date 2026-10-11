from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET

from fastapi import APIRouter, HTTPException, Query

from engine.tia.compat import run_adapter
from engine.tia.models import (
    PlcProgramBlockDetail,
    PlcProgramBlockInfo,
)
from engine.tia.xml_parser import (
    parse_structure_xml,
)


router = APIRouter()


def _parse_optional_int(
    value: str,
) -> int | None:
    value = value.strip()


    if not value:
        return None


    try:
        return int(
            value
        )

    except ValueError:
        return None


def _parse_optional_bool(
    value: str,
) -> bool | None:
    normalized = (
        value
        .strip()
        .casefold()
    )


    if normalized == "true":
        return True


    if normalized == "false":
        return False


    return None


@router.get(
    "/plc-program-blocks",
    response_model=list[PlcProgramBlockInfo],
)
def get_plc_program_blocks(
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
    program_only: bool = Query(default=False),
):
    lines = run_adapter(
        "list-program-blocks",
        str(
            process_id
        ),
        device_name.strip(),
        plc_name.strip(),
        "program-only" if program_only else "all",
    )


    blocks = []


    for line in lines:
        if not line.startswith(
            "PLC_PROGRAM_BLOCK|"
        ):
            continue


        parts = line.split(
            "|",
            8,
        )


        if len(parts) != 9:
            continue


        try:
            load_memory_bytes = int(
                parts[7]
            )

            work_memory_bytes = int(
                parts[8]
            )

        except ValueError:
            continue


        blocks.append(
            PlcProgramBlockInfo(
                group_path=parts[1],
                name=parts[2],
                kind=parts[3],
                number=_parse_optional_int(
                    parts[4]
                ),
                programming_language=parts[5],
                is_consistent=_parse_optional_bool(
                    parts[6]
                ),
                load_memory_bytes=max(
                    0,
                    load_memory_bytes,
                ),
                work_memory_bytes=max(
                    0,
                    work_memory_bytes,
                ),
            )
        )


    if program_only:
        blocks = [b for b in blocks if b.kind in {"OB", "FC", "FB"}]

    blocks.sort(
        key=lambda block: (
            block.kind.casefold(),
            block.group_path.casefold(),
            block.name.casefold(),
        )
    )


    return blocks



@router.get(
    "/plc-program-block",
    response_model=PlcProgramBlockDetail,
)
def get_plc_program_block(
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
    group_path: str = Query(
        default="",
        max_length=512,
    ),
    name: str = Query(
        min_length=1,
        max_length=128,
    ),
):
    temporary_path = None


    try:
        with tempfile.NamedTemporaryFile(
            suffix=".xml",
            delete=False,
        ) as handle:
            temporary_path = Path(
                handle.name
            )


        lines = run_adapter(
            "export-program-block",
            str(
                process_id
            ),
            device_name.strip(),
            plc_name.strip(),
            group_path.strip(),
            name.strip(),
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
                    "TIA Openness did not produce "
                    "a block XML file."
                ),
            )


        metadata = None


        for line in lines:
            if not line.startswith(
                "PROGRAM_BLOCK_EXPORTED|"
            ):
                continue


            parts = line.split(
                "|",
                8,
            )


            if len(parts) != 9:
                continue


            try:
                load_memory_bytes = int(
                    parts[7]
                )

                work_memory_bytes = int(
                    parts[8]
                )

            except ValueError:
                continue


            metadata = PlcProgramBlockInfo(
                group_path=parts[1],
                name=parts[2],
                kind=parts[3],
                number=_parse_optional_int(
                    parts[4]
                ),
                programming_language=parts[5],
                is_consistent=_parse_optional_bool(
                    parts[6]
                ),
                load_memory_bytes=max(
                    0,
                    load_memory_bytes,
                ),
                work_memory_bytes=max(
                    0,
                    work_memory_bytes,
                ),
            )


        if metadata is None:
            raise HTTPException(
                status_code=502,
                detail=(
                    "TIA Openness did not return "
                    "block metadata."
                ),
            )


        try:
            members = parse_structure_xml(
                temporary_path
            )

        except ET.ParseError as error:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Cannot parse exported TIA block XML: "
                    f"{error}"
                ),
            )


        return PlcProgramBlockDetail(
            **metadata.model_dump(),
            members=members,
        )

    finally:
        if (
            temporary_path
            and temporary_path.exists()
        ):
            temporary_path.unlink(
                missing_ok=True
            )
