from fastapi.testclient import TestClient

import engine.tia_openness as tia_openness
from engine.main import app


client = TestClient(app)


def test_tia_processes_are_parsed(
    monkeypatch,
):
    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        lambda *args: [
            "TIA_PROCESS|3544",
            "TIA_PROCESS|5000",
        ],
    )

    response = client.get(
        "/api/v1/tia/processes"
    )

    assert response.status_code == 200

    assert response.json() == [
        {
            "process_id": 3544,
        },
        {
            "process_id": 5000,
        },
    ]


def test_existing_project_plcs_are_parsed(
    monkeypatch,
):
    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        lambda *args: [
            "PROJECT|OpennessTests",
            (
                "PLC|S7-1500 Station_1|PLC_1|"
                "System:Device.S71500|"
                "OrderNumber:6ES7 516-3AP03-0AB0/V4.1"
            ),
        ],
    )

    response = client.get(
        "/api/v1/tia/plcs",
        params={
            "process_id": 3544,
        },
    )

    assert response.status_code == 200

    assert response.json() == [
        {
            "device_name":
                "S7-1500 Station_1",

            "plc_name":
                "PLC_1",

            "device_type_identifier":
                "System:Device.S71500",

            "plc_type_identifier":
                (
                    "OrderNumber:"
                    "6ES7 516-3AP03-0AB0/V4.1"
                ),
        }
    ]


def test_plc_models_are_parsed(
    monkeypatch,
):
    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        lambda *args: [
            (
                "PLC_MODEL|s7-1500|CPU 1511-1 PN|"
                "6ES7 511-1AL03-0AB0|V4.1|"
                "OrderNumber:6ES7 511-1AL03-0AB0/V4.1"
            ),
        ],
    )

    response = client.get(
        "/api/v1/tia/plc-models",
        params={
            "process_id": 3544,
            "family": "S7-1500",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data[0]["name"] == (
        "CPU 1511-1 PN"
    )

    assert data[0]["version"] == (
        "V4.1"
    )


def test_create_plc_response(
    monkeypatch,
):
    calls = []

    def fake_run_adapter(
        *arguments,
    ):
        calls.append(
            arguments
        )

        return [
            (
                "PLC_TYPE|"
                "OrderNumber:"
                "6ES7 511-1AL03-0AB0/V4.1"
            ),
            (
                "PLC_CREATED|"
                "S7-1500 Station_2|PLC_2"
            ),
            "PROJECT_SAVED|OpennessTests",
        ]

    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        fake_run_adapter,
    )

    response = client.post(
        "/api/v1/tia/plcs",
        json={
            "process_id": 3544,
            "selection":
                "6ES7511-1AL03-0AB0",
            "plc_name":
                "PLC_2",
            "device_name":
                "S7-1500 Station_2",
        },
    )

    assert response.status_code == 201

    assert calls == [
        (
            "create-plc",
            "3544",
            "6ES7511-1AL03-0AB0",
            "PLC_2",
            "S7-1500 Station_2",
        )
    ]

    assert response.json() == {
        "status":
            "created",

        "device_name":
            "S7-1500 Station_2",

        "plc_name":
            "PLC_2",

        "type_identifier":
            (
                "OrderNumber:"
                "6ES7 511-1AL03-0AB0/V4.1"
            ),

        "project_saved":
            "OpennessTests",
    }


def test_rename_plc_response(
    monkeypatch,
):
    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        lambda *args: [
            (
                "PLC_RENAMED|"
                "S7-1500 Station_2|PLC_2"
            ),
            "PROJECT_SAVED|OpennessTests",
        ],
    )

    response = client.patch(
        "/api/v1/tia/plcs",
        json={
            "process_id":
                3544,

            "current_device_name":
                "S7-1500 Station_1",

            "current_plc_name":
                "PLC_1",

            "new_device_name":
                "S7-1500 Station_2",

            "new_plc_name":
                "PLC_2",
        },
    )

    assert response.status_code == 200

    assert response.json()["status"] == (
        "renamed"
    )

    assert response.json()["plc_name"] == (
        "PLC_2"
    )


