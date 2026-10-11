from fastapi.testclient import TestClient
from openpyxl import Workbook

import engine.tia_openness as tia_openness
from engine.main import app
from engine.tia.hmi_translation import (
    _project_text_columns,
    _reference_matches_hmi,
)


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


def test_tia_project_context_is_parsed(
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
            "PROJECT|LargeMachineProject",
            (
                "PLC|Station_1|PLC_1|"
                "System:Device.S71500|"
                "OrderNumber:6ES7..."
            ),
            (
                "PLC_METRICS|Station_1|PLC_1|Online|"
                "420|83|12|976"
            ),
            (
                "PLC_RESOURCE|Station_1|PLC_1|Used|"
                "9964947|390157|174144|"
            ),
            (
                "PLC_RESOURCE|Station_1|PLC_1|DB|"
                "1631719|0|174144|"
            ),
            (
                "PLC_RESOURCE_ATTR|Station_1|PLC_1|"
                "DeviceItem|CodeWorkMemory|768000"
            ),
            (
                "HMI|Panel_1|HMI_1|"
                "System:Device.HMI|"
                "OrderNumber:6AV2...|"
                "Siemens.Engineering.Hmi.HmiTarget|"
                "HMI_1"
            ),
        ]

    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        fake_run_adapter,
    )

    response = client.get(
        "/api/v1/tia/project-context",
        params={
            "process_id": 3544,
        },
    )

    assert response.status_code == 200

    assert calls == [
        (
            "list-project-plcs",
            "3544",
        )
    ]

    assert response.json() == {
        "project_name":
            "LargeMachineProject",

        "plcs": [
            {
                "device_name":
                    "Station_1",

                "plc_name":
                    "PLC_1",

                "device_type_identifier":
                    "System:Device.S71500",

                "plc_type_identifier":
                    "OrderNumber:6ES7...",

                "online_state":
                    "Online",

                "block_count":
                    420,

                "data_block_count":
                    83,

                "udt_count":
                    12,

                "tag_count":
                    976,

                "resource_rows": [
                    {
                        "object_type":
                            "Used",

                        "load_memory_bytes":
                            9964947,

                        "code_work_memory_bytes":
                            390157,

                        "data_work_memory_bytes":
                            174144,

                        "retain_memory_bytes":
                            None,
                    },
                    {
                        "object_type":
                            "DB",

                        "load_memory_bytes":
                            1631719,

                        "code_work_memory_bytes":
                            0,

                        "data_work_memory_bytes":
                            174144,

                        "retain_memory_bytes":
                            None,
                    },
                ],


                "resource_attributes": [
                    {
                        "source":
                            "DeviceItem",

                        "name":
                            "CodeWorkMemory",

                        "value":
                            "768000",
                    },
                ],
            },
        ],

        "hmis": [
            {
                "device_name":
                    "Panel_1",

                "hmi_name":
                    "HMI_1",

                "device_type_identifier":
                    "System:Device.HMI",

                "hmi_type_identifier":
                    "OrderNumber:6AV2...",

                "software_type":
                    "Siemens.Engineering.Hmi.HmiTarget",

                "software_name":
                    "HMI_1",
            },
        ],
    }


def test_tia_project_info_is_parsed(
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
            "PROJECT|LargeMachineProject",
            (
                "PLC|Station_1|PLC_1|"
                "System:Device.S71500|"
                "OrderNumber:6ES7..."
            ),
        ]

    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        fake_run_adapter,
    )

    response = client.get(
        "/api/v1/tia/project-info",
        params={
            "process_id": 3544,
        },
    )

    assert response.status_code == 200

    assert calls == [
        (
            "list-project-plcs",
            "3544",
        )
    ]

    assert response.json() == {
        "project_name":
            "LargeMachineProject",
    }


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

            "online_state":
                "Unavailable",

            "block_count":
                0,

            "data_block_count":
                0,

            "udt_count":
                0,

            "tag_count":
                0,

            "resource_rows":
                [],


            "resource_attributes":
                [],
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


def test_plc_program_blocks_are_parsed(
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
                "PLC_PROGRAM_BLOCK|Process|"
                "FB_Motor|FB|120|SCL|True|2048|512"
            ),
            (
                "PLC_PROGRAM_BLOCK||"
                "Main|OB|1|LAD|True|1024|256"
            ),
            (
                "PLC_PROGRAM_BLOCK|Data|"
                "MotorDb|DB|20||False|4096|1024"
            ),
        ]


    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        fake_run_adapter,
    )


    response = client.get(
        "/api/v1/tia/plc-program-blocks",
        params={
            "process_id": 3544,
            "device_name": "S7-1500 Station_1",
            "plc_name": "PLC_1",
        },
    )


    assert response.status_code == 200

    assert calls == [
        (
            "list-program-blocks",
            "3544",
            "S7-1500 Station_1",
            "PLC_1",
        )
    ]

    assert response.json() == [
        {
            "group_path": "Data",
            "name": "MotorDb",
            "kind": "DB",
            "number": 20,
            "programming_language": "",
            "is_consistent": False,
            "load_memory_bytes": 4096,
            "work_memory_bytes": 1024,
        },
        {
            "group_path": "Process",
            "name": "FB_Motor",
            "kind": "FB",
            "number": 120,
            "programming_language": "SCL",
            "is_consistent": True,
            "load_memory_bytes": 2048,
            "work_memory_bytes": 512,
        },
        {
            "group_path": "",
            "name": "Main",
            "kind": "OB",
            "number": 1,
            "programming_language": "LAD",
            "is_consistent": True,
            "load_memory_bytes": 1024,
            "work_memory_bytes": 256,
        },
    ]


