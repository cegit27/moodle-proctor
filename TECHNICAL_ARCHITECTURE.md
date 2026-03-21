# Moodle-Proctor Technical Architecture

## System Overview

The Moodle-Proctor system is a comprehensive online examination proctoring platform that integrates with Moodle Learning Management System (LMS) for authentication and course management, while providing AI-powered monitoring and unified backend services.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Moodle-Proctor System                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────┐      ┌──────────────────┐      ┌──────────────┐     │
│  │   Next.js    │      │   Fastify        │      │  Electron    │     │
│  │  Frontend    │◄────►│   Backend        │◄────►│   Desktop    │     │
│  │  (Teacher)   │      │   (Unified)      │      │  (Student)   │     │
│  └──────────────┘      └────────┬─────────┘      └──────────────┘     │
│                                 │                                       │
│                         ┌───────┴────────┐                              │
│                         │  PostgreSQL    │                              │
│                         │  Database      │                              │
│                         └───────┬────────┘                              │
│                                 │                                       │
│  ┌──────────────┐      ┌────────┴────────┐      ┌──────────────┐     │
│  │   Moodle     │      │   WebSocket     │      │   AI         │     │
│  │   LMS        │      │   Proxy         │      │   Proctoring │     │
│  │  (Bitnami)   │      │                 │      │  (Python)    │     │
│  └──────────────┘      └─────────────────┘      └──────────────┘     │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend
- **Framework**: Fastify 4.x (High-performance Node.js web framework)
- **Language**: TypeScript 5.x
- **Database**: PostgreSQL 15
- **Authentication**: JWT (JSON Web Tokens)
- **WebSocket**: @fastify/websocket + ws
- **ORM**: pg (node-postgres) with raw SQL

### Frontend
- **Framework**: Next.js 14 (React 18)
- **Language**: TypeScript
- **Styling**: Tailwind CSS

### Desktop Client
- **Framework**: Electron
- **Frontend**: HTML/CSS/JavaScript

### AI Proctoring
- **Framework**: FastAPI (Python)
- **Computer Vision**: OpenCV, MediaPipe, YOLOv8

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **LMS**: Moodle 4.x (Bitnami image)
- **Database**: MariaDB (for Moodle), PostgreSQL (for proctoring data)

---

## Architecture Components

### 1. Unified Backend (Fastify)

**Location**: `/backend/`
**Port**: 5000
**Responsibilities**:
- Centralized authentication via Moodle
- REST API for teacher dashboard and student desktop client
- WebSocket proxy to AI proctoring service
- Proctoring data persistence (PostgreSQL)
- Session and violation management

**Key Modules**:
```
backend/
├── src/
│   ├── index.ts                    # Entry point
│   ├── app.ts                      # Fastify app configuration
│   ├── config/                     # Configuration modules
│   ├── plugins/                    # Fastify plugins
│   │   ├── postgres.ts             # Database connection
│   │   ├── websocket-proxy.ts      # AI service proxy
│   │   └── auth.ts                 # JWT authentication
│   ├── modules/                    # Business logic
│   │   ├── auth/                   # Authentication
│   │   ├── student/                # Student operations
│   │   ├── exam/                   # Exam management
│   │   ├── violation/              # Violation tracking
│   │   └── teacher/                # Teacher dashboard
│   ├── middleware/                 # Auth, error handling
│   ├── db/                         # Migrations, queries
│   └── types/                      # TypeScript definitions
```

---

### 2. Frontend Dashboard (Next.js)

**Location**: `/frontend/`
**Port**: 3000
**Responsibilities**:
- Teacher interface for monitoring exams
- Student management
- Violation reports and analytics
- Exam configuration

**Key Pages**:
- `/login` - Teacher login (redirected to backend auth)
- `/dashboard` - Main dashboard
- `/dashboard/students` - Student management
- `/dashboard/monitoring` - Live exam monitoring
- `/dashboard/alerts` - Violation alerts
- `/dashboard/reports` - Proctoring reports

---

### 3. Desktop Client (Electron)

**Location**: `/manual_proctoring/`
**Responsibilities**:
- Student exam interface
- Camera capture and streaming
- Fullscreen/kiosk mode enforcement
- Process monitoring (blocks prohibited apps)
- AI-powered violation detection display

**Communication**:
- REST API: `http://localhost:5000` (Unified backend)
- WebSocket: `ws://localhost:5000/ws/proctor` (Proxied to AI service)

---

### 4. AI Proctoring Service (Python/FastAPI)

