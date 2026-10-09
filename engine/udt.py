from pydantic import (
    BaseModel,
    Field,
    model_validator,
)

from engine.tia_member import (
    TiaMember,
)


class UdtField(TiaMember):
    pass


class UdtSpecification(BaseModel):
    name: str = Field(min_length=1)

    fields: list[UdtField] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_field_names(
        self,
    ):
        names = [field.name.strip().lower() for field in self.fields]

        if len(names) != len(set(names)):
            raise ValueError("Field names must be unique " "inside one UDT.")

        return self
