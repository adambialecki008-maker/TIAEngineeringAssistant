from pydantic import BaseModel, Field

from engine.plc_db import DataBlockSpecification
from engine.udt import UdtSpecification


class ProjectSpecification(BaseModel):
    plc_family: str = Field(min_length=1)

    udts: list[UdtSpecification] = []
    dbs: list[DataBlockSpecification] = []


class GeneratedProjectSource(BaseModel):
    source: str
