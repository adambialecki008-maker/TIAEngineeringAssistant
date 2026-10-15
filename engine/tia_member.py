from __future__ import annotations

from pydantic import (
    BaseModel,
    Field,
    model_validator,
)
import math
import re

from engine.tia.duration import normalize_duration_literal
from engine.tia.type_registry import type_entry

ARRAY_MIN_BOUND = -32768
ARRAY_MAX_BOUND = 32767


class TiaMember(BaseModel):
    name: str = Field(min_length=1)

    data_type: str = Field(min_length=1)

    comment: str | None = None

    # Optional TIA source attributes. None preserves TIA defaults.
    start_value: str | None = None
    hmi_visible: bool | None = None
    hmi_accessible: bool | None = None
    hmi_writable: bool | None = None
    # Optimized global DB top-level declaration retain override.
    # None means inherit DB-wide legacy setting (or inherited parent).
    retain: bool | None = None

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

        self._validate_initial_value()
        return self

    def _validate_initial_value(self) -> None:
        value = self.start_value
        if value is None or value == "":
            self.start_value = None
            return
        value = value.strip()
        kind = self.data_type.casefold()
        if kind in {"struct", "array"}:
            raise ValueError("Set initial values on scalar members, not on Struct/Array.")
        if kind in {"time", "ltime"}:
            self.start_value = normalize_duration_literal(value, kind)
            return
        if kind == "bool":
            if value.casefold() not in {"true", "false", "0", "1"}:
                raise ValueError("Bool Start value must be TRUE or FALSE.")
        elif kind in {
            "sint", "usint", "int", "uint", "dint", "udint", "lint", "ulint"
        }:
            limits = {
                "sint": (-128, 127), "usint": (0, 255),
                "int": (-32768, 32767), "uint": (0, 65535),
                "dint": (-2147483648, 2147483647),
                "udint": (0, 4294967295),
                "lint": (-9223372036854775808, 9223372036854775807),
                "ulint": (0, 18446744073709551615),
            }
            if not re.fullmatch(r"[+-]?[0-9]+", value):
                raise ValueError("Integer Start value must be a decimal integer.")
            number = int(value)
            low, high = limits[kind]
            if not low <= number <= high:
                raise ValueError(f"{self.data_type} Start value out of range.")
        elif kind in {"real", "lreal"}:
            if not re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", value):
                raise ValueError("Real Start value must be a finite decimal.")
            try:
                number = float(value)
            except (ValueError, OverflowError) as exc:
                raise ValueError("Invalid Real Start value.") from exc
            if not math.isfinite(number):
                raise ValueError("Real Start value must be finite.")
        else:
            raise ValueError(
                f"Start values for {self.data_type} are not yet supported "
                "by the SCL generator."
            )
        self.start_value = value

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
        system_type = type_entry(self.data_type)
        if system_type and not system_type.get("declarable"):
            raise ValueError(
                f"{self.data_type} is a Siemens {system_type['kind'].replace('_', ' ')}. "
                "It is not a verified UDT/global-DB declaration type."
            )
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
