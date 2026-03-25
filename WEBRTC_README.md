# WebRTC Demo Readme

## Purpose

This guide explains how to run the current local WebRTC demo in this repo.

The demo flow is:

- one browser tab acts as the student broadcaster
- one browser tab acts as the teacher monitor
- both connect through the main backend in `backend/`

## What This Demo Uses

- Backend API: `http://localhost:5000`
- Frontend app: `http://localhost:3000`
- Student demo page: `/student-demo`
- Teacher monitoring page: `/dashboard/monitoring`
- Default room: `exam-monitoring-room`

## Before You Start

Make sure these are installed and available:

- Node.js 18+
- npm
- Docker Desktop

## 1. Start Infrastructure

From the repo root:

```bash
docker-compose up -d postgres mariadb moodle
```

Notes:

- PostgreSQL is used by the main backend
- Moodle is used for login
- If Moodle fails because port `8080` is busy, free that port or change the port mapping in `docker-compose.yml`

## 2. Start The Backend

Open a terminal:

```bash
cd backend
npm install
npm run dev
```

Expected backend signs:

- MediaSoup worker initializes
- WebRTC plugin registers
- backend runs on `http://localhost:5000`

Important:

- if you change `backend/.env`, restart the backend fully
- for the local demo, MediaSoup should use `MEDIASOUP_ANNOUNCED_IP=127.0.0.1`

## 3. Start The Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:3000
```

## 4. Log In

Open:

```text
http://localhost:3000/login
```

Use a Moodle account that exists in your local Moodle instance.

Important:

- the frontend now proxies login to the main backend
- the backend sets the auth cookie used by the WebRTC routes
- if login fails, check Moodle first, then backend logs

## 5. Open The Student Broadcaster

Open this in one tab:

```text
http://localhost:3000/student-demo
```

On that page:

1. keep the room as `exam-monitoring-room`
2. enter a student name if needed
3. click `Start broadcast`
4. allow camera and microphone permissions

Expected result:

- local preview appears
- transport connects
- student starts publishing webcam and mic

## 6. Open The Teacher Monitor

Open this in another logged-in tab:

```text
http://localhost:3000/dashboard/monitoring
```

Expected result:

- teacher joins the same room
- teacher consumes available student producers
- one student video tile appears in the dashboard

## 7. Reconnect Test

To test reconnect behavior:

1. go back to `/student-demo`
2. click `Stop broadcast`
3. click `Start broadcast` again

Expected result:

- the teacher dashboard should reuse the same student slot
- it should replace the existing feed instead of creating duplicate tiles

## Troubleshooting

### Login fails

Check:

- Moodle is running on `http://localhost:8080`
- backend is running on `http://localhost:5000`
- frontend `.env.local` points to backend port `5000`

### Teacher sees `Failed to connect transport`

Check:

- backend was restarted after any `.env` changes
- `MEDIASOUP_ANNOUNCED_IP=127.0.0.1`
- both tabs are logged in
- backend logs show MediaSoup worker initialized

### Teacher sees empty dashboard

Check:

- student actually clicked `Start broadcast`
- browser camera permission was allowed
- backend logs show producer creation
- teacher and student are using the same room ID

### Moodle container does not start

If Docker says port `8080` is already allocated, free port `8080` or change the Moodle port mapping.

## Current Scope

This is a working local demo path for the current integrated WebRTC slice.

It is meant for:

- local testing
- team integration
- debugging teacher/student room flow

It is not yet a final production-ready deployment guide.
