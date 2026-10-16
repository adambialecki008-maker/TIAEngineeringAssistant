from pydantic import BaseModel, Field


class InstanceDbSpecification(BaseModel):
    name: str = Field(min_length=1)
    function_block: str = Field(min_length=1)
    number: int | None = Field(default=None, ge=1)


def instance_db_preview(instance: InstanceDbSpecification, function_block) -> dict:
    """Offline-only structural preview. FB remains the sole declaration owner."""
    if function_block.name.casefold() != instance.function_block.casefold():
        raise ValueError("Instance DB references a different Function Block.")
    return {"name": instance.name, "function_block": function_block.name,
            "sections": [{"name": "Static", "members": [member.model_dump()
                for member in function_block.static.members]}],
            "tia_compilation_verified": False}
