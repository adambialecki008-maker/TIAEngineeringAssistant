"""Function interfaces: read-only TIA snapshots or local declaration-only drafts."""
import re
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from engine.function_block import FunctionBlockSection, walk_function_block_members


class FunctionSpecification(BaseModel):
    """An FC interface snapshot; program networks stay opaque TIA XML."""

    name: str = Field(min_length=1)
    number: int | None = Field(default=None, ge=0)
    language: str = "SCL"
    source_mode: Literal["local", "tia_read_only"] = "local"
    created_locally: bool = False
    source_xml: str | None = None
    interface_verified: bool = True
    unverified_reasons: list[str] = Field(default_factory=list)
    input: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Input"))
    output: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Output"))
    inout: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="InOut"))
    temp: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Temp"))
    constant: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Constant"))

    @model_validator(mode="after")
    def validate_sections(self):
        language = self.language.strip().upper()
        if language == "KOP":  # localized TIA ladder metadata; expose LAD consistently
            language = "LAD"
        if language not in {"SCL", "LAD", "FBD"}:
            raise ValueError("Only SCL, LAD and FBD Functions are supported.")
        self.language = language
        if self.source_mode == "tia_read_only":
            if not self.source_xml:
                raise ValueError("TIA FC import requires original source XML to preserve its logic.")
            if self.created_locally:
                raise ValueError("TIA snapshots cannot be marked as locally created.")
        if self.created_locally:
            if self.source_mode != "local" or self.source_xml is not None or self.interface_verified:
                raise ValueError("Local FC declaration drafts must have no program source and cannot be TIA-verified.")
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", self.name):
                raise ValueError("Local FC name must be a valid PLC identifier.")
        if self.interface_verified and self.unverified_reasons:
            raise ValueError("Verified FC interfaces cannot contain unverified reasons.")
        declared = {}
        for section in (self.input, self.output, self.inout, self.temp, self.constant):
            for member in walk_function_block_members(section.members):
                if member.system_instance:
                    raise ValueError("System instances are not allowed in Function declarations.")
                if member.retain is not None:
                    raise ValueError("Retain is not allowed in Function declarations.")
                key = member.name.strip().casefold()
                if key in declared:
                    raise ValueError(f"FC member name {member.name} is declared in both {declared[key]} and {section.name}.")
                declared[key] = section.name
        return self
