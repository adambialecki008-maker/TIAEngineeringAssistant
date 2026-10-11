from pydantic import BaseModel, Field


class TiaProcess(BaseModel):
    process_id: int


class PlcResourceRow(BaseModel):
    object_type: str
    load_memory_bytes: int = 0
    code_work_memory_bytes: int = 0
    data_work_memory_bytes: int = 0
    retain_memory_bytes: int | None = None


class PlcResourceAttribute(BaseModel):
    source: str
    name: str
    value: str


class ProjectPlc(BaseModel):
    device_name: str
    plc_name: str
    device_type_identifier: str = ""
    plc_type_identifier: str = ""
    online_state: str = "Unavailable"
    block_count: int = 0
    data_block_count: int = 0
    udt_count: int = 0
    tag_count: int = 0
    resource_rows: list[PlcResourceRow] = Field(
        default_factory=list
    )


    resource_attributes: list[PlcResourceAttribute] = Field(
        default_factory=list
    )


class ProjectHmi(BaseModel):
    device_name: str
    hmi_name: str
    device_type_identifier: str = ""
    hmi_type_identifier: str = ""
    software_type: str = ""
    software_name: str = ""


class TiaProjectInfo(BaseModel):
    project_name: str


class TiaProjectContext(BaseModel):
    project_name: str
    plcs: list[ProjectPlc]
    hmis: list[ProjectHmi]


class HardwareItem(BaseModel):
    device_name: str
    item_path: str
    item_name: str
    type_identifier: str
    is_plugged: bool
    address_count: int
    channel_count: int


class IoAddress(BaseModel):
    device_name: str
    item_path: str
    item_name: str
    type_identifier: str
    io_type: str
    start_address: int
    length: int


class IoChannel(BaseModel):
    device_name: str
    item_path: str
    item_name: str
    type_identifier: str
    channel_number: int
    io_type: str
    channel_type: str
    channel_address_bits: int
    channel_width_bits: int


class IoInventory(BaseModel):
    project_name: str | None = None
    items: list[HardwareItem]
    addresses: list[IoAddress]
    channels: list[IoChannel]


class PlcTagInfo(BaseModel):
    table_path: str
    name: str
    data_type: str
    logical_address: str


class PlcProgramBlockInfo(BaseModel):
    group_path: str
    name: str
    kind: str
    number: int | None = None
    programming_language: str = ""
    is_consistent: bool | None = None
    load_memory_bytes: int = 0
    work_memory_bytes: int = 0



class PlcDataBlockInfo(BaseModel):
    group_path: str
    name: str
    number: int
    block_kind: str
    is_consistent: bool


class PlcUdtInfo(BaseModel):
    group_path: str
    name: str
    type_kind: str
    is_consistent: bool


class PlcStructuresInfo(BaseModel):
    data_blocks: list[PlcDataBlockInfo]
    udts: list[PlcUdtInfo]


class PlcStructureMemberInfo(BaseModel):
    section: str = ""
    path: str
    name: str
    data_type: str = ""
    level: int = 0
    offset: str = ""
    comment: str = ""


class PlcProgramBlockDetail(PlcProgramBlockInfo):
    members: list[PlcStructureMemberInfo] = Field(
        default_factory=list
    )


class PlcStructureDetail(BaseModel):
    kind: str
    group_path: str
    name: str
    members: list[PlcStructureMemberInfo]


class PlcTagSpec(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    data_type: str = Field(min_length=1, max_length=64)
    logical_address: str = Field(min_length=1, max_length=64)


class CreatePlcTagsRequest(BaseModel):
    process_id: int = Field(ge=1)
    device_name: str = Field(min_length=1, max_length=128)
    plc_name: str = Field(min_length=1, max_length=128)
    tag_table_name: str = Field(
        default="TIAEngineeringAssistant",
        min_length=1,
        max_length=128,
    )
    tags: list[PlcTagSpec] = Field(min_length=1)


class CreatePlcTagsResponse(BaseModel):
    status: str
    tag_table_name: str
    created_count: int
    project_saved: str | None = None


class PlcModel(BaseModel):
    family: str
    name: str
    article_number: str
    version: str
    type_identifier: str


class CreatePlcRequest(BaseModel):
    process_id: int = Field(ge=1)
    selection: str = Field(min_length=1, max_length=256)
    plc_name: str = Field(min_length=1, max_length=128)
    device_name: str = Field(min_length=1, max_length=128)


class RenamePlcRequest(BaseModel):
    process_id: int = Field(ge=1)
    current_device_name: str = Field(min_length=1, max_length=128)
    current_plc_name: str = Field(min_length=1, max_length=128)
    new_device_name: str = Field(min_length=1, max_length=128)
    new_plc_name: str = Field(min_length=1, max_length=128)


class DeletePlcRequest(BaseModel):
    process_id: int = Field(ge=1)
    device_name: str = Field(min_length=1, max_length=128)
    plc_name: str = Field(min_length=1, max_length=128)


class PlcMutationResponse(BaseModel):
    status: str
    device_name: str
    plc_name: str
    type_identifier: str | None = None
    project_saved: str | None = None



class ProjectLanguageInfo(BaseModel):
    culture: str
    english_name: str
    native_name: str
    is_active: bool
    is_editing: bool
    is_reference: bool


class AddProjectLanguageRequest(BaseModel):
    process_id: int = Field(
        ge=1
    )
    culture: str = Field(
        min_length=2,
        max_length=32,
    )


class AddProjectLanguageResponse(BaseModel):
    status: str
    culture: str
    project_saved: str | None = None



class TranslateHmiTextsRequest(BaseModel):
    process_id: int = Field(
        ge=1
    )
    device_name: str = Field(
        min_length=1,
        max_length=128,
    )
    hmi_name: str = Field(
        min_length=1,
        max_length=128,
    )
    source_culture: str = Field(
        min_length=2,
        max_length=32,
    )
    target_culture: str = Field(
        min_length=2,
        max_length=32,
    )


class TranslateHmiTextsResponse(BaseModel):
    status: str
    hmi_name: str
    source_culture: str
    target_culture: str
    translated_rows: int
    unique_texts: int
    import_state: str = ""
    import_log: str = ""
    project_saved: str | None = None
