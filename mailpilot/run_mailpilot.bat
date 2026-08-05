@echo off
REM MailPilot Uni 0.5 - launcher (finds python, runs the setup GUI, auto-starts collection)
setlocal
cd /d "%~dp0"
set PY=
where py >nul 2>&1 && set PY=py -3
if not defined PY where python >nul 2>&1 && set PY=python
if not defined PY (
  echo.
  echo [MailPilot] Python not found.
  echo Install Python 3.9+ from https://www.python.org/downloads/
  echo and check "Add python.exe to PATH" during setup.
  echo.
  pause
  exit /b 1
)
echo [MailPilot] starting with: %PY%
%PY% "%~dp0gui.py" --autostart %*
if errorlevel 1 (
  echo.
  echo [MailPilot] exited with an error. See mailpilot\logs\ for details.
  pause
)
endlocal
