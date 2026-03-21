# DSC Project Workspace

This repository is a workspace for multiple exam and proctoring prototypes. It includes:

- a browser-based teacher dashboard
- a desktop-based manual proctoring app
- an AI proctoring backend with computer vision detectors
- a mobile answer-sheet scanning client

Each folder is currently developed and run independently. There is no single root install or unified start command yet.

## Repository Structure

### `dsc/`

Next.js teacher dashboard UI for monitoring students, alerts, reports, and settings.

- Stack: Next.js 14, React 18, TypeScript, Tailwind CSS
- Status: front-end focused prototype
- Login behavior: the login page is currently UI-only and accepts any email/password

### `manual_proctoring/`

Electron desktop app for candidate login, exam flow, and local/manual proctoring interactions.

- Stack: Electron, vanilla HTML/CSS/JS
- Includes: `backend/` Express API used by the Electron app
- Demo login:
  - Email: `user`
  - Password: `password`

### `ai_proctoring/`

Python-based AI proctoring service that processes webcam frames over WebSocket and returns violations/advisories in real time.

- Stack: FastAPI, OpenCV, MediaPipe, Ultralytics YOLO
- Entry point: `ai_proctoring/main.py`
- Default service URL: `http://localhost:8000`
- Health endpoint: `GET /health`
- WebSocket endpoints:
  - `/proctor`
  - `/ws/proctor`

Available detectors are controlled from `ai_proctoring/config.py` and currently include face monitoring, gaze tracking, phone detection, object detection, and identity verification by default. Additional modules such as audio, blink, lip, tab, lighting, and motion monitoring are present but disabled by default.

### `Scanning-and-Uploading/exam-system-mobile-client-main/`

Next.js mobile web app for scanning and uploading answer sheets.

- Stack: Next.js 14, React, TypeScript, Tailwind CSS
- Includes QR scanning, page review/reordering, and S3 upload flow
- Status: partially integrated prototype with backend/S3 setup still required

## Prerequisites

Before setting up the project, ensure you have the following tools installed on your system:

### Required Tools

- **Node.js 18+ and npm** - Required for frontend, backend, and mobile client
  ```bash
  # Check version
  node --version
  npm --version
  ```

- **Python 3.10+** - Required for AI proctoring service
  ```bash
  # Check version
  python --version
  ```

- **Docker Engine** - Required for running PostgreSQL, MariaDB, Moodle, and containerized services
  ```bash
  # Check installation
  docker --version
  ```

- **Docker Compose** - Required for orchestrating multiple containers
  ```bash
  # Check installation
  docker-compose --version
  ```

- **tmux** - Terminal multiplexer for tmuxinator
  ```bash
  # Install on Ubuntu/Debian
  sudo apt-get install tmux

  # Install on macOS
  brew install tmux

  # Check installation
  tmux -V
  ```

- **tmuxinator** - Tool for managing complex tmux sessions
  ```bash
  # Install using gem (requires Ruby)
  gem install tmuxinator

  # Or install on Ubuntu/Debian
  sudo apt-get install tmuxinator

  # Check installation
  tmuxinator version
  ```

### Optional Tools

- **Git** - For version control
  ```bash
  # Install on Ubuntu/Debian
  sudo apt-get install git

  # Install on macOS
  brew install git
  ```

- **A webcam** - Required for camera-based proctoring features

### Platform Notes

- **Linux/macOS** - Recommended for the full-stack development experience with Docker and tmuxinator
- **Windows** - Supported for manual proctoring desktop app (Electron), but WSL2 is recommended for Docker services

## Quick Start with tmuxinator

The easiest way to run all services locally is using tmuxinator, which will:
- Start all infrastructure services (PostgreSQL, MariaDB, Moodle)
- Launch backend, frontend, AI proctoring, and mobile client in development mode
- Set up the manual proctoring desktop app
- Organize everything in a single tmux session with multiple windows

### Step 1: Clone and navigate to the project

```bash
git clone <repository-url>
cd moodle-proctor
```

### Step 2: Install dependencies

```bash
# Backend dependencies
cd backend && npm install && cd ..

# Frontend dependencies
cd frontend && npm install && cd ..

# AI Proctoring dependencies (requires Python virtual environment)
cd ai_proctoring
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cd ..

# Mobile client dependencies
cd Scanning-and-Uploading/exam-system-mobile-client-main && npm install && cd ../..

# Manual proctoring dependencies
cd manual_proctoring/backend && npm install && cd ../..
cd manual_proctoring && npm install && cd ..
```

### Step 3: Start everything with tmuxinator

```bash
# Start all services in tmux session
tmuxinator start moodle-proctor
```

This will create a tmux session with the following windows:

1. **Docker Compose** - Infrastructure services (PostgreSQL, MariaDB, Moodle, Backend container, AI Proctoring container)
2. **Local Development** - Backend dev server, Frontend dev server, AI Proctoring FastAPI, Mobile client
3. **Manual Proctoring** - Manual proctoring backend and Electron app
4. **Utilities** - Docker logs, database info, service URLs

### tmuxinator Session Layout

- Use `Ctrl+b` then arrow keys to navigate between panes
- Use `Ctrl+b` then `n`/`p` to switch to next/previous window
- Use `Ctrl+b` then `0-3` to jump to specific window
- Use `tmuxinator stop moodle-proctor` to stop all services
- Use `tmuxinator start moodle-proctor` to restart the session

### Service URLs

Once all services are running:

- **Frontend (Teacher Dashboard)**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **AI Proctoring Service**: http://localhost:8000
- **Moodle LMS**: http://localhost:8080 (admin/admin123!)
- **Mobile Scanning Client**: http://localhost:3001 (or port shown in terminal)
- **Manual Proctoring Backend**: http://localhost:5000 (separate instance)

### Stopping Services

```bash
# Stop tmuxinator session (stops all development servers)
tmuxinator stop moodle-proctor

# Stop Docker containers
docker-compose stop

# Stop and remove Docker containers and volumes
docker-compose down -v
```

## Manual Setup (Individual Services)

If you prefer to run services individually without tmuxinator, follow the instructions below:

### 0. Docker Infrastructure (Optional)

If you want to run the databases and Moodle using Docker:

```bash
# Start all infrastructure services
docker-compose up -d postgres mariadb moodle

# Check container status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose stop

# Stop and remove volumes
docker-compose down -v
```

Services running on Docker:
- **PostgreSQL**: localhost:5432 (proctor_user/proctor_pass)
- **MariaDB**: localhost:3306 (bn_moodle/bitnami)
- **Moodle LMS**: http://localhost:8080 (admin/admin123!)
- **Backend container**: http://localhost:5000
- **AI Proctoring container**: http://localhost:8000

Note: The tmuxinator configuration uses local development servers for backend and AI proctoring (with hot reload), while running only the databases and Moodle in Docker.

### 1. Teacher dashboard (`frontend`)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

Notes:

- `/` redirects to `/login`
- the current login flow does not validate credentials

### 2. Manual proctoring desktop app (`manual_proctoring`)

Run this in two terminals.

Terminal 1:

```bash
cd manual_proctoring/backend
npm install
npm start
```

Backend runs at `http://localhost:5000`.

Terminal 2:

```bash
cd manual_proctoring
npm install
npm start
```

The Electron app will open and use the backend above.

Demo credentials:

- Email: `user`
- Password: `password`

### 3. AI proctoring service (`ai_proctoring`)

```bash
cd ai_proctoring
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

The FastAPI service starts on `http://localhost:8000`.

Notes:

- this service expects frame data over WebSocket rather than reading directly from `cv2.VideoCapture`
- most behavior is configured centrally in `ai_proctoring/config.py`
- models such as `yolov8n.pt`, `blaze_face_short_range.tflite`, and `face_landmarker.task` are already included in the folder
- report generation runs on shutdown

### 4. Mobile scanning client (`Scanning-and-Uploading/exam-system-mobile-client-main`)

```bash
cd Scanning-and-Uploading/exam-system-mobile-client-main
npm install
npm run dev
```

Open the local URL shown by Next.js in a mobile browser or device emulator.

Important:

- this app expects environment variables and AWS S3 configuration for full upload support
- some backend integration points are still marked as TODOs inside the app

## Runtime Outputs

Some projects create runtime artifacts while running:

- `manual_proctoring/backend/logs/` stores backend warning logs
- `ai_proctoring` can generate violation logs, screenshots, and PDF reports depending on configuration
- generated build artifacts such as `.next`, `node_modules`, and Python cache folders are not source files

## Current Integration State

This repository contains related parts of a larger proctoring system, but they are not fully wired together end to end yet.

- `dsc` is primarily a dashboard UI prototype
- `manual_proctoring` is a working desktop demo backed by a local Express server
- `ai_proctoring` is a standalone real-time detection service
- the mobile scanning app still needs production backend and storage integration

## Useful Entry Points

- `dsc/src/app/login/page.tsx`
- `dsc/src/app/dashboard/page.tsx`
- `manual_proctoring/main.js`
- `manual_proctoring/backend/server.js`
- `ai_proctoring/main.py`
- `ai_proctoring/config.py`
- `Scanning-and-Uploading/exam-system-mobile-client-main/src/app/page.tsx`
