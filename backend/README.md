# Moodle-Proctor Backend

Unified Fastify + TypeScript backend for the current repo architecture.

## Current Role In The Repo

This is the active backend service for:

- Moodle-backed authentication
- student and exam APIs
- violation recording
- teacher dashboard APIs
- server-sent events for live updates
- WebSocket proxying to the AI proctoring service
- manual proctoring compatibility for the Electron client in `manual_proctoring/`

The legacy Express backend under `manual_proctoring/backend/` is archived and should not be used for normal development.

## Status

- Active and typechecking
- Used by the Electron manual proctoring client
- Intended to be the single backend entrypoint for repo-level integration work

## Run

### 4. PostgreSQL Plugin
- **plugins/postgres.ts** - Database connection with pooling
- Health checks
- Graceful shutdown
- Query helpers

### 5. Authentication Module
- **modules/auth/moodle.service.ts** - Moodle API integration
  - Token authentication
  - User validation
  - User sync

- **modules/auth/jwt.service.ts** - JWT token management
  - Token generation/validation
  - Moodle token encryption (AES-256-GCM)
  - Token refresh

- **modules/auth/auth.service.ts** - Combined auth service
  - Login flow
  - User lookup/creation
  - Logout handling

- **modules/auth/auth.routes.ts** - Auth API endpoints
  - POST /api/auth/login
  - POST /api/auth/logout
  - GET /api/auth/me
  - POST /api/auth/validate
  - POST /api/auth/refresh

### 6. Middleware
- **middleware/auth.middleware.ts** - JWT validation
  - authMiddleware (required auth)
  - optionalAuthMiddleware (optional auth)
  - requireRole factory (role-based auth)
  - requireTeacher / requireStudent helpers

### 7. Utilities
- **types/index.ts** - TypeScript type definitions
- **utils/errors.ts** - Custom error classes

### 8. Application Structure
- **app.ts** - Fastify app configuration with all plugins
- **index.ts** - Application entry point

---

## 🚧 Pending Implementation

### Priority 1: Core Functionality ✅ COMPLETE
1. **Student Module** (`modules/student/`) ✅
   - GET /api/student - Student profile + attempt status
   - GET /api/session - Session validation
   - GET /files/:filename - Static file serving

2. **Exam Module** (`modules/exam/`) ✅
   - GET /api/exam - Exam details
   - POST /api/exam/start - Start/resume exam
   - POST /api/exam/submit - Submit exam
   - GET /api/questions - Question summary

3. **Violation Module** (`modules/violation/`) ✅
   - POST /api/exam/violations - Report violation
   - Store in PostgreSQL
   - Auto-submit at 15 warnings

### Priority 2: Security Components
4. **Security Module** (`modules/security/`)
   - **signature.service.ts** - HMAC-SHA256 signatures
   - **replay-prevention.ts** - Frame sequence tracking
   - **rate-limiter.ts** - Violation rate limiting

### Priority 3: WebSocket Integration
5. **WebSocket Proxy** (`plugins/websocket-proxy.ts`)
   - Secure connection establishment
   - Bidirectional message forwarding with signing
   - Secure violation capture & storage
   - Replay attack prevention
   - Rate limiting
   - Session tracking
   - Error handling & fail-safe

### Priority 4: Teacher Dashboard
6. **Teacher Module** (`modules/teacher/`)
   - GET /api/teacher/exams
   - GET /api/teacher/exams/:id
   - GET /api/teacher/attempts
   - GET /api/teacher/attempts/:id
   - GET /api/teacher/attempts/:id/violations
   - GET /api/teacher/students
   - GET /api/teacher/reports
   - GET /api/teacher/stats

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+
- Moodle instance (included in docker-compose)

### Setup

