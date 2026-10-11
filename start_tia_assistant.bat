@echo off
cd /d "%~dp0"

echo Building TIA Openness adapter...
dotnet build ".\openness_adapter\TiaOpennessAdapter.csproj" --nologo --verbosity quiet

if errorlevel 1 (
    echo.
    echo TIA Openness adapter build failed.
    pause
    exit /b 1
)

start "" ".venv\Scripts\python.exe" -m uvicorn engine.main:app --host 127.0.0.1 --port 8005
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8005/"
exit
