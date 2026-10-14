<#
.SYNOPSIS
Runs read-only HMI regression checks against the local source tree.
.DESCRIPTION
Validates JavaScript syntax and HMI GUI regression tests. -Full selects
the entire Python suite. Does not start TIA Portal, call Openness, run
Ollama, delete files, alter Git history or build tracked bin/obj files.
#>
param(
    [switch]$Full
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    throw "Missing virtual environment: $python. Run setup.ps1 first."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required for JavaScript regression checks."
}

$targets = @(
    "tests/test_hmi_language_refresh_ui.py",
    "tests/test_hmi_text_list_batch_ui.py",
    "tests/test_hmi_text_list_progress_ui.py",
    "tests/test_hmi_xml_auto_and_manual_review.py"
)

Push-Location $projectRoot
try {
    Write-Host "Checking JavaScript syntax..."
    & node --check "gui/js/tia.js"
    if ($LASTEXITCODE -ne 0) {
        throw "node --check failed (exit code $LASTEXITCODE)."
    }

    $pytestArgs = if ($Full) {
        @("-m", "pytest", "-q")
    } else {
        @("-m", "pytest", "-q") + $targets
    }

    Write-Host ($(if ($Full) { "Running full pytest suite..." }
                 else { "Running targeted HMI regressions..." }))
    & $python @pytestArgs
    if ($LASTEXITCODE -ne 0) {
        throw "pytest failed (exit code $LASTEXITCODE)."
    }

    Write-Host "Checking Git working-tree whitespace errors..."
    & git diff --check
    if ($LASTEXITCODE -ne 0) {
        throw "git diff --check failed (exit code $LASTEXITCODE)."
    }

    Write-Host "PASS: HMI source regression checks completed."
    Write-Host "NOTE: real TIA import/save/re-export was NOT tested."
}
finally {
    Pop-Location
}
