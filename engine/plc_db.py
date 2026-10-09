from pydantic import (
    BaseModel,
    Field,
    model_validator,
)

from engine.tia_member import (
    TiaMember,
)


class DataBlockMember(TiaMember):
    pass


class DataBlockSpecification(BaseModel):
    name: str = Field(min_length=1)

    members: list[DataBlockMember] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_member_names(
        self,
    ):
        names = [member.name.strip().lower() for member in self.members]

        if len(names) != len(set(names)):
            raise ValueError("Member names must be unique " "inside one data block.")

        return self
