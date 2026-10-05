@echo off
setlocal

cd /d "%~dp0"

echo [1/4] Creating virtual environment in .venv ...
py -3 -m venv .venv
if errorlevel 1 (
  echo Failed to create venv using py launcher. Trying python...
  python -m venv .venv
  if errorlevel 1 (
    echo ERROR: Could not create virtual environment.
    exit /b 1
  )
)

echo [2/4] Activating environment ...
call .venv\Scripts\activate.bat
if errorlevel 1 (
  echo ERROR: Failed to activate .venv
  exit /b 1
)

echo [3/4] Upgrading pip ...
python -m pip install --upgrade pip
if errorlevel 1 (
  echo ERROR: pip upgrade failed.
  exit /b 1
)

echo [4/4] Installing backend dependencies ...
python -m pip install -r backend\requirements.txt
if errorlevel 1 (
  echo ERROR: dependency installation failed.
  exit /b 1
)

echo.
echo Backend environment setup complete.
echo Next: run run_backend.bat

endlocal