**Location**: `/ai_proctoring/`
**Port**: 8000
**Responsibilities**:
- Real-time video frame analysis
- Multiple violation detection types:
  - Face detection (absent, multiple faces)
  - Gaze tracking (looking away)
  - Phone detection
  - Object detection
  - Identity verification
  - Lighting conditions
  - Background motion
  - Lip movement (talking)

**Detection Modules**:
```
ai_proctoring/
├── main.py                          # FastAPI entry point
├── face_monitor.py                  # Face detection
├── gaze_tracking.py                 # Gaze tracking
├── phone_detection.py               # Phone detection
├── object_detection.py              # Object detection (YOLO)
├── identity_verifier.py             # Identity verification
├── audio_monitor.py                 # Audio detection
├── tab_monitor.py                   # Tab switching detection
└── report_generator.py              # PDF report generation
```

**WebSocket Endpoint**: `ws://localhost:8000/proctor`

---

### 5. Moodle Integration

**Managed by**: Root docker-compose.yml
**Port**: 8080 (HTTP), 8443 (HTTPS)
**Image**: bitnamilegacy/moodle
**Database**: MariaDB

**Integration Points**:
1. **Authentication**: Moodle web service API
   - Endpoint: `/login/token.php`
   - Function: `core_webservice_get_site_info`

2. **Course Data**: Moodle REST API
   - User courses: `core_enrol_get_users_courses`
   - Course content: `core_course_get_contents`
   - Quiz data: `mod_quiz_get_quizzes_by_courses`

3. **External Service**: `moodle_mobile_app`
   - Pre-configured in Moodle
   - Allows token-based authentication

---

## Database Schema

### PostgreSQL Database: `moodle_proctor`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              users                                      │
├─────────────────────────────────────────────────────────────────────────┤
│ id (PK) │ moodle_user_id │ username │ email │ role │ last_login_at    │
├─────────────────────────────────────────────────────────────────────────┤
│                              exams                                       │
├─────────────────────────────────────────────────────────────────────────┤
│ id (PK) │ moodle_course_id │ exam_name │ duration │ question_paper_path│
├─────────────────────────────────────────────────────────────────────────┤
│                           exam_attempts                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ id (PK) │ user_id │ exam_id │ status │ started_at │ violation_count    │
├─────────────────────────────────────────────────────────────────────────┤
│                             violations                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ id (PK) │ attempt_id │ violation_type │ severity │ occurred_at         │
├─────────────────────────────────────────────────────────────────────────┤
│                        proctoring_sessions                              │
├─────────────────────────────────────────────────────────────────────────┤
│ id (PK) │ attempt_id │ frames_processed │ session_start │ session_end  │
├─────────────────────────────────────────────────────────────────────────┤
│                             audit_logs                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ id (PK) │ user_id │ action │ resource_type │ resource_id │ created_at  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Entity Relationships

```
users (1) ────< (N) exam_attempts >─── (1) exams
                    │
                    │ (1)
                    │
                    v
              (N) violations

exam_attempts (1) ────< (N) proctoring_sessions

users (1) ────< (N) audit_logs
```

---

## API Endpoint Architecture

### Base URL: `http://localhost:5000`

### Authentication Endpoints

```
POST   /api/auth/login          # Login with Moodle credentials
POST   /api/auth/logout         # Logout & invalidate token
GET    /api/auth/me             # Get current user info
GET    /api/auth/validate       # Validate JWT token
```

### Student Endpoints (Desktop Client)

```
GET    /api/student             # Get student profile & exam attempt
GET    /api/session             # Validate session (backward compat)
GET    /api/exam                # Get exam details & configuration
POST   /api/exam/start          # Start/resume exam attempt
POST   /api/exam/violations     # Report a violation
POST   /api/exam/submit         # Submit exam
GET    /api/questions           # Get question summary (optional)
GET    /files/:filename         # Static file serving (PDFs)
```

### Teacher Endpoints (Dashboard)

```
GET    /api/teacher/exams       # List all exams (from Moodle)
GET    /api/teacher/exams/:id   # Get exam details
GET    /api/teacher/attempts    # List all exam attempts
GET    /api/teacher/attempts/:id              # Get attempt details
GET    /api/teacher/attempts/:id/violations   # Get violations for attempt
GET    /api/teacher/students    # List all students
GET    /api/teacher/reports     # Generate proctoring reports
GET    /api/teacher/stats       # Dashboard statistics
```

### WebSocket Endpoint

```
WS     /ws/proctor              # Proxy to AI service
                               # (ws://ai-proctoring:8000/proctor)
```

---

## Authentication Flow

