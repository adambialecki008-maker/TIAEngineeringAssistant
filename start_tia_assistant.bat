@echo off
cd /d "%~dp0"
start "" ".venv\Scripts\python.exe" -m uvicorn engine.main:app --host 127.0.0.1 --port 8005
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8005/"
exit