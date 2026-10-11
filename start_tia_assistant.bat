@echo off
setlocal
cd /d "%~dp0"

set "DOTNET_EXE=C:\Program Files\dotnet\dotnet.exe"
set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
    echo.
    echo ERROR: Python virtual environment was not found:
    echo "%PYTHON_EXE%"
    echo.
    echo Run setup.ps1 first.
    pause
    exit /b 1
)

if not exist "%DOTNET_EXE%" (
    where dotnet >nul 2>nul

    if errorlevel 1 (
        echo.
        echo ERROR: dotnet.exe was not found.
        echo Run setup.ps1 first.
        pause
        exit /b 1
    )

    set "DOTNET_EXE=dotnet"
)

echo Building TIA Openness adapter...
"%DOTNET_EXE%" build ".\openness_adapter\TiaOpennessAdapter.csproj" --nologo --verbosity minimal

if errorlevel 1 (
    echo.
    echo ERROR: TIA Openness adapter build failed.
    echo Copy the build error from this window.
    pause
    exit /b 1
)

echo.
echo Starting TIA Engineering Assistant on http://127.0.0.1:8005/
start "" "%PYTHON_EXE%" -m uvicorn engine.main:app --host 127.0.0.1 --port 8005

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8005/"

endlocal
exit /b 0