### Student Login (Desktop Client)

```
┌─────────┐          ┌─────────┐          ┌─────────┐          ┌─────────┐
│ Desktop │          │ Backend │          │ Moodle  │          │ Postgres│
└────┬────┘          └────┬────┘          └────┬────┘          └────┬────┘
     │                    │                    │                    │
     │ POST /api/login    │                    │                    │
     │────────────────────>│ POST /login/token.php               │
     │                    │                    │                    │
     │                    │────────────────────>│                    │
     │                    │<────────────────────┤                    │
     │                    │                    │                    │
     │                    │  GET site_info     │                    │
     │                    │────────────────────>│                    │
     │                    │<────────────────────┤                    │
     │                    │                    │                    │
     │                    │  Sync user to DB   │                    │
     │                    │────────────────────────────────────────>│
     │                    │<────────────────────────────────────────┤
     │                    │                    │                    │
     │  JWT Token         │                    │                    │
     │<────────────────────┤                    │                    │
     │                    │                    │                    │
```

### Token Structure

```typescript
{
  userId: 1,                    // PostgreSQL user ID
  moodleUserId: 123,            // Moodle user ID
  username: "student1",
  email: "student@example.com",
  role: "student",              // "student" | "teacher"
  moodleToken: "abc123...",     // Encrypted Moodle token
  iat: 1234567890,              // Issued at
  exp: 1234571490               // Expires at (1 hour)
}
```

---

## Secure Real-Time Violation Coordination

The AI service, desktop client, and backend work together in a secure, coordinated manner to detect, validate, and store violations in real-time. This architecture ensures data integrity, prevents tampering, and maintains an audit trail.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Secure Violation Coordination Flow                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐       │
│  │   Desktop    │         │   Backend    │         │   AI Service │       │
│  │   Client     │         │  (Fastify)   │         │  (FastAPI)   │       │
│  │              │         │              │         │              │       │
│  │ - Capture    │         │ - Validate   │         │ - Detect     │       │
│  │   frames     │─────────>│   JWT        │─────────>│ violations   │       │
│  │ - Display    │         │ - Sign       │         │ - Analyze    │       │
│  │   alerts     │<─────────│   messages   │<─────────│   frames     │       │
│  │ - Forward    │         │ - Store to   │         │ - Sign       │       │
│  │   to backend │         │   PostgreSQL │         │   results    │       │
│  └──────────────┘         └──────┬───────┘         └──────────────┘       │
│                                   │                                        │
│                                   v                                        │
│                         ┌──────────────────┐                              │
│                         │   PostgreSQL     │                              │
│                         │   - violations   │                              │
│                         │   - audit_logs   │                              │
│                         └──────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Security Layers

1. **Authentication Layer**: JWT validation on WebSocket connection
2. **Message Signing Layer**: HMAC-SHA256 signatures for all violation messages
3. **Validation Layer**: Backend validates attempt state and user permissions
4. **Audit Layer**: All violations logged with cryptographic hashes
5. **Transport Layer**: TLS/WSS encryption for all WebSocket communications

---

### Detailed Violation Flow

#### Phase 1: Secure Connection Establishment

```
┌──────────────┐                    ┌──────────────┐                    ┌──────────────┐
│   Desktop    │                    │   Backend    │                    │   AI Service │
│   Client     │                    │  (Fastify)   │                    │  (FastAPI)   │
└──────┬───────┘                    └──────┬───────┘                    └──────┬───────┘
       │                                  │                                  │
       │ 1. WebSocket Connect Request     │                                  │
       │    URL: ws://localhost:5000/ws/proctor                              │
       │    Query: ?attemptId=42&token=<JWT>                                 │
       │─────────────────────────────────>│                                  │
       │                                  │                                  │
       │ 2. Validate JWT                  │                                  │
       │    - Extract userId              │                                  │
       │    - Verify attempt exists       │                                  │
       │    - Check attempt is in_progress│                                  │
       │<─────────────────────────────────┤                                  │
       │                                  │                                  │
       │ 3. Generate Session Signature    │                                  │
       │    - Create session ID           │                                  │
       │    - Generate signing key        │                                  │
       │    - Store in proctoring_sessions│                                  │
       │<─────────────────────────────────┤                                  │
       │                                  │                                  │
       │ 4. Connect to AI Service         │  5. Proxy Connection             │
       │    (no direct client access)     │─────────────────────────────────>│
       │                                  │                                  │
```

