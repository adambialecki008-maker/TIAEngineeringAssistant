from pydantic import BaseModel, Field, model_validator

from engine.plc_db import DataBlockSpecification
from engine.udt import UdtSpecification
from engine.function_block import FunctionBlockSpecification
from engine.instance_db import InstanceDbSpecification


class ProjectSpecification(BaseModel):
    # CPU family is needed for PLC creation, not for UDT/DB definitions.
    # Existing project payloads may still carry it; empty is valid.
    plc_family: str = ""

    udts: list[UdtSpecification] = []
    dbs: list[DataBlockSpecification] = []
    fbs: list[FunctionBlockSpecification] = []
    instance_dbs: list[InstanceDbSpecification] = []

    @model_validator(mode="after")
    def validate_function_block_dependencies(self):
        by_name = {fb.name.casefold(): fb for fb in self.fbs}
        if len(by_name) != len(self.fbs):
            raise ValueError("Function Block names must be unique.")
        visiting, visited = set(), set()
        def visit(fb):
            key = fb.name.casefold()
            if key in visiting: raise ValueError("Circular Function Block dependency: " + fb.name)
            if key in visited: return
            visiting.add(key)
            for member in fb.static.members:
                child = by_name.get(member.data_type.casefold())
                if child: visit(child)
            visiting.remove(key); visited.add(key)
        for fb in self.fbs: visit(fb)
        for instance in self.instance_dbs:
            if instance.function_block.casefold() not in by_name:
                raise ValueError("Instance DB references unknown Function Block: " + instance.function_block)
        return self


class GeneratedProjectSource(BaseModel):
    source: str
