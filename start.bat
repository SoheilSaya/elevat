@echo off
:: Check for admin rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)
:: Run from the bat file's directory
cd /d "%~dp0"

echo ============================================
echo  ELEVATE - rebuilding index.html from tabs\...
echo ============================================
python build.py
if %errorLevel% neq 0 (
    echo.
    echo *** BUILD FAILED - see error above. Server NOT started. ***
    pause
    exit /b
)

echo.
echo Starting ELEVATE Habit Tracker...
python app.py
pause