**WebSocket Connection Request Format**:
```typescript
// Client → Backend
{
  type: "connection",
  attemptId: 42,
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  timestamp: 1234567890,
  nonce: "random-string-to-prevent-replay"
}

// Backend → AI Service
{
  type: "connection",
  sessionId: "sess_abc123",
  attemptId: 42,
  userId: 5,
  signingKey: "hk_<key>",
  timestamp: 1234567890
}
```

#### Phase 2: Frame Processing & Violation Detection

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Desktop    │         │   Backend    │         │   AI Service │
│   Client     │         │  (Fastify)   │         │  (FastAPI)   │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                         │                         │
       │ 1. Capture Frame         │                         │
       │    (JPEG, 5 FPS)         │                         │
       │                         │                         │
       │ 2. Sign Frame            │                         │
       │    - HMAC with session   │                         │
       │      signing key         │                         │
       │                         │                         │
       │ 3. Send to Backend       │                         │
       │─────────────────────────>│                         │
       │                         │ 4. Validate Signature    │
       │                         │ 5. Forward to AI         │
       │                         │─────────────────────────>│
       │                         │                         │
       │                         │                         │ 6. Analyze Frame
       │                         │                         │    - Face detection
       │                         │                         │    - Gaze tracking
       │                         │                         │    - Object detection
       │                         │                         │
       │                         │                         │ 7. Detect Violation?
       │                         │                         │    (Yes/No)
```

**Frame Message Format** (Client → Backend → AI Service):
```json
{
  "type": "frame",
  "sessionId": "sess_abc123",
  "attemptId": 42,
  "frameData": "base64_encoded_jpeg_image",
  "timestamp": 1234567890,
  "sequence": 45,
  "signature": "hmac_sha256_signature"
}
```

**Signature Validation** (Backend):
```typescript
// Verify frame was sent by authenticated client
const expectedSignature = hmacsha256(session.signingKey, frameData + timestamp);
if (signature !== expectedSignature) {
  throw new Error('Frame signature invalid - possible tampering');
}
```

#### Phase 3: Violation Reporting & Secure Storage

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Desktop    │         │   Backend    │         │   AI Service │
│   Client     │         │  (Fastify)   │         │  (FastAPI)   │
└──────┬───────┘         └──────┬───────┘         └──────┬───────┘
       │                         │<────────────────────────┤
       │                         │ 8. Violation Detected   │
       │                         │                         │
       │                         │ 9. Sign Violation       │
       │                         │    (AI Service Signs)   │
       │                         │<────────────────────────┤
       │                         │                         │
       │ 10. Forward to Client   │                         │
       │    (for display)        │                         │
       │<─────────────────────────┤                         │
       │                         │                         │
       │ 11. Display Alert        │                         │
       │     to Student          │                         │
       │                         │                         │
       │                         │ 12. Validate & Store    │
       │                         │    to PostgreSQL        │
       │                         │    (Backend does this)  │
       │                         │───────────────────────>│
       │                         │                         │
       │                         │ 13. Update Attempt      │
       │                         │    violation_count      │
       │                         │───────────────────────>│
```

**Violation Message Format** (AI Service → Backend → Client):
```json
{
  "type": "violation",
  "sessionId": "sess_abc123",
  "attemptId": 42,
  "violations": [
    {
      "violationType": "face_absent",
      "severity": "warning",
      "detail": "No face detected in frame",
      "confidence": 0.95,
      "timestamp": 1234567890,
      "frameSequence": 45
    }
  ],
  "aiMetadata": {
    "model": "blaze_face_short_range",
    "fps": 5,
    "processingTime": 120
  },
  "signature": "hmac_sha256_from_ai_service"
}
```

