from fastapi import APIRouter, Query

from engine.tia.compat import run_adapter
from engine.tia.models import (
    PlcProgramBlockInfo,
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
):
    lines = run_adapter(
        "list-program-blocks",
        str(
            process_id
        ),
        device_name.strip(),
        plc_name.strip(),
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


    blocks.sort(
        key=lambda block: (
            block.kind.casefold(),
            block.group_path.casefold(),
            block.name.casefold(),
        )
    )


    return blocks
