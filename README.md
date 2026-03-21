# proctor-media-server

Live video streaming module for the exam proctoring system.
Built with mediasoup v3 + Socket.IO.

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the example env file and fill in your values
cp .env.example .env
```

---

## Environment variables

| Variable                  | Default                    | Required in prod | Description                                         |
|---------------------------|----------------------------|------------------|-----------------------------------------------------|
| `MEDIASOUP_LISTEN_IP`     | `127.0.0.1`                | No               | IP the mediasoup worker binds to                    |
| `MEDIASOUP_ANNOUNCED_IP`  | _(empty)_                  | **Yes**          | Public IP announced to WebRTC clients               |
| `REDIS_URL`               | `redis://localhost:6379`   | No               | Redis connection URL (used for room/session state)  |
| `PORT`                    | `4000`                     | No               | HTTP / Socket.IO listening port                     |
| `NODE_ENV`                | `development`              | No               | `development` or `production`                       |

> **Note:** If `NODE_ENV=production` and `MEDIASOUP_ANNOUNCED_IP` is not set, the server will throw an error on startup.

---

## Running locally

```bash
# Start in watch mode (auto-restarts on file changes)
npm run dev

# Start normally
npm start
```

The server will log:

```
proctor-media-server starting on port 4000
```

---

## Running load test

```bash
npm run loadtest
```

The load test script lives at `test/loadTest.js` and simulates concurrent WebRTC connections to stress-test the mediasoup workers.
