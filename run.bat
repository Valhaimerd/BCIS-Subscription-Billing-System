@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Install Node.js 24 or later first.
  pause
  exit /b 1
)

if not exist ".env" (
  echo Missing .env. Copy .env.example to .env and configure it first.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Dependencies are not installed. Run npm install first.
  pause
  exit /b 1
)

echo Starting the BCIS API and desktop application...
start "BCIS API" cmd /k "npm run dev:api"
timeout /t 2 /nobreak >nul
start "BCIS Desktop" cmd /k "npm run dev:desktop"

endlocal
