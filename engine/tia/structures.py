from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET

from fastapi import APIRouter, HTTPException, Query

from engine.tia.compat import run_adapter
from engine.tia.models import (
    PlcDataBlockInfo,
    PlcStructureDetail,
    PlcStructuresInfo,
    PlcUdtInfo,
)
from engine.tia.xml_parser import (
    parse_structure_xml,
)


router = APIRouter()


@router.get(
    "/plc-structures",
    response_model=PlcStructuresInfo,
    response_model_exclude_none=True,
)
def get_plc_structures(
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
        "list-structures",
        str(
            process_id
        ),
        device_name.strip(),
        plc_name.strip(),
    )


    data_blocks = []
    udts = []
    instance_owners = {}


    for line in lines:
        if line.startswith(
            "PLC_DB|"
        ):
            parts = line.split(
                "|",
                5,
            )


            if len(parts) != 6:
                continue


            try:
                data_blocks.append(
                    PlcDataBlockInfo(
                        group_path=parts[1],
                        name=parts[2],
                        number=int(
                            parts[3]
                        ),
                        block_kind=parts[4],
                        is_consistent=(
                            parts[5]
                            .strip()
                            .lower()
                            ==
                            "true"
                        ),
                    )
                )

            except ValueError:
                continue


        elif line.startswith("PLC_INSTANCE_DB_OWNER|"):
            # Optional, direct read-only metadata from InstanceDB in Openness.
            parts = line.split("|", 5)
            if len(parts) != 6 or not parts[2] or not parts[3] or parts[4] != "FB":
                continue
            try:
                number = int(parts[5])
            except ValueError:
                continue
            if number < 0:
                continue
            key = (parts[1].casefold(), parts[2].casefold())
            value = (parts[3], parts[4], number)
            if key in instance_owners and instance_owners[key] != value:
                # Conflicting metadata must never be treated as verified.
                instance_owners[key] = None
            elif key not in instance_owners:
                instance_owners[key] = value

        elif line.startswith(
            "PLC_UDT|"
        ):
            parts = line.split(
                "|",
                4,
            )


            if len(parts) != 5:
                continue


            udts.append(
                PlcUdtInfo(
                    group_path=parts[1],
                    name=parts[2],
                    type_kind=parts[3],
                    is_consistent=(
                        parts[4]
                        .strip()
                        .lower()
                        ==
                        "true"
                    ),
                )
            )


    for block in data_blocks:
        if block.block_kind.casefold() != "instancedb":
            continue
        owner = instance_owners.get((block.group_path.casefold(), block.name.casefold()))
        if owner is None:
            continue
        block.instance_of_name, block.instance_of_type, block.instance_of_number = owner

    data_blocks.sort(
        key=lambda item: (
            item.group_path.casefold(),
            item.number,
            item.name.casefold(),
        )
    )

    udts.sort(
        key=lambda item: (
            item.group_path.casefold(),
            item.name.casefold(),
        )
    )


    return PlcStructuresInfo(
        data_blocks=data_blocks,
        udts=udts,
    )


@router.get(
    "/plc-structure",
    response_model=PlcStructureDetail,
)
def get_plc_structure(
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
    kind: str = Query(
        pattern="^(db|udt)$",
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


        run_adapter(
            "export-structure",
            str(
                process_id
            ),
            device_name.strip(),
            plc_name.strip(),
            kind.strip().lower(),
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
                    "a structure XML file."
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
                    "Cannot parse exported TIA structure XML: "
                    f"{error}"
                ),
            )


        return PlcStructureDetail(
            kind=kind.strip().lower(),
            group_path=group_path.strip(),
            name=name.strip(),
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