**Backend Validation & Storage**:
```typescript
async function handleViolationFromAI(message: ViolationMessage) {
  // 1. Verify AI service signature
  const aiSignatureValid = verifyAIServiceSignature(message);
  if (!aiSignatureValid) {
    logSecurityEvent('AI signature invalid', message);
    return;
  }

  // 2. Verify attempt exists and is in progress
  const attempt = await db.query(
    'SELECT * FROM exam_attempts WHERE id = $1 AND status = $2',
    [message.attemptId, 'in_progress']
  );

  if (!attempt.rows[0]) {
    logSecurityEvent('Invalid attempt for violation', message);
    return;
  }

  // 3. Store violation with cryptographic hash for integrity
  const violationHash = crypto.createHash('sha256')
    .update(JSON.stringify(message))
    .digest('hex');

  await db.transaction(async (trx) => {
    // Store violation
    await trx.query(
      `INSERT INTO violations
       (attempt_id, violation_type, severity, detail, metadata, integrity_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        message.attemptId,
        message.violations[0].violationType,
        message.violations[0].severity,
        message.violations[0].detail,
        JSON.stringify(message),
        violationHash
      ]
    );

    // Update attempt violation count
    await trx.query(
      `UPDATE exam_attempts
       SET violation_count = violation_count + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [message.violations.length, message.attemptId]
    );

    // Log to audit trail
    await trx.query(
      `INSERT INTO audit_logs
       (user_id, action, resource_type, resource_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        attempt.rows[0].user_id,
        'violation_detected',
        'exam_attempt',
        message.attemptId,
        JSON.stringify({
          violationType: message.violations[0].violationType,
          timestamp: message.violations[0].timestamp,
          hash: violationHash
        })
      ]
    );
  });

  // 4. Check if threshold reached
  const updatedAttempt = await db.query(
    'SELECT violation_count FROM exam_attempts WHERE id = $1',
    [message.attemptId]
  );

  if (updatedAttempt.rows[0].violation_count >= 15) {
    await autoSubmitExam(message.attemptId, 'warning_limit_reached');
  }
}
```

---

### Message Signing & Integrity

#### Three-Way Signature Chain

1. **Client → Backend**: Frame signed with session signing key
2. **Backend → AI Service**: Frame signed with backend-AI shared secret
3. **AI Service → Backend**: Violation signed with AI service private key
4. **Backend → PostgreSQL**: Violation stored with SHA-256 hash

#### Signature Algorithms

```typescript
// Client Frame Signature (HMAC-SHA256)
function signFrame(frameData: string, timestamp: number, signingKey: string): string {
  const payload = `${frameData}:${timestamp}`;
  return crypto.createHmac('sha256', signingKey).update(payload).digest('hex');
}

// AI Service Violation Signature (HMAC-SHA256)
function signViolation(violation: ViolationData, aiPrivateKey: string): string {
  const payload = JSON.stringify({
    type: violation.violationType,
    severity: violation.severity,
    timestamp: violation.timestamp,
    attemptId: violation.attemptId
  });
  return crypto.createHmac('sha256', aiPrivateKey).update(payload).digest('hex');
}

// Backend Integrity Hash (SHA-256)
function createIntegrityHash(message: any): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify(message))
    .digest('hex');
}
```

---

### Coordination Security Measures

#### 1. Attempt State Validation

```typescript
// Before processing any violation, backend validates:
async function validateAttemptForViolation(attemptId: number, userId: number) {
  const attempt = await db.query(
    `SELECT status, started_at, submitted_at
     FROM exam_attempts
     WHERE id = $1 AND user_id = $2`,
    [attemptId, userId]
  );

  if (!attempt.rows[0]) {
    throw new SecurityError('Attempt does not exist');
  }

  if (attempt.rows[0].status !== 'in_progress') {
    throw new SecurityError('Attempt is not in progress');
  }

  // Check time window (prevent stale violations)
  const timeSinceStart = Date.now() - attempt.rows[0].started_at;
  const maxExamDuration = 4 * 60 * 60 * 1000; // 4 hours
  if (timeSinceStart > maxExamDuration) {
    throw new SecurityError('Attempt time window exceeded');
  }

  return true;
}
```

#### 2. Replay Attack Prevention

```typescript
// Track processed frame sequences to prevent replay attacks
const processedFrames = new Map<string, Set<number>>();

async function checkReplayAttack(sessionId: string, frameSequence: number) {
  if (!processedFrames.has(sessionId)) {
    processedFrames.set(sessionId, new Set());
  }

  const sessionFrames = processedFrames.get(sessionId);

  if (sessionFrames.has(frameSequence)) {
    logSecurityEvent('Replay attack detected', { sessionId, frameSequence });
    throw new SecurityError('Frame sequence already processed');
  }

  sessionFrames.add(frameSequence);

  // Clean up old sequences (keep last 1000)
  if (sessionFrames.size > 1000) {
    const oldest = Math.min(...sessionFrames);
    sessionFrames.delete(oldest);
  }
}
```

#### 3. Rate Limiting

```typescript
// Limit violations per minute to prevent spam
const violationRateLimiter = new Map<string, number[]>();

