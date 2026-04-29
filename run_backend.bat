@echo off
setlocal

cd /d "%~dp0"

if exist ".env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env") do (
    if not "%%A"=="" (
      set "%%A=%%B"
    )
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo ERROR: .venv is incomplete or missing.
  echo Run setup_backend_env.bat first.
  exit /b 1
)

call .venv\Scripts\activate.bat
if errorlevel 1 (
  echo ERROR: Failed to activate .venv
  exit /b 1
)

python -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

endlocal
