from fastapi import APIRouter, Query

from engine.tia.compat import run_adapter
from engine.tia.models import (
    HardwareItem,
    IoAddress,
    IoChannel,
    IoInventory,
)


router = APIRouter()


@router.get(
    "/io",
    response_model=IoInventory,
)
def get_project_io(
    process_id: int = Query(
        ge=1
    ),
):
    lines = run_adapter(
        "list-io",
        str(
            process_id
        ),
    )


    project_name = None
    profinet_device_names = {}
    items = []
    addresses = []
    channels = []


    for line in lines:
        if line.startswith(
            "PROJECT|"
        ):
            parts = line.split(
                "|",
                1,
            )


            if len(parts) == 2:
                project_name = parts[1]


        elif line.startswith("PN_DEVICE_NAME|"):
            parts = line.split("|", 2)
            if len(parts) == 3 and parts[1].strip() and parts[2].strip():
                profinet_device_names[parts[1]] = parts[2]

        elif line.startswith(
            "HW_ITEM|"
        ):
            parts = line.split(
                "|",
                7,
            )


            if len(parts) != 8:
                continue


            try:
                items.append(
                    HardwareItem(
                        device_name=parts[1],
                        item_path=parts[2],
                        item_name=parts[3],
                        type_identifier=parts[4],
                        is_plugged=(
                            parts[5]
                            .strip()
                            .lower()
                            ==
                            "true"
                        ),
                        address_count=int(
                            parts[6]
                        ),
                        channel_count=int(
                            parts[7]
                        ),
                    )
                )

            except ValueError:
                continue


        elif line.startswith(
            "IO_ADDRESS|"
        ):
            parts = line.split(
                "|",
                7,
            )


            if len(parts) != 8:
                continue


            try:
                addresses.append(
                    IoAddress(
                        device_name=parts[1],
                        item_path=parts[2],
                        item_name=parts[3],
                        type_identifier=parts[4],
                        io_type=parts[5],
                        start_address=int(
                            parts[6]
                        ),
                        length=int(
                            parts[7]
                        ),
                    )
                )

            except ValueError:
                continue


        elif line.startswith(
            "IO_CHANNEL|"
        ):
            parts = line.split(
                "|",
                9,
            )


            if len(parts) != 10:
                continue


            try:
                channels.append(
                    IoChannel(
                        device_name=parts[1],
                        item_path=parts[2],
                        item_name=parts[3],
                        type_identifier=parts[4],
                        channel_number=int(
                            parts[5]
                        ),
                        io_type=parts[6],
                        channel_type=parts[7],
                        channel_address_bits=int(
                            parts[8]
                        ),
                        channel_width_bits=int(
                            parts[9]
                        ),
                    )
                )

            except ValueError:
                continue


    channels.sort(
        key=lambda item: (
            item.io_type.casefold(),
            item.channel_address_bits,
            item.device_name.casefold(),
            item.item_path.casefold(),
            item.channel_number,
        )
    )

    items.sort(
        key=lambda item: (
            item.device_name.casefold(),
            item.item_path.casefold(),
        )
    )


    return IoInventory(
        project_name=project_name,
        profinet_device_names=profinet_device_names,
        items=items,
        addresses=addresses,
        channels=channels,
    )
