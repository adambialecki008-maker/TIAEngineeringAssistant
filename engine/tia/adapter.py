from pathlib import Path
import subprocess

from fastapi import HTTPException


PROJECT_ROOT = (
    Path(__file__)
    .resolve()
    .parents[2]
)


ADAPTER_EXE = (
    PROJECT_ROOT
    / "openness_adapter"
    / "bin"
    / "Debug"
    / "net48"
    / "TiaOpennessAdapter.exe"
)


def adapter_error_status(
    detail: str,
) -> int:
    normalized = detail.strip()


    if (
        normalized.startswith("PLC_TYPE_NOT_FOUND|")
        or normalized.startswith("PLC_STRUCTURE_NOT_FOUND|")
        or normalized.startswith("PLC_NOT_FOUND|")
        or (
            "process" in normalized.lower()
            and "not found" in normalized.lower()
        )
    ):
        return 404


    if (
        normalized.startswith("DEVICE_NAME_EXISTS|")
        or normalized.startswith("TAG_NAME_EXISTS|")
        or normalized.startswith("TAG_ADDRESS_EXISTS|")
        or normalized.startswith("PLC_NAME_EXISTS|")
        or normalized.startswith("NO_OPEN_PROJECT")
        or normalized.startswith("MORE_THAN_ONE_PROJECT")
    ):
        return 409


    if (
        normalized.startswith("Unsupported PLC family:")
        or normalized.startswith("NO_TAGS_TO_CREATE")
        or normalized.startswith("TAG_TABLE_NAME_REQUIRED")
    ):
        return 422


    return 502


def run_adapter(
    *arguments: str,
) -> list[str]:
    if not ADAPTER_EXE.exists():
        raise HTTPException(
            status_code=503,
            detail=(
                "TIA Openness adapter is not built. "
                "Run setup.ps1 or dotnet build first."
            ),
        )


    creation_flags = 0


    if hasattr(
        subprocess,
        "CREATE_NO_WINDOW",
    ):
        creation_flags = subprocess.CREATE_NO_WINDOW


    try:
        result = subprocess.run(
            [
                str(ADAPTER_EXE),
                *arguments,
            ],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            creationflags=creation_flags,
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail="TIA Openness adapter timed out.",
        )


    stdout = (result.stdout or "").strip()
    stderr = (result.stderr or "").strip()


    if result.returncode != 0:
        detail = (
            stderr
            or stdout
            or (
                "TIA Openness adapter failed "
                f"with exit code {result.returncode}."
            )
        )


        raise HTTPException(
            status_code=adapter_error_status(
                detail
            ),
            detail=detail,
        )


    return [
        line.strip()
        for line in stdout.splitlines()
        if line.strip()
    ]


def read_project_saved(
    lines: list[str],
) -> str | None:
    for line in lines:
        if not line.startswith(
            "PROJECT_SAVED|"
        ):
            continue


        parts = line.split(
            "|",
            1,
        )


        if len(parts) == 2:
            return parts[1]


    return None