async function checkViolationRate(attemptId: number) {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  if (!violationRateLimiter.has(attemptId)) {
    violationRateLimiter.set(attemptId, []);
  }

  const violations = violationRateLimiter.get(attemptId);
  const recentViolations = violations.filter(t => t > oneMinuteAgo);

  if (recentViolations.length > 60) {
    logSecurityEvent('Violation rate limit exceeded', { attemptId, count: recentViolations.length });
    throw new SecurityError('Violation rate limit exceeded');
  }

  recentViolations.push(now);
  violationRateLimiter.set(attemptId, recentViolations);
}
```

#### 4. Audit Trail Logging

```sql
-- Every violation is logged with full context
INSERT INTO audit_logs (
  user_id,
  action,
  resource_type,
  resource_id,
  details,
  ip_address,
  created_at
) VALUES (
  $1,                    -- user_id
  'violation_detected',  -- action
  'exam_attempt',        -- resource_type
  $2,                    -- attempt_id
  $3,                    -- JSON details with violation info, hash, timestamp
  $4,                    -- client IP (from WebSocket connection)
  NOW()
);

-- Audit log entry includes:
-- {
--   violationType: "face_absent",
--   severity: "warning",
--   timestamp: 1234567890,
--   integrityHash: "abc123...",
--   aiModel: "blaze_face_short_range",
--   confidence: 0.95,
--   sessionId: "sess_abc123"
-- }
```

---

### Database Schema Updates for Security

```sql
-- Add integrity tracking to violations table
ALTER TABLE violations ADD COLUMN integrity_hash TEXT NOT NULL;
ALTER TABLE violations ADD COLUMN ai_signature TEXT;
ALTER TABLE violations ADD COLUMN client_ip INET;
ALTER TABLE violations ADD COLUMN session_id TEXT;

-- Add indexes for security queries
CREATE INDEX idx_violations_integrity_hash ON violations(integrity_hash);
CREATE INDEX idx_violations_session_id ON violations(session_id);

-- Create constraint to prevent duplicate violations
-- (same attempt, type, and timestamp)
CREATE UNIQUE INDEX idx_violations_unique_event
ON violations (attempt_id, violation_type, occurred_at)
WHERE integrity_hash IS NOT NULL;
```

---

### Error Handling & Fail-Safe

```typescript
// If AI service is unavailable, gracefully degrade
async function handleAIServiceFailure(error: Error) {
  logError('AI service unavailable', error);

  // Notify client to continue exam (don't penalize)
  broadcastToClients({
    type: 'system_alert',
    message: 'AI proctoring service temporarily unavailable. Exam continues.',
    severity: 'info'
  });

  // Log to audit trail
  await db.query(
    `INSERT INTO audit_logs (action, details, created_at)
     VALUES ('ai_service_unavailable', $1, NOW())`,
    [error.message]
  );
}
```

---

### Summary: Secure Coordination

1. **Three-way authentication**: Client JWT, Backend-AI shared secret, AI signatures
2. **Message signing**: Every message signed with HMAC-SHA256
3. **Integrity verification**: SHA-256 hashes stored in database
4. **Replay prevention**: Frame sequence tracking
5. **Rate limiting**: Prevent violation spam
6. **Audit trail**: All violations logged with cryptographic proofs
7. **Fail-safe**: Graceful degradation if AI service unavailable
8. **Real-time storage**: Violations stored immediately upon detection
9. **State validation**: Attempt state checked before accepting violations
10. **Non-repudiation**: Cryptographic signatures prevent denial of violations

---

## Docker Compose Architecture

### Service Configuration

**File**: `/docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:15-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: proctor_user
      POSTGRES_PASSWORD: proctor_pass
      POSTGRES_DB: moodle_proctor
    volumes: [postgres_data:/var/lib/postgresql/data]

  mariadb:
    image: bitnamilegacy/mariadb:latest
    environment:
      MARIADB_USER: bn_moodle
      MARIADB_PASSWORD: bitnami
      MARIADB_DATABASE: bitnami_moodle
    volumes: [mariadb_data:/bitnami/mariadb]

  moodle:
    image: bitnamilegacy/moodle:latest
    depends_on: [mariadb]
    ports: ["8080:8080", "8443:8443"]
    volumes: [moodle_data:/bitnami/moodle, moodledata_data:/bitnami/moodledata]

  backend:
    build: ./backend
    depends_on: [postgres, moodle]
    ports: ["5000:5000"]
    environment:
      DATABASE_URL: postgresql://proctor_user:proctor_pass@postgres:5432/moodle_proctor
      MOODLE_BASE_URL: http://moodle:8080
      AI_SERVICE_URL: ws://ai-proctoring:8000/proctor

  ai-proctoring:
    build: ./ai_proctoring
    ports: ["8000:8000"]
    volumes: [./ai_proctoring:/app]

networks:
  proctor-network:
    driver: bridge
