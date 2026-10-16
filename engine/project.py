from pydantic import BaseModel, Field

from engine.plc_db import DataBlockSpecification
from engine.udt import UdtSpecification
from engine.function_block import FunctionBlockSpecification


class ProjectSpecification(BaseModel):
    # CPU family is needed for PLC creation, not for UDT/DB definitions.
    # Existing project payloads may still carry it; empty is valid.
    plc_family: str = ""

    udts: list[UdtSpecification] = []
    dbs: list[DataBlockSpecification] = []
    fbs: list[FunctionBlockSpecification] = []


class GeneratedProjectSource(BaseModel):
    source: str
