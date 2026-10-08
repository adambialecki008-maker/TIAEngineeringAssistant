from pydantic import BaseModel, Field, model_validator


class UdtField(BaseModel):
    name: str = Field(min_length=1)
    data_type: str = Field(min_length=1)
    comment: str | None = None


class UdtSpecification(BaseModel):
    name: str = Field(min_length=1)
    fields: list[UdtField] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_field_names(self):
        field_names = [field.name.strip().lower() for field in self.fields]

        if len(field_names) != len(set(field_names)):
            raise ValueError("Field names must be unique inside one UDT.")

        return self
