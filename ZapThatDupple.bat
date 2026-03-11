@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "LOG_DIR=%USERPROFILE%\ZapThatDupple"
set "LOG_FILE=%LOG_DIR%\app.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

if not exist "%SCRIPT_DIR%backend\venv" (
  echo Backend not installed. Run install.ps1 first.
  pause
  exit /b 1
)

if not exist "%SCRIPT_DIR%frontend\dist" (
  echo Frontend not built. Run install.ps1 first.
  pause
  exit /b 1
)

:: Kill old backend
taskkill /f /im python.exe /fi "WINDOWTITLE eq ZapThatDupple*" 2>nul

:: Start backend (hidden window)
start /min "ZapThatDupple-backend" cmd /c "cd /d "%SCRIPT_DIR%backend" && venv\Scripts\python.exe main.py >> "%LOG_FILE%" 2>&1"

:: Wait for backend (max 60 seconds)
echo Starting backend...
set /a WAIT_COUNT=0
:WAIT
curl -s http://127.0.0.1:8765/api/settings >nul 2>&1
if not errorlevel 1 goto READY
set /a WAIT_COUNT+=1
if %WAIT_COUNT% geq 60 (
  echo ERROR: Backend failed to start after 60 seconds.
  echo Check log: %LOG_FILE%
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto WAIT

:READY
echo Backend ready.

:: Start Electron
"%SCRIPT_DIR%frontend\node_modules\.bin\electron.cmd" "%SCRIPT_DIR%frontend"
