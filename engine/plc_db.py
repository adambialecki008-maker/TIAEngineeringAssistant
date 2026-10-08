from pydantic import (
    BaseModel,
    Field,
    model_validator,
)

ARRAY_MIN_BOUND = -32768
ARRAY_MAX_BOUND = 32767


class DataBlockMember(BaseModel):
    name: str = Field(min_length=1)

    data_type: str = Field(min_length=1)

    comment: str | None = None

    array_element_type: str | None = None

    array_lower_bound: int | None = None

    array_upper_bound: int | None = None

    @model_validator(mode="after")
    def validate_array_configuration(
        self,
    ):
        if self.data_type == "Array":

            if not self.array_element_type:
                raise ValueError("Array element type is required.")

            if self.array_lower_bound is None:
                raise ValueError("Array lower bound is required.")

            if self.array_upper_bound is None:
                raise ValueError("Array upper bound is required.")

            if not (ARRAY_MIN_BOUND <= self.array_lower_bound <= ARRAY_MAX_BOUND):
                raise ValueError(
                    "Array lower bound must be between "
                    f"{ARRAY_MIN_BOUND} and "
                    f"{ARRAY_MAX_BOUND}."
                )

            if not (ARRAY_MIN_BOUND <= self.array_upper_bound <= ARRAY_MAX_BOUND):
                raise ValueError(
                    "Array upper bound must be between "
                    f"{ARRAY_MIN_BOUND} and "
                    f"{ARRAY_MAX_BOUND}."
                )

            if self.array_upper_bound < self.array_lower_bound:
                raise ValueError(
                    "Array upper bound must be greater " "than or equal to lower bound."
                )

        else:
            if (
                self.array_element_type is not None
                or self.array_lower_bound is not None
                or self.array_upper_bound is not None
            ):
                raise ValueError(
                    "Array configuration is only allowed " "when data_type is Array."
                )

        return self


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
