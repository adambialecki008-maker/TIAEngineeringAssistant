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
    retain: bool = False  # Whole-DB RETAIN/NON_RETAIN in SCL source.

    members: list[DataBlockMember] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_member_names(
        self,
    ):
        names = [member.name.strip().lower() for member in self.members]

        if len(names) != len(set(names)):
            raise ValueError("Member names must be unique " "inside one data block.")

        def validate_nested(members):
            for member in members:
                # V21 optimized DB Retain covers a top-level STRUCT/UDT/ARRAY
                # as a whole; applying it to a child would silently be lost.
                for nested in member.struct_members or []:
                    if nested.retain is not None:
                        raise ValueError(
                            "Retain can be changed only on a top-level Static DB "
                            "variable, not inside a Struct.")
                for nested in member.struct_members or []:
                    validate_nested([nested])

        validate_nested(self.members)
        return self
