Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# TLS 1.2 for Windows PowerShell 5.1 downloads
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12


# ============================================================
# Paths
# ============================================================

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

$VenvPath = Join-Path $ProjectRoot ".venv"
$VenvPython = Join-Path $VenvPath "Scripts\python.exe"

$RequirementsFile = Join-Path $ProjectRoot "requirements.txt"

$AdapterDirectory = Join-Path $ProjectRoot "openness_adapter"
$AdapterProject = Join-Path $AdapterDirectory "TiaOpennessAdapter.csproj"

$TiaPublicApiPath = "C:\Program Files\Siemens\Automation\Portal V21\PublicAPI\V21\net48"

$TiaBaseDll = Join-Path $TiaPublicApiPath "Siemens.Engineering.Base.dll"
$TiaStep7Dll = Join-Path $TiaPublicApiPath "Siemens.Engineering.Step7.dll"

$Net48ReferencePath = "C:\Program Files (x86)\Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8"

$Net48DeveloperPackUrl = "https://download.microsoft.com/download/6/4/2/642ec242-448b-49a1-8371-5d9c202eaa46/NDP48-DevPack-ENU.exe"


# ============================================================
# Helpers
# ============================================================

function Write-Step {
    param(
        [string]$Message
    )

    Write-Host ""
    Write-Host "============================================================"
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "============================================================"
}


function Write-Ok {
    param(
        [string]$Message
    )

    Write-Host "[OK] $Message" -ForegroundColor Green
}


function Write-Warn {
    param(
        [string]$Message
    )

    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}


function Test-IsAdministrator {
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()

    $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)

    return $Principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )
}


function Restart-AsAdministrator {
    Write-Host ""
    Write-Host "Administrator privileges are required."
    Write-Host "Requesting elevation..."

    $Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""

    Start-Process `
        -FilePath "powershell.exe" `
        -Verb RunAs `
        -ArgumentList $Arguments

    exit
}


function Test-CommandExists {
    param(
        [string]$Name
    )

    $Command = Get-Command $Name -ErrorAction SilentlyContinue

    return ($null -ne $Command)
}


# ============================================================
# Elevation
# ============================================================

if (-not (Test-IsAdministrator)) {
    Restart-AsAdministrator
}


Set-Location $ProjectRoot


Write-Host ""
Write-Host "TIA Engineering Assistant Setup" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot"


# ============================================================
# 1. Python
# ============================================================

Write-Step "1/6 - Python environment"


$PythonExecutable = $null
$PythonPrefixArguments = @()


if (Test-CommandExists "py") {
    $PythonExecutable = "py"
    $PythonPrefixArguments = @("-3")
}
elseif (Test-CommandExists "python") {
    $PythonExecutable = "python"
}
else {
    throw @"
Python was not found.

Install Python and make sure either:

    py

or:

    python

works from PowerShell.
"@
}


if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating .venv..."

    & $PythonExecutable @PythonPrefixArguments -m venv $VenvPath

    if ($LASTEXITCODE -ne 0) {
        throw "Creating Python virtual environment failed."
    }

    Write-Ok ".venv created."
}
else {
    Write-Ok ".venv already exists."
}


if (-not (Test-Path $VenvPython)) {
    throw "Virtual environment Python executable was not found."
}


Write-Host "Updating pip..."

& $VenvPython -m pip install --upgrade pip

if ($LASTEXITCODE -ne 0) {
    throw "pip upgrade failed."
}


if (Test-Path $RequirementsFile) {
    Write-Host "Installing requirements.txt..."

    & $VenvPython -m pip install -r $RequirementsFile

    if ($LASTEXITCODE -ne 0) {
        throw "Installing requirements.txt failed."
    }

    Write-Ok "Python requirements installed."
}
else {
    Write-Warn "requirements.txt not found."
}


# ============================================================
# 2. .NET SDK
# ============================================================

Write-Step "2/6 - .NET SDK"


$DotnetExe = "C:\Program Files\dotnet\dotnet.exe"

$DotnetAvailable = Test-CommandExists "dotnet"
$DotnetFileExists = Test-Path $DotnetExe


if ((-not $DotnetAvailable) -and (-not $DotnetFileExists)) {
    Write-Host ".NET SDK was not found."


    if (-not (Test-CommandExists "winget")) {
        throw @"
winget was not found.

Install Microsoft App Installer / winget and run setup.ps1 again.
"@
    }


    Write-Host "Installing .NET 10 SDK..."


    & winget install `
        --id Microsoft.DotNet.SDK.10 `
        --exact `
        --source winget `
        --accept-source-agreements `
        --accept-package-agreements


    if ($LASTEXITCODE -ne 0) {
        throw ".NET SDK installation failed."
    }


    # Make dotnet immediately visible in this PowerShell process.
    $env:PATH = "C:\Program Files\dotnet;$env:PATH"
}


if (Test-Path $DotnetExe) {
    $DotnetCommand = $DotnetExe
}
elseif (Test-CommandExists "dotnet") {
    $DotnetCommand = "dotnet"
}
else {
    throw ".NET SDK installation completed, but dotnet.exe was not found."
}


$DotnetVersion = & $DotnetCommand --version

if ($LASTEXITCODE -ne 0) {
    throw "dotnet --version failed."
}


Write-Ok ".NET SDK detected: $DotnetVersion"


# ============================================================
# 3. .NET Framework 4.8 Developer Pack
# ============================================================

Write-Step "3/6 - .NET Framework 4.8 Developer Pack"


