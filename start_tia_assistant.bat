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
    echo.
    pause
    exit /b 1
)

echo.
echo Starting TIA Engineering Assistant...
echo URL: http://127.0.0.1:8005/
echo.
echo Keep this window open while the application is running.
echo Press Ctrl+C to stop the server.
echo.

start "" "http://127.0.0.1:8005/"

"%PYTHON_EXE%" -m uvicorn engine.main:app --host 127.0.0.1 --port 8005

echo.
echo Server stopped.
pause

endlocal
exit /b 0
