from pydantic import BaseModel, Field, model_validator

from engine.plc_db import DataBlockSpecification
from engine.udt import UdtSpecification
from engine.function_block import FunctionBlockSpecification
from engine.function import FunctionSpecification
from engine.instance_db import InstanceDbSpecification


class ProjectSpecification(BaseModel):
    # CPU family is needed for PLC creation, not for UDT/DB definitions.
    # Existing project payloads may still carry it; empty is valid.
    plc_family: str = ""

    udts: list[UdtSpecification] = []
    dbs: list[DataBlockSpecification] = []
    fbs: list[FunctionBlockSpecification] = []
    fcs: list[FunctionSpecification] = []
    instance_dbs: list[InstanceDbSpecification] = []

    @model_validator(mode="after")
    def validate_function_block_dependencies(self):
        by_name = {fb.name.casefold(): fb for fb in self.fbs}
        if len(by_name) != len(self.fbs):
            raise ValueError("Function Block names must be unique.")
        fc_names = {fc.name.casefold() for fc in self.fcs}
        if len(fc_names) != len(self.fcs):
            raise ValueError("Function names must be unique.")
        if set(by_name).intersection(fc_names):
            raise ValueError("Function and Function Block names must be unique across program blocks.")

        def walk_members(members):
            for member in members:
                yield member
                if member.struct_members:
                    yield from walk_members(member.struct_members)

        for fb in self.fbs:
            for section in (fb.input, fb.output, fb.inout, fb.temp, fb.constant):
                for member in walk_members(section.members):
                    if member.data_type.casefold() in by_name:
                        raise ValueError(
                            "Function Block references are allowed only as Static multi-instances: "
                            + fb.name + "." + member.name
                        )
        for fc in self.fcs:
            for section in (fc.input, fc.output, fc.inout, fc.temp, fc.constant):
                for member in walk_members(section.members):
                    if member.data_type.casefold() in by_name:
                        raise ValueError(
                            "Functions cannot declare Function Block multi-instances: "
                            + fc.name + "." + member.name
                        )
        visiting, visited = set(), set()
        def visit(fb):
            key = fb.name.casefold()
            if key in visiting: raise ValueError("Circular Function Block dependency: " + fb.name)
            if key in visited: return
            visiting.add(key)
            for member in fb.static.members:
                child = by_name.get(member.data_type.casefold())
                if child:
                    if child.source_mode != "tia_read_only" or not child.interface_verified:
                        raise ValueError(
                            "Function Block dependency is not a verified TIA snapshot: " + child.name
                        )
                    visit(child)
            visiting.remove(key); visited.add(key)
        for fb in self.fbs: visit(fb)
        for instance in self.instance_dbs:
            if instance.function_block.casefold() not in by_name:
                raise ValueError("Instance DB references unknown Function Block: " + instance.function_block)
        return self


class GeneratedProjectSource(BaseModel):
    source: str