1. **Clone and navigate to backend**:
   ```bash
   cd /home/aryaniyaps/web-projects/moodle-proctor/backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Copy environment template**:
   ```bash
   cp .env.example .env
   ```

4. **Edit .env** with your configuration:
   ```env
   
   ``# Application
   NODE_ENV=development
   APP_VERSION=1.0.0
   APP_NAME=moodle-proctor-backend
   APP_ENVIRONMENT=development

   # Server
   PORT=5000
   HOST=0.0.0.0

   # Database
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/moodle_proctor
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_NAME=moodle_proctor
   DATABASE_USER=postgres
   DATABASE_PASSWORD=postgres

   # JWT
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRY=24h

   # CORS
   CORS_ORIGIN=http://localhost:3000,http://localhost:8080,file://
   CORS_CREDENTIALS=true

   # Moodle LMS Integration
   MOODLE_BASE_URL=http://localhost:8080
   MOODLE_SERVICE=moodle_mobile_app
   MOODLE_TOKEN_ENCRYPTION_KEY=your-encryption-key-for-moodle-tokens

   # AI Proctoring Service
   AI_SERVICE_URL=ws://localhost:8000/proctor
   AI_SERVICE_HEALTH_CHECK=http://localhost:8000/health


   # MediaSoup Worker RTC Ports
   MEDIASOUP_RTC_MIN_PORT=10000
   MEDIASOUP_RTC_MAX_PORT=20000

   # MediaSoup Network
   MEDIASOUP_LISTEN_IP=0.0.0.0
   MEDIASOUP_ANNOUNCED_IP=localhost

   # MediaSoup DTLS (optional - for self-signed certificates)
   MEDIASOUP_DTLS_CERT_FILE=
   MEDIASOUP_DTLS_KEY_FILE=

   # WebRTC Settings
   WEBRTC_MAX_BITRATE=1500000
   WEBRTC_MIN_BITRATE=500000
   WEBRTC_MAX_PEER_CONNECTIONS=15

   LOG_LEVEL=info
   LOG_FORMAT=json

   ENABLE_WEBSOCKET_PROXY=true
   ENABLE_WEBRTC_STREAMING=true
   ENABLE_SSE_UPDATES=true

   ```

5. **Start services with Docker Compose** (from project root):
   ```bash
   cd /home/aryaniyaps/web-projects/moodle-proctor
   docker-compose up -d postgres moodle
   ```

6. **Run database migrations** (when migration runner is implemented):
   ```bash
   npm run migrate:up
   ```

7. **Start development server**:
   ```bash
   npm run dev
   ```

8. **Check health endpoint**:
   ```bash
   curl http://localhost:5000/health
   ```

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── index.ts                    # ✅ Entry point
│   ├── app.ts                      # ✅ Fastify app config
│   ├── config/
│   │   ├── index.ts                # ✅ Config loader
│   │   ├── logger.ts               # ✅ Winston logger
│   │   └── ...moodle/jwt configs   # ✅ Embedded in index.ts
│   ├── plugins/
│   │   ├── postgres.ts             # ✅ Database plugin
│   │   └── websocket-proxy.ts      # 🚧 TODO
│   ├── modules/
│   │   ├── auth/                   # ✅ Complete
│   │   │   ├── auth.service.ts
│   │   │   ├── moodle.service.ts
│   │   │   ├── jwt.service.ts
│   │   │   └── auth.routes.ts
│   │   ├── student/                # ✅ COMPLETE
│   │   ├── exam/                   # ✅ COMPLETE
│   │   ├── violation/              # ✅ COMPLETE
│   │   ├── teacher/                # 🚧 TODO
│   │   └── security/               # 🚧 TODO
│   ├── middleware/
│   │   ├── auth.middleware.ts      # ✅ Complete
│   │   └── error.handler.ts        # 🚧 TODO (in app.ts)
│   ├── db/
│   │   └── migrations/
│   │       ├── 001_initial_schema.sql    # ✅ Complete
│   │       ├── 002_add_indexes.sql        # ✅ Complete
│   │       └── 003_security_fields.sql    # ✅ Complete
│   ├── types/
│   │   └── index.ts                # ✅ Complete
│   └── utils/
│       ├── logger.ts               # ✅ In config/logger.ts
│       └── errors.ts               # ✅ Complete
├── db/
│   └── init/                       # Docker init scripts
├── logs/                           # Application logs
├── uploads/                        # File uploads
├── .env.example                    # ✅ Complete
├── Dockerfile                      # ✅ Complete
├── tsconfig.json                   # ✅ Complete
├── package.json                    # ✅ Complete
└── README.md                       # This file
```

