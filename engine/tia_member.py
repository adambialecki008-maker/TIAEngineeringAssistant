from __future__ import annotations

from pydantic import (
    BaseModel,
    Field,
    model_validator,
)

ARRAY_MIN_BOUND = -32768
ARRAY_MAX_BOUND = 32767


class TiaMember(BaseModel):
    name: str = Field(min_length=1)

    data_type: str = Field(min_length=1)

    comment: str | None = None

    # ARRAY
    array_element_type: str | None = None
    array_lower_bound: int | None = None
    array_upper_bound: int | None = None

    # STRUCT
    struct_members: list["TiaMember"] | None = None

    @model_validator(mode="after")
    def validate_complex_type(
        self,
    ):
        data_type = self.data_type.strip().lower()

        if data_type == "array":
            self._validate_array()

        elif data_type == "struct":
            self._validate_struct()

        else:
            self._validate_simple_type()

        return self

    def _validate_array(
        self,
    ) -> None:
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

        if self.struct_members is not None:
            raise ValueError("Struct configuration is not allowed " "for Array.")

    def _validate_struct(
        self,
    ) -> None:
        if not self.struct_members:
            raise ValueError("Struct must contain at least one member.")

        names = [member.name.strip().lower() for member in self.struct_members]

        if len(names) != len(set(names)):
            raise ValueError("Struct member names must be unique.")

        if (
            self.array_element_type is not None
            or self.array_lower_bound is not None
            or self.array_upper_bound is not None
        ):
            raise ValueError("Array configuration is not allowed " "for Struct.")

    def _validate_simple_type(
        self,
    ) -> None:
        if (
            self.array_element_type is not None
            or self.array_lower_bound is not None
            or self.array_upper_bound is not None
        ):
            raise ValueError(
                "Array configuration is only allowed " "when data_type is Array."
            )

        if self.struct_members is not None:
            raise ValueError(
                "Struct configuration is only allowed " "when data_type is Struct."
            )


TiaMember.model_rebuild()
