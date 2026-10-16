"""Local Function Block declaration model; no TIA write operations."""
from pydantic import BaseModel, Field, model_validator

from engine.tia_member import TiaMember


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
    input: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Input"))
    output: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Output"))
    inout: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="InOut"))
    static: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Static"))
    temp: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Temp"))
    constant: FunctionBlockSection = Field(default_factory=lambda: FunctionBlockSection(name="Constant"))

    @model_validator(mode="after")
    def validate_sections(self):
        if self.language != "SCL":
            raise ValueError("Only SCL Function Blocks are currently supported.")
        for section in (self.input, self.output, self.inout, self.temp, self.constant):
            for member in section.members:
                if member.retain is not None:
                    raise ValueError(f"Retain is allowed only for Static FB members, not {section.name}.")
        declared = {}
        for section in (self.input, self.output, self.inout, self.static, self.temp, self.constant):
            for member in section.members:
                key = member.name.strip().casefold()
                if key in declared:
                    raise ValueError(f"FB member name {member.name} is declared in both {declared[key]} and {section.name}.")
                declared[key] = section.name
        return self