def test_plc_program_block_detail_is_parsed(
    monkeypatch,
):
    calls = []


    def fake_run_adapter(
        *arguments,
    ):
        calls.append(
            arguments[:-1]
        )

        xml_file =
            arguments[-1]

        with open(
            xml_file,
            "w",
            encoding="utf-8",
        ) as handle:
            handle.write(
                """
<Document>
  <SW.Blocks.FB>
    <AttributeList>
      <Interface>
        <Sections>
          <Section Name="Input">
            <Member Name="Start" Datatype="Bool" />
          </Section>
          <Section Name="Output">
            <Member Name="Running" Datatype="Bool" />
          </Section>
        </Sections>
      </Interface>
    </AttributeList>
  </SW.Blocks.FB>
</Document>
""".strip()
            )

        return [
            (
                "PROGRAM_BLOCK_EXPORTED|Process|"
                "FB_Motor|FB|120|SCL|True|2048|512"
            ),
        ]


    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        fake_run_adapter,
    )


    response = client.get(
        "/api/v1/tia/plc-program-block",
        params={
            "process_id": 3544,
            "device_name": "S7-1500 Station_1",
            "plc_name": "PLC_1",
            "group_path": "Process",
            "name": "FB_Motor",
        },
    )


    assert response.status_code == 200

    assert calls == [
        (
            "export-program-block",
            "3544",
            "S7-1500 Station_1",
            "PLC_1",
            "Process",
            "FB_Motor",
        )
    ]

    data = response.json()

    assert data["name"] == "FB_Motor"
    assert data["kind"] == "FB"
    assert data["number"] == 120
    assert data["programming_language"] == "SCL"
    assert data["load_memory_bytes"] == 2048
    assert data["work_memory_bytes"] == 512

    assert data["members"] == [
        {
            "section": "Input",
            "path": "Start",
            "name": "Start",
            "data_type": "Bool",
            "level": 0,
            "offset": "",
            "comment": "",
        },
        {
            "section": "Output",
            "path": "Running",
            "name": "Running",
            "data_type": "Bool",
            "level": 0,
            "offset": "",
            "comment": "",
        },
    ]


def test_plc_structures_are_parsed(
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
                "PLC_DB||GlobalData|12|GlobalDB|True"
            ),
            (
                "PLC_DB|Process|MotorDb|20|InstanceDB|False"
            ),
            (
                "PLC_UDT||MotorType|PlcStruct|True"
            ),
            (
                "PLC_UDT|Common|AlarmType|PlcStruct|True"
            ),
        ]

    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        fake_run_adapter,
    )

    response = client.get(
        "/api/v1/tia/plc-structures",
        params={
            "process_id": 3544,
            "device_name": "S7-1500 Station_1",
            "plc_name": "PLC_1",
        },
    )

    assert response.status_code == 200

    assert calls == [
        (
            "list-structures",
            "3544",
            "S7-1500 Station_1",
            "PLC_1",
        )
    ]

    assert response.json() == {
        "data_blocks": [
            {
                "group_path": "",
                "name": "GlobalData",
                "number": 12,
                "block_kind": "GlobalDB",
                "is_consistent": True,
            },
            {
                "group_path": "Process",
                "name": "MotorDb",
                "number": 20,
                "block_kind": "InstanceDB",
                "is_consistent": False,
            },
        ],
        "udts": [
            {
                "group_path": "",
                "name": "MotorType",
                "type_kind": "PlcStruct",
                "is_consistent": True,
            },
            {
                "group_path": "Common",
                "name": "AlarmType",
                "type_kind": "PlcStruct",
                "is_consistent": True,
            },
        ],
    }


