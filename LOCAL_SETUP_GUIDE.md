# SNR NEST - Local Development Setup Guide

This guide explains how to run SNR NEST locally using **Docker only for PostgreSQL**, while running the **FastAPI backend** and **React Vite frontend** natively on your host machine so you can easily see the console outputs and logs in real time.

---

## ⚡ Quick Start (Windows One-Click)

If Docker Desktop is running, you can launch everything in separate visible console windows immediately:

- **Double-click `start_dev.bat`** (in project root):
  - Starts PostgreSQL in Docker on port `5432`.
  - Opens a console window running FastAPI (`http://127.0.0.1:8000`).
  - Opens a console window running Vite Frontend (`http://localhost:5173`).

Or run individual launchers:
- **`run_backend.bat`**: Runs FastAPI with live reload in its own console.
- **`run_frontend.bat`**: Runs Vite dev server in its own console.
- **`start_db.bat`**: Starts the PostgreSQL Docker container.

---

## Architecture Overview

- **Database:** PostgreSQL 17 (Docker container `snr-nest-db-1` on `127.0.0.1:5432`)
- **Backend API:** Python 3.12+ / FastAPI / SQLAlchemy / Alembic (Running on `http://127.0.0.1:8000`)
- **Frontend App:** React 19 / Vite / TypeScript PWA (Running on `http://127.0.0.1:5173`)

---

## Prerequisites

1. **Docker Desktop** installed and running (for PostgreSQL).
2. **Python 3.12+** (Python 3.12, 3.13, or 3.14) installed on your system.
3. **Node.js 20+** and `npm` installed on your system.

---

## Step-by-Step Setup

### Step 1: Start PostgreSQL with Docker

From the project root directory (`SNR_website/`), run:

```bash
# Start only the PostgreSQL database service in the background
docker compose up -d db
```

To verify PostgreSQL is running and healthy:

```bash
docker compose ps
```
You should see `snr-nest-db-1` with status `Up (healthy)` on `127.0.0.1:5432->5432/tcp`.

---

### Step 2: Backend Setup (FastAPI & Database)

1. Open a terminal and navigate to the `backend/` directory:

   ```bash
   cd backend
   ```

2. *(Optional but recommended)* Create and activate a virtual environment:

   ```bash
   # Windows (PowerShell)
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1

   # Linux / macOS
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install backend dependencies:

   ```bash
   pip install -r requirements-runtime.txt
   ```

4. Verify your `backend/.env` file exists with these values:

   ```ini
   APP_ENV=development
   DATABASE_URL=postgresql+psycopg://snr_nest:snr_nest_dev@127.0.0.1:5432/snr_nest
   CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
   ALLOWED_HOSTS=["localhost","127.0.0.1","testserver"]
   SESSION_COOKIE_SECURE=false
   ACCESS_SESSION_MINUTES=15
   REFRESH_SESSION_DAYS=30
   SNR_DEV_SEED_PASSWORD=test-seed-password-123!
   ```

5. Apply database migrations:

   ```bash
   alembic upgrade head
   ```

6. Seed development identities and store test data:

   ```bash
   python scripts/seed_dev.py
   ```

7. Start the FastAPI backend server:

   ```bash
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

   The backend will be live at `http://127.0.0.1:8000`.
   - Health check: `http://127.0.0.1:8000/health`
   - Readiness & DB check: `http://127.0.0.1:8000/api/v1/ready`
   - Interactive Swagger API docs: `http://127.0.0.1:8000/docs`

---

### Step 3: Frontend Setup (React & Vite)

1. Open a **new terminal** and navigate to the `frontend/` directory:

   ```bash
   cd frontend
   ```

2. Install frontend dependencies:

   ```bash
   npm install
   ```

3. Ensure `frontend/.env.development` exists with:

   ```ini
   VITE_API_BASE_URL=http://localhost:8000
   VITE_AUTH_SESSION_SOURCE=api
   ```

4. Start the Vite development server:

   ```bash
   npm run dev
   ```

   The web application will be available at `http://localhost:5173`.

---

## Development Seed Accounts & Credentials

The seed script creates the following accounts with password:
`test-seed-password-123!`

| Role | Email | Password | Landing Workspace | Description |
|---|---|---|---|---|
| **Employee** | `employee@dev.example.org` | `test-seed-password-123!` | `/me` | Records attendance with QR scan & selfie photo |
| **Store Admin** | `store_admin@dev.example.org` | `test-seed-password-123!` | `/team` | Displays live rotating Store QR station & manages shifts |
| **HR / Payroll** | `hr_payroll@dev.example.org` | `test-seed-password-123!` | `/hr` | Cross-store attendance review, shift admin & payroll |
| **System Admin** | `system_admin@dev.example.org` | `test-seed-password-123!` | `/hr` | Org & Store setup, global administration |
| **Auditor** | `auditor@dev.example.org` | `test-seed-password-123!` | `/hr` | Read-only compliance & audit inspections |

---

## Testing the Attendance MVP Workflow

1. **Open Store QR Display (Store Admin):**
   - Open browser at `http://localhost:5173/login`.
   - Sign in as `store_admin@dev.example.org`.
   - Navigate to `/attendance/station` (or Store QR Station).
   - The station displays a dynamic 60-second rotating cryptographic QR challenge with countdown.

2. **Record Attendance Punch (Employee):**
   - In an incognito tab or separate window, open `http://localhost:5173/login`.
   - Sign in as `employee@dev.example.org`.
   - Click **Clock In** on the dashboard punch card.
   - Capture a selfie photo using your webcam (or choose file fallback).
   - In development mode, click **Auto-fetch Store Challenge** (or scan the QR displayed on the Store Admin screen).
   - Submit punch. The punch in is saved with UTC timestamp, store receipt time, and private evidence key.
   - Review your recorded punch in **My Attendance**.

---

## Running Automated Verification & Tests

### Backend Unit & Integration Tests:
```bash
cd backend
pytest
```
All 37 unit and integration tests run against your local PostgreSQL database.

### Frontend Component & Application Tests:
```bash
cd frontend
npm run test
```

### Frontend Typechecking & Production Build:
```bash
cd frontend
npm run typecheck
npm run build
```

---

## Stopping Services

- To stop the backend or frontend: Press `CTRL+C` in their respective terminals.
- To stop PostgreSQL:
  ```bash
  docker compose stop db
  ```
- To start PostgreSQL back up later:
  ```bash
  docker compose up -d db
  ```