if (Test-Path $Net48ReferencePath) {
    Write-Ok ".NET Framework 4.8 Developer Pack already installed."
}
else {
    Write-Host ".NET Framework 4.8 Developer Pack not found."
    Write-Host "Downloading official Microsoft installer..."


    $InstallerPath = Join-Path $env:TEMP "NDP48-DevPack-ENU.exe"


    if (Test-Path $InstallerPath) {
        Remove-Item $InstallerPath -Force
    }


    Invoke-WebRequest `
        -Uri $Net48DeveloperPackUrl `
        -OutFile $InstallerPath `
        -UseBasicParsing


    if (-not (Test-Path $InstallerPath)) {
        throw "Developer Pack installer download failed."
    }


    Write-Host "Checking digital signature..."


    $Signature = Get-AuthenticodeSignature $InstallerPath


    if ($Signature.Status -ne "Valid") {
        Remove-Item $InstallerPath -Force -ErrorAction SilentlyContinue

        throw @"
The .NET Framework 4.8 Developer Pack installer
does not have a valid digital signature.

Installation aborted.
"@
    }


    if ($null -eq $Signature.SignerCertificate) {
        Remove-Item $InstallerPath -Force -ErrorAction SilentlyContinue

        throw "Developer Pack installer has no signing certificate."
    }


    $SignerSubject = $Signature.SignerCertificate.Subject


    if ($SignerSubject -notmatch "Microsoft") {
        Remove-Item $InstallerPath -Force -ErrorAction SilentlyContinue

        throw @"
The .NET Framework Developer Pack installer
is not signed by Microsoft.

Installation aborted.
"@
    }


    Write-Ok "Microsoft digital signature verified."


    Write-Host "Installing .NET Framework 4.8 Developer Pack..."


    $InstallerProcess = Start-Process `
        -FilePath $InstallerPath `
        -ArgumentList "/install /quiet /norestart" `
        -Wait `
        -PassThru


    $InstallerExitCode = $InstallerProcess.ExitCode


    Remove-Item `
        $InstallerPath `
        -Force `
        -ErrorAction SilentlyContinue


    $InstallationSucceeded = $false


    if ($InstallerExitCode -eq 0) {
        $InstallationSucceeded = $true
    }

    if ($InstallerExitCode -eq 3010) {
        $InstallationSucceeded = $true
        Write-Warn "Windows reports that a reboot is required."
    }

    if ($InstallerExitCode -eq 1641) {
        $InstallationSucceeded = $true
        Write-Warn "Windows reports that a reboot has been initiated/required."
    }


    if (-not $InstallationSucceeded) {
        throw ".NET Framework 4.8 Developer Pack installation failed. Exit code: $InstallerExitCode"
    }


    if (Test-Path $Net48ReferencePath) {
        Write-Ok ".NET Framework 4.8 Developer Pack installed."
    }
    else {
        throw @"
Developer Pack installation finished, but the .NET Framework 4.8
reference assemblies were not found at:

$Net48ReferencePath

Restart Windows and run setup.ps1 again.
"@
    }
}


# ============================================================
# 4. Siemens TIA Portal Openness V21
# ============================================================

Write-Step "4/6 - TIA Portal Openness V21"


if (-not (Test-Path $TiaPublicApiPath)) {
    throw @"
TIA Portal V21 PublicAPI directory was not found:

$TiaPublicApiPath

Install TIA Portal V21 with Openness support.
"@
}


if (-not (Test-Path $TiaBaseDll)) {
    throw @"
Missing:

$TiaBaseDll
"@
}


if (-not (Test-Path $TiaStep7Dll)) {
    throw @"
Missing:

$TiaStep7Dll
"@
}


Write-Ok "Siemens.Engineering.Base.dll found."
Write-Ok "Siemens.Engineering.Step7.dll found."
Write-Ok "TIA Portal V21 PublicAPI available."


# ============================================================
# 5. Build C# adapter
# ============================================================

Write-Step "5/6 - Build TIA Openness adapter"


if (-not (Test-Path $AdapterDirectory)) {
    throw @"
Adapter directory was not found:

$AdapterDirectory
"@
}


if (-not (Test-Path $AdapterProject)) {
    throw @"
Adapter project was not found:

$AdapterProject
"@
}


Push-Location $AdapterDirectory


try {
    & $DotnetCommand build $AdapterProject

    if ($LASTEXITCODE -ne 0) {
        throw "TiaOpennessAdapter build failed."
    }
}
finally {
    Pop-Location
}


$AdapterExe = Join-Path `
    $AdapterDirectory `
    "bin\Debug\net48\TiaOpennessAdapter.exe"


if (-not (Test-Path $AdapterExe)) {
    throw @"
Build finished, but adapter executable was not found:

$AdapterExe
"@
}


Write-Ok "TiaOpennessAdapter built successfully."


# ============================================================
# 6. Final report
# ============================================================

Write-Step "6/6 - Setup complete"


Write-Host ""
Write-Host "Python:" -ForegroundColor Cyan
Write-Host "  $VenvPython"

Write-Host ""
Write-Host ".NET SDK:" -ForegroundColor Cyan
Write-Host "  $DotnetVersion"

Write-Host ""
Write-Host ".NET Framework:" -ForegroundColor Cyan
Write-Host "  4.8 Developer Pack"

Write-Host ""
Write-Host "TIA Openness V21:" -ForegroundColor Cyan
Write-Host "  $TiaPublicApiPath"

Write-Host ""
Write-Host "Adapter:" -ForegroundColor Cyan
Write-Host "  $AdapterExe"

Write-Host ""
Write-Host "Setup finished successfully." -ForegroundColor Green

Write-Host ""
Write-Host "Next command:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  .\openness_adapter\bin\Debug\net48\TiaOpennessAdapter.exe list"
Write-Host ""