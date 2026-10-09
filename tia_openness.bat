@echo off
cd /d "%~dp0"

echo ==========================================
echo TIA Engineering Assistant - Openness
echo ==========================================
echo.

echo Running TIA Portal process scan...
echo.

openness_adapter\bin\Debug\net48\TiaOpennessAdapter.exe list

echo.
echo ==========================================
echo.

set /p PID=Enter PID to inspect or press ENTER to exit: 

if "%PID%"=="" goto end

echo.
echo Inspecting TIA process %PID%...
echo.

openness_adapter\bin\Debug\net48\TiaOpennessAdapter.exe inspect %PID%

echo.

:end
pause