def test_plc_structure_detail_is_parsed(
    monkeypatch,
):
    calls = []

    def fake_run_adapter(
        *arguments,
    ):
        calls.append(
            arguments[:-1]
        )

        xml_file =
            arguments[-1]

        with open(
            xml_file,
            "w",
            encoding="utf-8",
        ) as handle:
            handle.write(
                """
<Document>
  <SW.Blocks.GlobalDB>
    <AttributeList>
      <Interface>
        <Sections>
          <Section Name="Static">
            <Member Name="Enabled" Datatype="Bool" />
            <Member Name="Settings" Datatype="Struct">
              <Sections>
                <Section Name="None">
                  <Member Name="Timeout" Datatype="Time" />
                </Section>
              </Sections>
            </Member>
          </Section>
        </Sections>
      </Interface>
    </AttributeList>
  </SW.Blocks.GlobalDB>
</Document>
""".strip()
            )

        return [
            "STRUCTURE_EXPORTED|db||GlobalData"
        ]

    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        fake_run_adapter,
    )

    response = client.get(
        "/api/v1/tia/plc-structure",
        params={
            "process_id": 3544,
            "device_name": "S7-1500 Station_1",
            "plc_name": "PLC_1",
            "kind": "db",
            "group_path": "",
            "name": "GlobalData",
        },
    )

    assert response.status_code == 200

    assert calls == [
        (
            "export-structure",
            "3544",
            "S7-1500 Station_1",
            "PLC_1",
            "db",
            "",
            "GlobalData",
        )
    ]

    assert response.json() == {
        "kind": "db",
        "group_path": "",
        "name": "GlobalData",
        "members": [
            {
                "section": "Static",
                "path": "Enabled",
                "name": "Enabled",
                "data_type": "Bool",
                "level": 0,
                "offset": "",
                "comment": "",
            },
            {
                "section": "Static",
                "path": "Settings",
                "name": "Settings",
                "data_type": "Struct",
                "level": 0,
                "offset": "",
                "comment": "",
            },
            {
                "section": "Static",
                "path": "Settings.Timeout",
                "name": "Timeout",
                "data_type": "Time",
                "level": 1,
                "offset": "",
                "comment": "",
            },
        ],
    }


def test_existing_plc_tags_are_parsed(
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
                "PLC_TAG|TIAEngineeringAssistant|"
                "M01_Run|Bool|%I0.0"
            ),
            (
                "PLC_TAG|Process/Inputs|"
                "StartButton|Bool|%I1.0"
            ),
        ]

    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        fake_run_adapter,
    )

    response = client.get(
        "/api/v1/tia/plc-tags",
        params={
            "process_id": 3544,
            "device_name": "S7-1500 Station_1",
            "plc_name": "PLC_1",
        },
    )

    assert response.status_code == 200

    assert calls == [
        (
            "list-tags",
            "3544",
            "S7-1500 Station_1",
            "PLC_1",
        )
    ]

    assert response.json() == [
        {
            "table_path":
                "Process/Inputs",

            "name":
                "StartButton",

            "data_type":
                "Bool",

            "logical_address":
                "%I1.0",
        },
        {
            "table_path":
                "TIAEngineeringAssistant",

            "name":
                "M01_Run",

            "data_type":
                "Bool",

            "logical_address":
                "%I0.0",
        },
    ]


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



def test_project_languages_are_parsed(
    monkeypatch,
):
    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        lambda *args: [
            (
                "PROJECT_LANGUAGE|en-US|English (United States)|"
                "English (United States)|True|True|True"
            ),
            (
                "PROJECT_LANGUAGE|de-DE|German (Germany)|"
                "Deutsch (Deutschland)|False|False|False"
            ),
        ],
    )


    response = client.get(
        "/api/v1/tia/languages",
        params={
            "process_id": 3544,
        },
    )


    assert response.status_code == 200

    assert response.json()[0]["culture"] == "en-US"
    assert response.json()[0]["is_active"] is True
    assert response.json()[0]["is_reference"] is True

    assert response.json()[1]["culture"] == "de-DE"
    assert response.json()[1]["is_active"] is False


def test_add_project_language_response(
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
            "LANGUAGE_ADDED|de-DE",
            "PROJECT_SAVED|OpennessTests",
        ]


    monkeypatch.setattr(
        tia_openness,
        "_run_adapter",
        fake_run_adapter,
    )


    response = client.post(
        "/api/v1/tia/languages",
        json={
            "process_id": 3544,
            "culture": "de-DE",
        },
    )


    assert response.status_code == 200

    assert calls == [
        (
            "add-project-language",
            "3544",
            "de-DE",
        )
    ]

    assert response.json() == {
        "status": "added",
        "culture": "de-DE",
        "project_saved": "OpennessTests",
    }



def test_hmi_project_text_reference_filter():
    assert _reference_matches_hmi(
        (
            "OpennnesTest_Torowisko\\"
            "HM_Conveyors [KTP...]\\"
            "Screen_1"
        ),
        "HM_Conveyors",
        "HM_Conveyors",
    )

    assert not _reference_matches_hmi(
        (
            "OpennnesTest_Torowisko\\"
            "HM_Bridge [KTP...]\\"
            "Screen_1"
        ),
        "HM_Conveyors",
        "HM_Conveyors",
    )


def test_project_text_columns_are_detected():
    workbook = Workbook()
    worksheet = workbook.active

    worksheet.append(
        [
            "English (United States)",
            "Polish (Poland)",
            "Category",
            "Reference",
        ]
    )

    worksheet.append(
        [
            "Zmiana",
            "",
            "HM screen",
            (
                "OpennnesTest_Torowisko\\"
                "HM_Conveyors [KTP...]"
            ),
        ]
    )

    assert _project_text_columns(
        worksheet
    ) == (
        1,
        1,
        2,
        3,
        4,
    )
