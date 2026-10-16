from typing import Literal

from pydantic import BaseModel, Field, model_validator


class InstanceDbSpecification(BaseModel):
    name: str = Field(min_length=1)
    function_block: str = Field(min_length=1)
    number: int | None = Field(default=None, ge=1)


class InstanceDbSnapshot(BaseModel):
    """Read-only inventory entry for an existing TIA Instance DB.

    The current Openness inventory identifies `InstanceDB` but does not expose
    its owning FB reliably. The relation therefore stays explicitly
    unverified until a future, evidenced adapter export can supply it.
    """

    name: str = Field(min_length=1)
    number: int | None = Field(default=None, ge=0)
    group_path: str = ""
    block_kind: str = "InstanceDB"
    is_consistent: bool = False
    source_mode: Literal["tia_read_only"] = "tia_read_only"
    function_block: str | None = None
    # Present only if returned by Siemens Openness; never inferred locally.
    instance_of_type: str | None = None
    instance_of_number: int | None = Field(default=None, ge=0)
    relationship_status: Literal["unverified", "reported_by_openness"] = "unverified"

    @model_validator(mode="after")
    def validate_instance_kind(self):
        if self.block_kind.casefold() != "instancedb":
            raise ValueError("Instance DB snapshots require block_kind InstanceDB.")
        if self.relationship_status == "reported_by_openness":
            if not self.function_block or self.instance_of_type != "FB" or self.instance_of_number is None:
                raise ValueError("Instance DB owner needs direct FB name/type/number from Openness.")
        elif self.function_block is not None or self.instance_of_type is not None or self.instance_of_number is not None:
            raise ValueError("Unverified Instance DB cannot claim an owner.")
        return self


def instance_db_preview(instance: InstanceDbSpecification, function_block) -> dict:
    """Offline-only structural preview. FB remains the sole declaration owner."""
    if function_block.name.casefold() != instance.function_block.casefold():
        raise ValueError("Instance DB references a different Function Block.")
    return {"name": instance.name, "function_block": function_block.name,
            "sections": [{"name": "Static", "members": [member.model_dump()
                for member in function_block.static.members]}],
            "tia_compilation_verified": False}
