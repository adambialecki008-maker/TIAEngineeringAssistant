"""Local Function Block declaration model; no TIA write operations."""
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
    # A source snapshot is opaque: it preserves an imported LAD/KOP network
    # without presenting it as editable SCL declarations.
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
        if language not in {"SCL", "LAD", "KOP"}:
            raise ValueError("Only SCL, LAD and KOP Function Blocks are supported.")
        self.language = language
        if language == "SCL" and self.source_mode != "local":
            raise ValueError("SCL Function Blocks use local declarations, not an opaque TIA source snapshot.")
        if language in {"LAD", "KOP"}:
            if self.source_mode != "tia_read_only":
                raise ValueError("LAD/KOP Function Blocks must remain a read-only TIA source snapshot.")
            if not self.source_xml:
                raise ValueError("LAD/KOP import requires the original TIA XML source to preserve its logic.")
        if self.interface_verified and self.unverified_reasons:
            raise ValueError("Verified FB interfaces cannot contain unverified reasons.")
        for section in (self.input, self.output, self.inout, self.temp, self.constant):
            for member in section.members:
                if member.system_instance:
                    raise ValueError(
                        f"System instances are allowed only for Static FB members, not {section.name}."
                    )
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
