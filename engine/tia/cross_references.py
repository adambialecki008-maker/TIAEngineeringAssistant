"""Read-only Step7 cross-references retrieved from Siemens Openness V21.

No implicit fallback to fuzzy source code or XML substring matching: a failed
Openness lookup is an error, never an invented 'no references' result.
"""
import base64
import binascii

from fastapi import APIRouter, HTTPException, Query

from engine.tia.compat import run_adapter
from engine.tia.models import PlcCrossReferenceRow, PlcCrossReferenceResult


router = APIRouter()


def _decode_field(value: str) -> str:
    try:
        return base64.b64decode(value, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError) as exc:
        raise HTTPException(502, "Invalid cross-reference data from Openness.") from exc


@router.get("/plc-cross-references", response_model=PlcCrossReferenceResult)
def get_plc_cross_references(
    process_id: int = Query(ge=1),
    device_name: str = Query(min_length=1, max_length=128),
    plc_name: str = Query(min_length=1, max_length=128),
    kind: str = Query(pattern="^(OB|FB|FC|DB|UDT|ob|fb|fc|db|udt)$"),
    group_path: str = Query(default="", max_length=512),
    name: str = Query(min_length=1, max_length=128),
    member_path: str = Query(default="", max_length=512),
):
    lines = run_adapter(
        "plc-cross-references", str(process_id), device_name.strip(),
        plc_name.strip(), kind.lower(), group_path.strip(),
        name.strip(), member_path.strip(),
    )
    rows = []
    total = None
    truncated = False
    keys = (
        "source_name", "source_path", "reference_name", "reference_path",
        "location_name", "reference_location", "reference_type", "access",
    )
    for line in lines:
        if line.startswith("PLC_CROSS_REFERENCE|"):
            fields = line.split("|")[1:]
            if len(fields) != len(keys):
                raise HTTPException(502, "Incomplete cross-reference row from Openness.")
            rows.append(PlcCrossReferenceRow(
                **dict(zip(keys, map(_decode_field, fields)))
            ))
        elif line.startswith("PLC_CROSS_REFERENCE_TOTAL|"):
            parts = line.split("|")
            if len(parts) != 3:
                raise HTTPException(502, "Invalid cross-reference status from Openness.")
            try:
                total = int(parts[1])
            except ValueError as exc:
                raise HTTPException(502, "Invalid cross-reference count.") from exc
            truncated = parts[2].casefold() == "true"
    if total is None or total != len(rows):
        raise HTTPException(
            502, "Cross-reference result missing or incomplete from Openness."
        )
    return PlcCrossReferenceResult(references=rows, truncated=truncated)
