@echo off
title SNR NEST - Backend API (Port 8000)
echo Starting SNR NEST Backend (FastAPI on http://127.0.0.1:8000)...
if exist "%~dp0.venv\Scripts\activate.bat" (
    echo Activating virtual environment (.venv)...
    call "%~dp0.venv\Scripts\activate.bat"
)
cd /d "%~dp0backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