def test_delete_plc_response(
    monkeypatch,
):
    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        lambda *args: [
            (
                "PLC_DELETED|"
                "S7-1500 Station_2|PLC_2"
            ),
            "PROJECT_SAVED|OpennessTests",
        ],
    )

    response = client.request(
        "DELETE",
        "/api/v1/tia/plcs",
        json={
            "process_id":
                3544,

            "device_name":
                "S7-1500 Station_2",

            "plc_name":
                "PLC_2",
        },
    )

    assert response.status_code == 200

    assert response.json()["status"] == (
        "deleted"
    )


def test_io_inventory_is_parsed(
    monkeypatch,
):
    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        lambda *args: [
            "PROJECT|OpennessTests",
            (
                "IO_ADDRESS|ET200SP_1|ET200SP_1/DI_1|DI_1|"
                "OrderNumber:6ES7...|Input|12|2"
            ),
            (
                "IO_CHANNEL|ET200SP_1|ET200SP_1/DI_1|DI_1|"
                "OrderNumber:6ES7...|0|Input|Digital|96|1"
            ),
            (
                "IO_CHANNEL|ET200SP_1|ET200SP_1/DI_1|DI_1|"
                "OrderNumber:6ES7...|1|Input|Digital|97|1"
            ),
        ],
    )

    response = client.get(
        "/api/v1/tia/io",
        params={
            "process_id": 3544,
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["project_name"] == (
        "OpennessTests"
    )

    assert len(data["addresses"]) == 1
    assert len(data["channels"]) == 2

    assert data["channels"][0] == {
        "device_name": "ET200SP_1",
        "item_path": "ET200SP_1/DI_1",
        "item_name": "DI_1",
        "type_identifier": (
            "OrderNumber:6ES7..."
        ),
        "channel_number": 0,
        "io_type": "Input",
        "channel_type": "Digital",
        "channel_address_bits": 96,
        "channel_width_bits": 1,
    }


def test_create_plc_tags_writes_adapter_file(
    monkeypatch,
):
    calls = []

    def fake_run_adapter(
        *arguments,
    ):
        calls.append(
            arguments[:5]
        )

        tag_file = arguments[5]

        with open(
            tag_file,
            "r",
            encoding="utf-8",
        ) as handle:
            assert handle.read() == (
                "M01_RunFb\tBool\t%I12.0\n"
                "M02_RunFb\tBool\t%I12.1\n"
            )

        return [
            "TAG_CREATED|M01_RunFb|Bool|%I12.0",
            "TAG_CREATED|M02_RunFb|Bool|%I12.1",
            "TAG_TABLE|TIAEngineeringAssistant",
            "PROJECT_SAVED|OpennessTests",
        ]

    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        fake_run_adapter,
    )

    response = client.post(
        "/api/v1/tia/plc-tags",
        json={
            "process_id": 3544,
            "device_name": (
                "S7-1500 Station_1"
            ),
            "plc_name": "PLC_1",
            "tag_table_name": (
                "TIAEngineeringAssistant"
            ),
            "tags": [
                {
                    "name": "M01_RunFb",
                    "data_type": "Bool",
                    "logical_address": "%I12.0",
                },
                {
                    "name": "M02_RunFb",
                    "data_type": "Bool",
                    "logical_address": "%I12.1",
                },
            ],
        },
    )

    assert response.status_code == 201

    assert calls == [
        (
            "create-tags",
            "3544",
            "S7-1500 Station_1",
            "PLC_1",
            "TIAEngineeringAssistant",
        )
    ]

    assert response.json() == {
        "status": "created",
        "tag_table_name": (
            "TIAEngineeringAssistant"
        ),
        "created_count": 2,
        "project_saved": (
            "OpennessTests"
        ),
    }
