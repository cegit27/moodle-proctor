# Moodle-Proctor

Unified online exam proctoring platform built around Moodle, a Fastify backend, a Next.js teacher dashboard, an AI proctoring service, and companion desktop/mobile tools.

This `README.md` replaces the scattered project docs and is intended to be the single top-level reference for the repository.

## What This Project Includes

This repo combines several related applications:

- `backend/`: Fastify + TypeScript API for auth, exams, rooms, teachers, violations, live monitoring, LTI, Moodle quiz support, and answer-sheet upload flows.
- `frontend/`: Next.js teacher dashboard for monitoring rooms, reviewing alerts, managing exams, and tracking answer-sheet uploads.
- `ai_proctoring/`: FastAPI/WebSocket computer-vision service that analyzes browser-streamed video frames for proctoring violations.
- `manual_proctoring/`: Electron desktop client intended for student exam delivery and manual-proctoring flows.
- `Scanning-and-Uploading/exam-system-mobile-client-main/`: mobile-oriented Next.js app for scanning and uploading physical answer sheets.
- `Scanning-and-Uploading/unique-id-genration-for-students/`: QR/token generator service that creates per-student upload links.
- `moodle-config/`: Apache vhost override used by the local Moodle container.
- `tests/`: cross-service JS/TS tests plus Python unit tests for AI modules.

## Core Use Cases

The platform supports these main flows:

1. A teacher configures exams, rooms, and warning policies.
2. Students join a room and launch the desktop exam app.
3. The browser/desktop client streams frames to the AI service over WebSocket.
4. The backend records warnings, room activity, and teacher-facing live monitoring data.
5. Moodle integration supports LMS-backed auth/LTI and quiz-related workflows.
6. After a paper exam, students can scan and upload answer sheets through the mobile upload flow.

## Architecture

### Main services

| Service | Stack | Default port | Purpose |
| --- | --- | --- | --- |
| `frontend` | Next.js 14 | `3000` | Teacher dashboard and browser-facing UI |
| `backend` | Fastify + TypeScript | `5000` | Main API, auth, rooms, exams, alerts, uploads |
| `ai-proctoring` | FastAPI + WebSockets | `8000` | Frame-by-frame AI violation detection |
| `moodle` | Bitnami Moodle | `8080` / `8443` | LMS and LTI/Moodle-side workflows |
| `postgres` | PostgreSQL 15 | `5433 -> 5432` | Proctoring application data |
| `mariadb` | MariaDB | internal | Moodle database |

### Backend feature modules

The backend is organized by domain:

- `auth`
- `exam`
- `student`
- `teacher`
- `violation`
- `room`
- `live-monitoring`
- `lti`
- `moodle-quiz`
- `scan`
- `manual-proctoring`
- `security`
- `webrtc`

The Fastify app also exposes:

- `GET /health`
- `GET /api/csrf-token`
- WebSocket proxying under `/ws`

### AI proctoring capabilities

The Python service currently supports configurable detectors including:

- face monitoring
- gaze tracking
- phone detection
- forbidden object detection
- identity verification
- optional audio, blink, lip, tab, lighting, and motion heuristics

Important detail: the live warning flow forwarded back to the app is intentionally scoped to the main camera-based checks. Some optional heuristic detectors may run locally without being counted as live warnings.

## Repository Layout

```text
.
|-- backend/
|-- frontend/
|-- ai_proctoring/
|-- manual_proctoring/
|-- moodle-config/
|-- Scanning-and-Uploading/
|   |-- exam-system-mobile-client-main/
|   |-- exam-system-qp-upload-main/   # git submodule-style entry
|   `-- unique-id-genration-for-students/
|-- tests/
|-- docker-compose.yml
`-- docker-compose.test.yml
```

## Running the Full Stack with Docker

This is the easiest way to bring up the main system.

### Start

```bash
docker compose up --build
```

### Main URLs

- Teacher dashboard: `http://localhost:3000`
- Backend API: `http://localhost:5000`
- AI service: `http://localhost:8000`
- Moodle: `http://localhost:8080`
- PostgreSQL: `localhost:5433`

### Default Moodle credentials in `docker-compose.yml`

- Username: `admin`
- Password: `Admin123!`

### Docker notes

- PostgreSQL stores proctoring data.
- MariaDB stores Moodle data.
- The backend runs DB migrations through the dedicated `migration` service before app startup.
- The AI service mounts `ai_proctoring/` directly and writes screenshots/reports inside that folder.

## Local Development

If you want to run services without Docker, start each application separately.

### Prerequisites