```

### Network Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   proctor-network (bridge)                    │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │postgres  │  │mariadb   │  │moodle    │  │backend   │    │
│  │:5432     │  │          │  │:8080     │  │:5000     │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                   │           │
│                                         ┌─────────┴───────┐  │
│                                         │ ai-proctoring   │  │
│                                         │ :8000           │  │
│                                         └─────────────────┘  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Exam Attempt Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                      Exam Attempt States                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  not_started ──> in_progress ──> submitted                       │
│                      │                                            │
│                      v                                            │
│                 terminated                                       │
│                  (15 warnings)                                    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### State Transitions

1. **not_started**: Initial state, student logged in
2. **in_progress**: Student clicks "Start Exam"
3. **submitted**: Student submits exam OR 15 warnings reached
4. **terminated**: System terminates (time limit, critical violation)

### Violation Tracking

```
Violation Detected
       │
       v
┌──────────────────┐
│ Store to DB      │
│ (violations)     │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Increment count  │
│ (exam_attempts)  │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│ Check threshold  │
│ (count >= 15?)   │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
   No        Yes
    │         │
    │         v
    │   ┌──────────────┐
    │   │ Auto-submit  │
    │   │ exam         │
    │   └──────────────┘
    │
    v
Continue monitoring
```

---

## Security Architecture

### Authentication Layers

1. **Moodle Authentication**: Primary identity provider
   - Username/password validated against Moodle
   - Returns Moodle web service token

2. **JWT Token**: Backend API authentication
   - Signed with JWT_SECRET
   - 1-hour expiration
   - Contains user role and Moodle token

3. **Bearer Token**: Desktop client authentication
   - Stored in localStorage
   - Sent in Authorization header

4. **HttpOnly Cookie**: Frontend dashboard authentication
   - Stored securely by browser
   - Protected from XSS

### Authorization

```
┌─────────────────────────────────────────────────────────────┐
│                     Role-Based Access                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Student Role:                                               │
│  - Login with Moodle credentials                            │
│  - Start/resume exam attempts                               │
│  - Submit violations                                        │
│  - Submit exam                                              │
│                                                              │
│  Teacher Role:                                              │
│  - Login with Moodle credentials                            │
│  - View all exams and students                              │
│  - Monitor active attempts                                  │
│  - View violation reports                                   │
│  - Generate proctoring reports                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### CORS Configuration

**Development**:
```
Origin: http://localhost:3000 (Next.js frontend)
Credentials: true (allow cookies)
```

**Production**:
```
Origin: https://dashboard.example.com
Credentials: true
```

---

## Performance Considerations

### Database Optimization

1. **Connection Pooling**
   - Min: 2 connections
   - Max: 10 connections

2. **Indexes**
   - `idx_users_moodle_id` - User lookups
   - `idx_exam_attempts_user_id` - Student attempts
   - `idx_violations_attempt_id` - Violation queries
   - `idx_violations_occurred_at` - Time-based filtering

3. **Query Optimization**
   - Prepared statements for all queries
   - JOIN queries for related data
   - Pagination for large result sets

### WebSocket Optimization

1. **Connection Limits**
   - Max concurrent connections: 100 (configurable)
   - Connection timeout: 30 seconds

2. **Frame Rate**
   - Target: 5 FPS (200ms intervals)
   - Adjustable based on network conditions

3. **Reconnection Strategy**
   - Exponential backoff: 1s, 2s, 4s, 8s, 15s, 30s
   - Max retry attempts: 10

### Caching Strategy

1. **Moodle API Responses**
   - Cache user info: 5 minutes
   - Cache exam list: 10 minutes

2. **Static Content**
   - Question papers: Cache until modified
   - Profile images: Cache 1 hour

---

## Monitoring & Logging

### Application Logs

**Location**: `/backend/logs/`

**Log Levels**:
- `error`: Critical errors requiring immediate attention
- `warn`: Warning conditions (violations, API failures)
- `info`: General information (login, exam start/submit)
- `debug`: Detailed debugging information

### Audit Trail

All important events logged to `audit_logs` table:
- User login/logout
- Exam attempts (start, submit, terminate)
- Violations reported
- System errors

### Health Checks

**Endpoint**: `GET /health`

