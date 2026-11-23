@echo off
title SNR NEST Local Development Launcher
echo ===================================================
echo   SNR NEST Local Development (Docker for DB only)
echo ===================================================
echo.
echo [1/3] Ensuring PostgreSQL is running in Docker...
docker compose up -d db
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Could not start Docker PostgreSQL container. Please ensure Docker Desktop is running.
    pause
    exit /b %ERRORLEVEL%
)

echo [2/3] Launching FastAPI Backend in a new console window...
start "SNR NEST - Backend API (Port 8000)" cmd /k "if exist "%~dp0.venv\Scripts\activate.bat" (call "%~dp0.venv\Scripts\activate.bat") & cd /d "%~dp0backend" & python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [3/3] Launching Vite Frontend in a new console window...
start "SNR NEST - Frontend (Port 5173)" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo ===================================================
echo Both consoles are now open in separate windows!
echo - Database: Docker (PostgreSQL 127.0.0.1:5432)
echo - Backend:  http://127.0.0.1:8000
echo - Frontend: http://localhost:5173
echo.
echo Seed Accounts (Password: test-seed-password-123!):
echo - System Admin: system_admin@dev.example.org
echo - Store Admin:  store_admin@dev.example.org
echo - Employee:     employee@dev.example.org
echo - HR / Payroll: hr_payroll@dev.example.org
echo ===================================================
echo.
pause