- Node.js `>= 18` for backend/frontend
- Python `3.11` to `< 3.13` for `ai_proctoring`
- PostgreSQL for app data
- Moodle + MariaDB if you need LMS/LTI integration locally

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run migrate
npm run dev
```

Key scripts:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run migrate`
- `npm run migrate:status`
- `npm run seed`
- `npm run test`
- `npm run test:e2e`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend expects the backend at `NEXT_PUBLIC_BACKEND_URL`, defaulting to `http://localhost:5000`.

### AI proctoring service

```bash
cd ai_proctoring
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python main.py
```

On Windows PowerShell:

```powershell
cd ai_proctoring
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

### Electron manual proctoring client

```bash
cd manual_proctoring
npm install
npm start
```

## Important Configuration

### Backend environment

The main backend config lives in `backend/.env` and `backend/src/config/index.ts`.

Important variables:

- `DATABASE_URL`
- `MOODLE_BASE_URL`
- `MOODLE_SERVICE`
- `BACKEND_URL`
- `LTI_CONSUMER_KEY`
- `LTI_CONSUMER_SECRET`
- `JWT_SECRET`
- `AI_SERVICE_URL`
- `AI_SERVICE_SHARED_SECRET`
- `CORS_ORIGIN`
- `UPLOAD_DIR`

The checked-in example file is `backend/.env.example`.

### AI service configuration

The Python AI service is configured primarily in `ai_proctoring/config.py`.

Key knobs include:

- strictness preset: `strict`, `moderate`, `lenient`
- detector enable/disable flags such as `ENABLE_GAZE_TRACKING`
- output locations for screenshots, reports, and `violations.jsonl`
- thresholds for face absence, look-away duration, phone/object confidence, identity mismatch, lighting, motion, and other heuristics

## Main Workflows

### Teacher workflow

The dashboard supports:

- exam creation and configuration
- live room creation
- student monitoring
- alert review
- answer-sheet upload review
- teacher overview metrics

Useful frontend routes include:

- `/login`
- `/dashboard/overview`
- `/dashboard/monitoring`
- `/dashboard/exams`
- `/dashboard/alerts`
- `/dashboard/reports`
- `/dashboard/answer-sheets`

### Student desktop launch flow

The frontend includes a student launch page that:

- accepts room code, student name, and email
- shows rules and warning policy
- opens the Electron app using a custom `proctor://` deep link

### Answer-sheet scanning/upload flow

The scanning area contains two supporting apps:

- `exam-system-mobile-client-main/`: scan, review, upload, and success pages for answer-sheet submission
- `unique-id-genration-for-students/`: Express service that generates unique tokens and QR codes pointing students to the mobile upload client

## Testing

The repo contains:

- backend unit/integration tests
- Playwright E2E tests
- Python unit tests for AI modules

Relevant files:

- `tests/integration/*.test.ts`
- `tests/unit/*.test.ts`
- `tests/e2e/exam-flow.e2e.test.ts`
- `tests/unit/ai_proctoring/*.py`

Typical commands:

```bash
cd backend
npm test
npm run test:e2e
```

```bash
cd ai_proctoring
pytest
```

## Moodle and LTI Notes

Moodle support is built into the stack rather than being a separate repo:

- local Moodle runs in Docker
- MariaDB stores Moodle data
- backend includes dedicated `lti` and `moodle-quiz` modules
- `moodle-config/moodle-vhost.conf` adds local Apache/vhost restrictions for the Moodle container

For a full LMS-backed flow you will typically need:

- Moodle running
- backend configured with Moodle base URL and service credentials
- LTI keys/secrets aligned between Moodle and backend

## Known Caveats

- `docker-compose.test.yml` appears older and references paths like `./moodle-proctor/...`; it will likely need adjustment before use in the current repo layout.
- `setup-and-test.sh` also appears legacy and contains environment assumptions and hardcoded credentials that should be reviewed before relying on it.
- `Scanning-and-Uploading/exam-system-qp-upload-main` is present as a submodule-style git entry and may require its own checkout/init flow depending on your Git state.
- AI model assets inside `ai_proctoring/` are large and required for some detection features.

## Recommended First Start

If you are new to the repo:

1. Run `docker compose up --build`.
2. Open `http://localhost:3000` for the dashboard.
3. Open `http://localhost:8080` for Moodle.
4. Confirm backend health at `http://localhost:5000/health`.
5. Confirm AI health at `http://localhost:8000/health`.

## Maintenance Notes

Project clutter such as reports, caches, `.next`, `node_modules`, `venv`, coverage outputs, and generated test artifacts is intentionally ignored in `.gitignore`. The goal is to keep this repo source-focused and use this `README.md` as the main project documentation entry point.
