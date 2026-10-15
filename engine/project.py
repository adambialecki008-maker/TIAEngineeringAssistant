from pydantic import BaseModel, Field

from engine.plc_db import DataBlockSpecification
from engine.udt import UdtSpecification


class ProjectSpecification(BaseModel):
    # CPU family belongs to PLC creation, not UDT/DB declarations or source generation.\n    # Keep optional for backward-compatible project payloads.\n    plc_family: str = ""

    udts: list[UdtSpecification] = []
    dbs: list[DataBlockSpecification] = []


class GeneratedProjectSource(BaseModel):
    source: str
