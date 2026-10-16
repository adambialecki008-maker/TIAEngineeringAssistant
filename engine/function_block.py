"""Read-only Function Block interface snapshots imported from TIA Portal."""
from typing import Literal
from pydantic import BaseModel, Field, model_validator

from engine.tia_member import TiaMember
from engine.tia.type_registry import type_entry


class FunctionBlockSection(BaseModel):
    name: str
    members: list[TiaMember] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_names(self):
        names = [member.name.strip().casefold() for member in self.members]
        if len(names) != len(set(names)):
            raise ValueError(f"Member names must be unique in {self.name}.")
        return self


class FunctionBlockSpecification(BaseModel):
    name: str = Field(min_length=1)
    number: int | None = Field(default=None, ge=0)
    language: str = "SCL"
    # A TIA source snapshot is opaque: its program is never translated,
    # edited, regenerated, or written by this application.
    source_mode: Literal["local", "tia_read_only"] = "local"
    source_xml: str | None = None
    interface_verified: bool = True
    unverified_reasons: list[str] = Field(default_factory=list)
    input: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Input"))
    output: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Output"))
    inout: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="InOut"))
    static: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Static"))
    temp: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Temp"))
    constant: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Constant"))

    @model_validator(mode="after")
    def validate_sections(self):
        language = self.language.strip().upper()
        if language == "KOP":  # localized TIA ladder metadata; expose LAD consistently
            language = "LAD"
        if language not in {"SCL", "LAD", "FBD"}:
            raise ValueError("Only SCL, LAD and FBD Function Blocks are supported.")
        self.language = language
        if self.source_mode == "tia_read_only":
            if not self.source_xml:
                raise ValueError("TIA FB import requires original source XML to preserve its logic.")
        if self.interface_verified and self.unverified_reasons:
            raise ValueError("Verified FB interfaces cannot contain unverified reasons.")
        for section in (self.input, self.output, self.inout, self.temp, self.constant):
            for member in section.members:
                if member.system_instance:
                    raise ValueError(f"System instances are allowed only for Static FB members, not {section.name}.")
                if member.retain is not None:
                    raise ValueError(f"Retain is allowed only for Static FB members, not {section.name}.")
        for member in self.static.members:
            if not member.system_instance:
                continue
            entry = type_entry(member.data_type)
            if not entry or not str(entry.get("kind", "")).endswith("_instance"):
                raise ValueError("Only registered Siemens system-instance types may use system_instance.")
            if member.struct_members is not None or member.array_element_type is not None:
                raise ValueError("System instances cannot expose editable nested declarations.")
        declared = {}
        for section in (self.input, self.output, self.inout, self.static, self.temp, self.constant):
            for member in section.members:
                key = member.name.strip().casefold()
                if key in declared:
                    raise ValueError(f"FB member name {member.name} is declared in both {declared[key]} and {section.name}.")
                declared[key] = section.name
        return self
