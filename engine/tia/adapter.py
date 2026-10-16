import os
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
        or normalized.startswith("PLC_PROGRAM_BLOCK_NOT_FOUND|")
        or normalized.startswith("PLC_NOT_FOUND|")
        or (
            "process" in normalized.lower()
            and "not found" in normalized.lower()
        )
    ):
        return 404


    if (
        normalized.startswith("PLC_STRUCTURE_NAME_EXISTS|")
        or normalized.startswith("PROJECT_CHANGED|")
        or normalized.startswith("DEVICE_NAME_EXISTS|")
        or normalized.startswith("TAG_NAME_EXISTS|")
        or normalized.startswith("TAG_ADDRESS_EXISTS|")
        or normalized.startswith("PLC_NAME_EXISTS|")
        or normalized.startswith("NO_OPEN_PROJECT")
        or normalized.startswith("MORE_THAN_ONE_PROJECT")
    ):
        return 409


    if (
        normalized.startswith("INVALID_PLC_STRUCTURE_IMPORT")
        or normalized.startswith("Unsupported PLC family:")
        or normalized.startswith("NO_TAGS_TO_CREATE")
        or normalized.startswith("TAG_TABLE_NAME_REQUIRED")
        or normalized.startswith("PROGRAM_BLOCK_EXPORT_ARGUMENT_REQUIRED")
        or normalized.startswith("INVALID_CULTURE|")
        or normalized.startswith("LANGUAGE_NOT_SUPPORTED|")
        or normalized.startswith("INVALID_PROJECT_TEXT_CULTURE")
        or normalized.startswith("PROJECT_TEXT_LANGUAGES_MUST_DIFFER")
        or normalized.startswith("PROJECT_TEXT_FILE_NOT_FOUND|")
    ):
        return 422


    return 502


# Large TIA project-text XLSX exports/imports can exceed the ordinary
# adapter timeout. Do not raise the limit for inventory or other commands.
DEFAULT_ADAPTER_TIMEOUT_SECONDS = 180
PROJECT_DISCOVERY_TIMEOUT_SECONDS = 90  # do not leave Overview hanging on a stalled Openness attachment
DEFAULT_PROJECT_TEXT_TIMEOUT_SECONDS = 900
PROJECT_TEXT_COMMANDS = frozenset({
    "export-entire-project-llm",
    "export-project-texts",
    "export-hmi-text-lists",
    "import-hmi-text-list",
    "import-project-texts",
})


def adapter_timeout_seconds(command: str) -> int:
    if command == "list-project-plcs":
        return PROJECT_DISCOVERY_TIMEOUT_SECONDS
    if command not in PROJECT_TEXT_COMMANDS:
        return DEFAULT_ADAPTER_TIMEOUT_SECONDS

    configured = os.getenv("TIA_PROJECT_TEXT_TIMEOUT_SECONDS", "").strip()
    if not configured:
        return DEFAULT_PROJECT_TEXT_TIMEOUT_SECONDS

    try:
        value = int(configured)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="TIA_PROJECT_TEXT_TIMEOUT_SECONDS must be an integer.",
        ) from exc

    if value < DEFAULT_ADAPTER_TIMEOUT_SECONDS or value > 3600:
        raise HTTPException(
            status_code=422,
            detail="TIA_PROJECT_TEXT_TIMEOUT_SECONDS must be between 180 and 3600.",
        )
    return value


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


    command = arguments[0] if arguments else "(missing)"
    timeout_seconds = adapter_timeout_seconds(command)

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
            timeout=timeout_seconds,
            creationflags=creation_flags,
        )

    except subprocess.TimeoutExpired as exc:
        raise HTTPException(
            status_code=504,
            detail=(
                "TIA Openness command '" + command
                + "' timed out after " + str(timeout_seconds)
                + " seconds. Check TIA Portal for blocking dialogs, "
                + "busy project-text operations or an unresponsive session. "
                + (
                    "You can configure TIA_PROJECT_TEXT_TIMEOUT_SECONDS "
                    + "(180-3600) if this export/import normally takes longer."
                    if command in PROJECT_TEXT_COMMANDS else
                    "The adapter timeout for this command is "
                    + str(timeout_seconds) + " seconds."
                )
            ),
        ) from exc


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