Returns:
```json
{
  "status": "ok",
  "database": "connected",
  "moodle": "reachable",
  "ai_service": "connected",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## Deployment Architecture

### Development Environment

```
Local machine (localhost)
├── Frontend:   http://localhost:3000
├── Backend:    http://localhost:5000
├── Moodle:     http://localhost:8080
├── AI Service: http://localhost:8000
└── PostgreSQL: localhost:5432
```

### Production Environment (Recommended)

```
┌─────────────────────────────────────────────────────────────┐
│                     Production Server                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Nginx      │  │  PostgreSQL  │  │   Moodle     │     │
│  │  (Reverse    │──│  (Database)  │  │   (LMS)      │     │
│  │   Proxy)     │  │              │  │              │     │
│  └──────┬───────┘  └──────────────┘  └──────────────┘     │
│         │                                                      │
│    ┌────┴────────────────────────────────┐                    │
│    │                                     │                    │
│    v                                     v                    │
│  ┌──────────────┐              ┌──────────────┐             │
│  │   Backend    │              │  AI Service  │             │
│  │   (Fastify)  │              │  (FastAPI)   │             │
│  └──────────────┘              └──────────────┘             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Scaling Considerations

1. **Horizontal Scaling**:
   - Multiple backend instances behind load balancer
   - Shared PostgreSQL database
   - Session state in database (not in-memory)

2. **WebSocket Scaling**:
   - Redis pub/sub for WebSocket message broadcasting
   - Sticky sessions for WebSocket connections

3. **Database Scaling**:
   - Read replicas for analytics queries
   - Connection pooling (PgBouncer)

---

## Environment Configuration

### Required Environment Variables

**Backend** (`/backend/.env`):
```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://proctor_user:proctor_pass@postgres:5432/moodle_proctor
MOODLE_BASE_URL=http://moodle:8080
MOODLE_SERVICE=moodle_mobile_app
JWT_SECRET=your-super-secret-jwt-key
AI_SERVICE_URL=ws://ai-proctoring:8000/proctor
LOG_LEVEL=info
CORS_ORIGIN=https://dashboard.example.com
```

**Frontend** (`/frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=https://api.example.com
```

---

## Migration Strategy

### From Legacy Express Backend

**File**: `/manual_proctoring/backend/server.js`

**Migration Steps**:
1. Maintain same API contracts for backward compatibility
2. Replace in-memory session storage with PostgreSQL
3. Migrate authentication to Moodle + JWT
4. Update desktop client API base URL

### From Frontend Moodle Auth

**Files**: `/frontend/src/app/api/auth/*/route.ts`

**Migration Steps**:
1. Remove direct Moodle API calls from frontend
2. Call backend `/api/auth/*` endpoints instead
3. Remove Moodle-specific environment variables
4. Update middleware to validate JWT from backend

---

## Troubleshooting

### Common Issues

1. **Moodle Authentication Fails**
   - Check `MOODLE_BASE_URL` is accessible
   - Verify `MOODLE_SERVICE` exists in Moodle
   - Check Moodle web service is enabled

2. **Database Connection Fails**
   - Verify PostgreSQL is running
   - Check `DATABASE_URL` is correct
   - Ensure database exists: `moodle_proctor`

3. **WebSocket Proxy Not Working**
   - Verify AI service is running on port 8000
   - Check JWT token is valid
   - Review proxy logs for errors

4. **Desktop Client Can't Connect**
   - Verify backend is running on port 5000
   - Check CORS configuration
   - Review browser console for errors

---

## Future Enhancements

### Potential Improvements

1. **Real-time Monitoring Dashboard**
   - WebSocket-based live updates
   - Show active exam attempts
   - Live violation feed

2. **Advanced Analytics**
   - Violation pattern analysis
   - Student behavior profiling
   - Exam integrity scoring

3. **Mobile Support**
   - React Native mobile app
   - Mobile-specific proctoring features
   - Push notifications for violations

4. **Multi-Institution Support**
   - Multiple Moodle instances
   - Tenant isolation
   - Cross-institution reporting

5. **AI Improvements**
   - Machine learning for anomaly detection
   - Reduced false positives
   - Adaptive violation thresholds

---

## Conclusion

This architecture provides a scalable, maintainable, and secure foundation for the Moodle-Proctor system. The unified backend approach simplifies development and deployment while maintaining backward compatibility with existing components. The modular design allows for incremental enhancement and easy scaling as the system grows.

**Key Strengths**:
- Unified authentication via Moodle
- Type-safe TypeScript implementation
- High-performance Fastify backend
- Comprehensive violation tracking
- Real-time AI proctoring integration
- Production-ready Docker deployment

**Next Steps**:
1. Implement database schema
2. Build authentication module
3. Develop exam management endpoints
4. Implement WebSocket proxy
5. Migrate frontend to use new backend
6. Deploy and test end-to-end

---

*Document Version: 1.0*
*Last Updated: 2025-01-15*
*Architecture Author: Claude Code*
