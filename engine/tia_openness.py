from fastapi import APIRouter

from engine.tia.adapter import (
    ADAPTER_EXE,
    PROJECT_ROOT,
    adapter_error_status as _adapter_error_status,
    read_project_saved as _read_project_saved,
    run_adapter as _run_adapter,
)
from engine.tia.hardware import (
    router as hardware_router,
)
from engine.tia.hmi_translation import (
    router as hmi_translation_router,
)
from engine.tia.hmi_devices import (
    router as hmi_devices_router,
)
from engine.tia.hmi_text_list_inventory import (
    router as hmi_text_list_inventory_router,
)
from engine.tia.hmi_text_list_translation import (
    router as hmi_text_list_translation_router,
)
from engine.tia.hmi_review import (
    router as hmi_review_router,
)
from engine.tia.hmi_batches import (
    router as hmi_batches_router,
)
from engine.tia.hmi_quality_report import (
    router as hmi_quality_report_router,
)
from engine.tia.languages import (
    router as languages_router,
)
from engine.tia.models import *  # noqa: F401,F403
from engine.tia.plc_management import (
    router as plc_management_router,
)
from engine.tia.project import (
    router as project_router,
)
from engine.tia.program import (
    router as program_router,
)
from engine.tia.cross_references import (
    router as cross_references_router,
)
from engine.tia.structures import (
    router as structures_router,
)
from engine.tia.tags import (
    router as tags_router,
)
from engine.tia.xml_parser import (
    parse_structure_xml as _parse_structure_xml,
)


router = APIRouter(
    prefix="/api/v1/tia",
    tags=[
        "TIA Openness",
    ],
)


for subrouter in (
    project_router,
    languages_router,
    hmi_translation_router,
    hmi_devices_router,
    hmi_text_list_inventory_router,
    hmi_text_list_translation_router,
    hmi_review_router,
    hmi_batches_router,
    hmi_quality_report_router,
    program_router,
    cross_references_router,
    structures_router,
    tags_router,
    hardware_router,
    plc_management_router,
):
    router.include_router(
        subrouter
    )