---

## 🔐 Security Features Implemented

- ✅ JWT-based authentication
- ✅ Moodle token encryption (AES-256-GCM)
- ✅ Role-based access control (student/teacher)
- ✅ Database security fields (integrity_hash, ai_signature)
- ✅ Audit logging schema
- ✅ Unique constraints to prevent duplicate violations
- 🚧 Message signing (HMAC-SHA256) - TODO
- 🚧 Replay attack prevention - TODO
- 🚧 Rate limiting - TODO

---

## 📝 API Endpoints

### Authentication (Implemented ✅)
```
POST   /api/auth/login          # Login with Moodle credentials
POST   /api/auth/logout         # Logout
GET    /api/auth/me             # Get current user
POST   /api/auth/validate       # Validate token
POST   /api/auth/refresh        # Refresh token
```

### Health Check (Implemented ✅)
```
GET    /health                   # Health status
```

### Student ✅
```
GET /api/student
GET /api/session
GET /files/:filename
```

### Exam ✅
```
GET /api/exam
POST /api/exam/start
POST /api/exam/submit
GET /api/exam/:id/questions
```

### Violations ✅
```
POST /api/exam/violations
```

### Teacher Dashboard (TODO 🚧)
```
GET    /api/teacher/exams       # List exams
GET    /api/teacher/attempts    # List attempts
GET    /api/teacher/reports     # Generate reports
GET    /api/teacher/stats       # Dashboard stats
```

### WebSocket (TODO 🚧)
```
WS     /ws/proctor              # AI service proxy
```

---

## 🧪 Testing

When implemented:
```bash
cd backend
npm install
npm run dev
```

Default local URL: `http://localhost:5000`

Health check:

```bash
curl http://localhost:5000/health
```

## Core Scripts

```bash
npm run dev
npm run build
npm start
npm run migrate
npm run migrate:status
npm run seed
npm run seed:clear
npm test
```

## Active Backend Modules

- `src/modules/auth/`
- `src/modules/student/`
- `src/modules/exam/`
- `src/modules/violation/`
- `src/modules/teacher/`
- `src/modules/manual-proctoring/`
- `src/modules/security/`
- `src/plugins/websocket-proxy.ts`

## API Surface At A Glance

Authentication:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/validate`
- `POST /api/auth/refresh`

Student/manual client:

- `GET /api/student`
- `GET /api/session`
- `GET /api/exam`
- `GET /api/questions`
- `POST /api/exam/start`
- `POST /api/exam/submit`
- `POST /api/exam/violations`
- `GET /files/:filename`

Teacher/dashboard:

- `GET /api/teacher/exams`
- `GET /api/teacher/exams/:id`
- `GET /api/teacher/attempts`
- `GET /api/teacher/attempts/:id`
- `GET /api/teacher/attempts/:id/violations`
- `GET /api/teacher/students`
- `GET /api/teacher/reports`
- `GET /api/teacher/stats`
- `GET /api/teacher/events`

Real-time:

- `WS /ws/proctor`

## Integration Notes

- `manual_proctoring/` uses this backend at `http://localhost:5000`.
- The manual client identifies itself with the `X-Manual-Proctoring-Client` header.
- AI proctoring runs separately in `ai_proctoring/` and is reached through the backend WebSocket proxy.

## Known Limitations

- Some auth and role-handling paths are still prototype-grade.
- Teacher/dashboard and frontend integration are present, but the wider product is not fully production-hardened.
- The repo still contains historical docs written before the manual backend migration and archive cleanup.
