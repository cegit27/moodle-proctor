# API Documentation

Complete API reference for the Moodle Proctor backend system.

**Base URL:** `http://localhost:3000`

**Authentication:** JWT Bearer Tokens

---

## Table of Contents

1. [Authentication](#authentication)
2. [Student Endpoints](#student-endpoints)
3. [Exam Endpoints](#exam-endpoints)
4. [Violation Endpoints](#violation-endpoints)
5. [Teacher Endpoints](#teacher-endpoints)
6. [Manual Proctoring Endpoints](#manual-proctoring-endpoints)
7. [WebSocket Endpoints](#websocket-endpoints)
8. [Server-Sent Events](#server-sent-events)

---

## Authentication

All endpoints require JWT authentication unless marked as public.

### Get Token

Login to receive a JWT token.

```http
POST /api/auth/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "username": "teacher1",
  "password": "password123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "teacher1",
      "email": "teacher1@example.com",
      "firstName": "Teacher",
      "lastName": "One",
      "role": "teacher"
    }
  }
}
```

**Error Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Invalid credentials"
}
```

### Get Current User

Get the authenticated user's profile.

```http
GET /api/auth/me
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "teacher1",
    "email": "teacher1@example.com",
    "firstName": "Teacher",
    "lastName": "One",
    "role": "teacher",
    "moodleUserId": 1001
  }
}
```

### Refresh Token

Refresh the JWT token.

```http
POST /api/auth/refresh
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Logout

Invalidate the current session.

```http
POST /api/auth/logout
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## Student Endpoints

### Get Student Profile

Get student profile with attempt history.

```http
GET /api/student
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "username": "student1",
      "email": "student1@example.com",
      "firstName": "Student",
      "lastName": "One",
      "role": "student"
    },
    "attempts": [
      {
        "id": 1,
        "examId": 1,
        "examName": "Physics Midterm",
        "status": "submitted",
        "startedAt": "2024-01-15T10:00:00Z",
        "submittedAt": "2024-01-15T11:00:00Z",
        "violationCount": 2
      }
    ],
    "totalAttempts": 1
  }
}
```

### Validate Session

Validate a proctoring session.

```http
GET /api/session/:sessionId?attemptId=1
Authorization: Bearer YOUR_TOKEN_HERE
```

**Query Parameters:**
- `sessionId` (path): Session ID
- `attemptId` (query): Attempt ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "session": {
      "id": "abc123",
      "attemptId": 1,
      "status": "active"
    }
  }
}
```

---

## Exam Endpoints

### Get Exam Details

Get exam details with current attempt status.

```http
GET /api/exam/:id
Authorization: Bearer YOUR_TOKEN_HERE
```

**Path Parameters:**
- `id`: Exam ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exam": {
      "id": 1,
      "examName": "Physics Midterm",
      "courseName": "Physics 101",
      "durationMinutes": 60,
      "maxWarnings": 15
    },
    "attempt": {
      "id": 1,
      "status": "not_started",
      "startedAt": null,
      "submittedAt": null,
      "violationCount": 0
    }
  }
}
```

### Start Exam

Start a new exam attempt.

```http
POST /api/exam/start
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Request Body:**
```json
{
  "examId": 1
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "attempt": {
      "id": 1,
      "examId": 1,
      "status": "in_progress",
      "startedAt": "2024-01-15T10:00:00Z",
      "violationCount": 0
    },
    "session": {
      "id": "abc123",
      "websocketUrl": "ws://localhost:3001/ws/proctor?token=..."
    },
    "exam": {
      "id": 1,
      "durationMinutes": 60,
      "maxWarnings": 15
    }
  }
}
```

### Resume Exam

Resume an existing exam attempt.

```http
POST /api/exam/resume
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Request Body:**
```json
{
  "attemptId": 1
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "attempt": {
      "id": 1,
      "status": "in_progress",
      "startedAt": "2024-01-15T10:00:00Z"
    }
  }
}
```

### Submit Exam

Submit an exam attempt.

```http
POST /api/exam/submit
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Request Body:**
```json
{
  "attemptId": 1,
  "submissionReason": "manual_submit",
  "answers": {
    "q1": "A",
    "q2": "B"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "attempt": {
      "id": 1,
      "status": "submitted",
      "submittedAt": "2024-01-15T11:00:00Z",
      "submissionReason": "manual_submit"
    }
  }
}
```

### Get Questions Summary

Get exam questions summary (for display purposes).

```http
GET /api/exam/:id/questions
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "questions": [
      {
        "id": 1,
        "question": "What is Newton's first law?",
        "type": "mcq"
      }
    ],
    "totalQuestions": 10
  }
}
```

---

## Violation Endpoints

### Report Violation

Report a proctoring violation.

```http
POST /api/exam/violations
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Request Body:**
```json
{
  "attemptId": 1,
  "violationType": "multiple_faces",
  "detail": "Multiple people detected in frame",
  "severity": "warning",
  "metadata": {
    "confidence": 0.95,
    "frameSnapshot": "base64_encoded_image"
  }
}
```

**Violation Types:**
- `multiple_faces` - Multiple people detected
- `face_not_visible` - Face not visible
- `phone_detected` - Phone detected
- `looking_away` - Looking away from screen
- `background_voice` - Background conversation
- `left_screen` - Left the active screen

**Severity Levels:**
- `info` - Informational
- `warning` - Counts toward limit

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "violation": {
      "id": 1,
      "attemptId": 1,
      "violationType": "multiple_faces",
      "severity": "warning",
      "occurredAt": "2024-01-15T10:30:00Z"
    },
    "attempt": {
      "id": 1,
      "violationCount": 5,
      "status": "in_progress"
    },
    "wasAutoSubmitted": false
  }
}
```

**Auto-submit Response (when threshold reached):**
```json
{
  "success": true,
  "data": {
    "violation": { ... },
    "attempt": {
      "id": 1,
      "status": "terminated",
      "submissionReason": "warning_limit_reached"
    },
    "wasAutoSubmitted": true
  }
}
```

### Get Violations

Get violations for an attempt.

```http
GET /api/exam/:attemptId/violations
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "violations": [
      {
        "id": 1,
        "attemptId": 1,
        "violationType": "multiple_faces",
        "severity": "warning",
        "detail": "Multiple people detected",
        "occurredAt": "2024-01-15T10:30:00Z"
      }
    ],
    "total": 1
  }
}
```

### Check Violation Count

Check current violation count without fetching all violations.

```http
GET /api/exam/:attemptId/violations/check
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "count": 5,
    "maxWarnings": 15,
    "remaining": 10,
    "isAutoSubmitThreshold": false
  }
}
```

---

## Teacher Endpoints

### Get Statistics

Get dashboard statistics.

```http
GET /api/teacher/stats?timeRange=hour&examId=1
Authorization: Bearer YOUR_TOKEN_HERE
```

**Query Parameters:**
- `timeRange` (optional): `hour` | `day` | `week` | `month` | `all` (default: `all`)
- `examId` (optional): Filter by exam ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalExams": 3,
      "totalAttempts": 25,
      "activeAttempts": 5,
      "completedAttempts": 18,
      "terminatedAttempts": 2
    },
    "violations": {
      "total": 45,
      "inLast24Hours": 12,
      "byType": {
        "multiple_faces": 15,
        "face_not_visible": 12,
        "phone_detected": 8
      },
      "bySeverity": {
        "info": 20,
        "warning": 25
      }
    },
    "students": {
      "total": 30,
      "active": 5
    },
    "exams": {
      "upcoming": 0,
      "ongoing": 2,
      "completed": 1
    },
    "timeRange": "hour",
    "generatedAt": "2024-01-15T11:00:00Z"
  }
}
```

### List Exams

List all exams.

```http
GET /api/teacher/exams?examId=1
Authorization: Bearer YOUR_TOKEN_HERE
```

**Query Parameters:**
- `examId` (optional): Filter by exam ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "exams": [
      {
        "id": 1,
        "examName": "Physics Midterm",
        "courseName": "Physics 101",
        "durationMinutes": 60,
        "maxWarnings": 15,
        "totalAttempts": 10,
        "activeAttempts": 3,
        "completedAttempts": 7
      }
    ],
    "total": 1
  }
}
```

### List Attempts

List exam attempts with filtering.

```http
GET /api/teacher/attempts?status=in_progress&examId=1&limit=20&offset=0
Authorization: Bearer YOUR_TOKEN_HERE
```

**Query Parameters:**
- `examId` (optional): Filter by exam ID
- `status` (optional): `not_started` | `in_progress` | `submitted` | `terminated`
- `userId` (optional): Filter by user ID
- `startDate` (optional): Start date filter (ISO 8601)
- `endDate` (optional): End date filter (ISO 8601)
- `limit` (optional): Page size (default: 50, max: 100)
- `offset` (optional): Page offset (default: 0)
- `sortBy` (optional): `created_at` | `started_at` | `submitted_at` | `violation_count`
- `sortOrder` (optional): `ASC` | `DESC`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "attempts": [
      {
        "id": 1,
        "examId": 1,
        "examName": "Physics Midterm",
        "userId": 2,
        "username": "student1",
        "email": "student1@example.com",
        "firstName": "Student",
        "lastName": "One",
        "status": "in_progress",
        "startedAt": "2024-01-15T10:00:00Z",
        "submittedAt": null,
        "violationCount": 3,
        "durationMinutes": 60,
        "maxWarnings": 15,
        "ipAddress": "192.168.1.100"
      }
    ],
    "total": 1,
    "filters": {
      "status": "in_progress",
      "limit": 20,
      "offset": 0
    }
  }
}
```

### Get Attempt Details

Get detailed information about an attempt.

```http
GET /api/teacher/attempts/:id
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "attempt": {
      "id": 1,
      "status": "submitted",
      "violationCount": 5
    },
    "exam": {
      "id": 1,
      "examName": "Physics Midterm",
      "courseName": "Physics 101"
    },
    "user": {
      "id": 2,
      "username": "student1",
      "email": "student1@example.com",
      "firstName": "Student",
      "lastName": "One",
      "profileImageUrl": null
    },
    "violations": {
      "total": 5,
      "warnings": 3,
      "info": 2
    },
    "proctoringSession": {
      "id": 1,
      "sessionStart": "2024-01-15T10:00:00Z",
      "sessionEnd": "2024-01-15T11:00:00Z",
      "framesProcessed": 3600,
      "aiServiceConnected": true
    }
  }
}
```

### Get Attempt Violations

Get all violations for an attempt.

```http
GET /api/teacher/attempts/:id/violations
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "violations": [
      {
        "id": 1,
        "attemptId": 1,
        "violationType": "multiple_faces",
        "severity": "warning",
        "detail": "Multiple people detected",
        "occurredAt": "2024-01-15T10:30:00Z",
        "metadata": {}
      }
    ],
    "total": 1,
    "summary": {
      "byType": {
        "multiple_faces": 1
      },
      "bySeverity": {
        "info": 0,
        "warning": 1
      }
    }
  }
}
```

### List Students

List students with search.

```http
GET /api/teacher/students?search=john&limit=10
Authorization: Bearer YOUR_TOKEN_HERE
```

**Query Parameters:**
- `search` (optional): Search in username, email, name
- `examId` (optional): Filter by exam
- `limit` (optional): Page size (default: 50, max: 100)
- `offset` (optional): Page offset (default: 0)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "students": [
      {
        "id": 2,
        "username": "student1",
        "email": "student1@example.com",
        "firstName": "Student",
        "lastName": "One",
        "role": "student",
        "profileImageUrl": null,
        "lastLoginAt": "2024-01-15T09:00:00Z"
      }
    ],
    "total": 1
  }
}
```

### Send Teacher Alert

Send a real-time alert from a teacher to a student currently in an exam attempt.

```http
POST /api/teacher/alerts
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Body:**
- `attemptId` (number, required): The student attempt ID to target
- `message` (string, required): The alert text to deliver
- `severity` (string, required): `info` | `warning` | `critical`

```json
{
  "attemptId": 123,
  "message": "Please focus on the exam window",
  "severity": "warning"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "alertId": "alert_1680000000000_abcd123",
  "message": "Alert sent successfully by Teacher Name"
}
```

**Response (404 Not Found):**
```json
{
  "success": false,
  "error": "Student is not currently connected"
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "Missing required fields: attemptId, message, severity"
}
```

### Generate Reports

Generate violation reports.

```http
GET /api/teacher/reports?examId=1&minViolations=3
Authorization: Bearer YOUR_TOKEN_HERE
```

**Query Parameters:**
- `examId` (optional): Filter by exam ID
- `userId` (optional): Filter by user ID
- `startDate` (optional): Start date filter
- `endDate` (optional): End date filter
- `minViolations` (optional): Minimum violation count
- `limit` (optional): Page size (default: 100, max: 500)
- `offset` (optional): Page offset (default: 0)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "attemptId": 1,
        "examName": "Physics Midterm",
        "courseName": "Physics 101",
        "studentName": "Student One",
        "studentEmail": "student1@example.com",
        "status": "submitted",
        "startedAt": "2024-01-15T10:00:00Z",
        "submittedAt": "2024-01-15T11:00:00Z",
        "submissionReason": null,
        "violationCount": 5,
        "durationMinutes": 60,
        "ipAddress": "192.168.1.100"
      }
    ],
    "total": 1
  }
}
```

---

## Manual Proctoring Endpoints

These endpoints are compatible with the Electron manual proctoring client.

### Login (Electron Compatible)

```http
POST /api/login
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "student1@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": 1234567890,
  "student": {
    "id": "2",
    "name": "Student One",
    "email": "student1@example.com",
    "exam": "Physics Midterm"
  }
}
```

### Get Exam (Electron Compatible)

```http
GET /api/exam
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response:**
```json
{
  "success": true,
  "timerSeconds": 3600,
  "questionPaper": "question-paper.pdf",
  "student": {
    "id": "2",
    "name": "Student One",
    "email": "student1@example.com",
    "exam": "Physics Midterm"
  },
  "attempt": {
    "status": "not_started",
    "startedAt": null,
    "submittedAt": null,
    "maxWarnings": 15,
    "canResume": false,
    "violationCount": 0,
    "violations": []
  }
}
```

---

## WebSocket Endpoints

### Proctoring WebSocket

Connect to the proctoring WebSocket for real-time frame streaming.

```
ws://localhost:3001/ws/proctor?token=YOUR_TOKEN_HERE
```

**Query Parameters:**
- `token`: JWT authentication token

### Client → Server Messages

**Frame Message:**
```json
{
  "type": "frame",
  "frameId": 1,
  "sequence": 1,
  "timestamp": 1705300800000,
  "frame": "base64_encoded_image_data",
  "signature": "hmac_sha256_signature",
  "attemptId": 1,
  "sessionId": "abc123"
}
```

**Control Messages:**
```json
{
  "type": "start"
}
```

```json
{
  "type": "stop"
}
```

**Ping Message:**
```json
{
  "type": "ping"
}
```

### Server → Client Messages

**Violation Message:**
```json
{
  "type": "violation",
  "violations": ["multiple_faces", "phone_detected"],
  "flag": true,
  "details": {
    "confidence": 0.95,
    "timestamp": 1705300800000
  }
}
```

**Status Message:**
```json
{
  "type": "status",
  "status": "ready",
  "timestamp": 1705300800000
}
```

**Teacher Alert Message:**
```json
{
  "type": "teacher_alert",
  "alertId": "alert_1705300800000_ab12cd",
  "message": "Please stay focused, you are drifting off.",
  "severity": "warning",
  "teacherId": 5,
  "teacherName": "Dr. Smith",
  "timestamp": 1705300800000
}
```

**Error Message:**
```json
{
  "type": "error",
  "message": "AI service unavailable",
  "timestamp": 1705300800000
}
```

---

## Server-Sent Events

### Teacher Dashboard Events

Connect to SSE for real-time dashboard updates.

```
GET /api/teacher/events?examId=1
Authorization: Bearer YOUR_TOKEN_HERE
```

**Query Parameters:**
- `examId` (optional): Filter events by exam
- `userId` (optional): Filter events by user

### Event Types

**violation:**
```
event: violation
data: {"attemptId":1,"violations":["multiple_faces"],"details":{...}}
```

**attempt_status:**
```
event: attempt_status
data: {"attemptId":1,"status":"submitted"}
```

**exam_start:**
```
event: exam_start
data: {"attemptId":1,"userId":2,"examId":1,"sessionId":"abc123"}
```

**exam_end:**
```
event: exam_end
data: {"attemptId":1,"userId":2,"examId":1,"sessionId":"abc123"}
```

**student_action:**
```
event: student_action
data: {"action":"connected","message":"Connected to real-time updates"}
```

**heartbeat:**
```
event: heartbeat
data: {"timestamp":1705300800000}
```

---

## Error Codes

| Status Code | Description |
|------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict (e.g., exam already submitted) |
| 422 | Validation Error |
| 429 | Too Many Requests (rate limit) |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### Error Response Format

```json
{
  "success": false,
  "error": "Error message here"
}
```

---

## Rate Limiting

API endpoints are rate-limited:

- **Default:** 100 requests per 15 minutes per IP
- **WebSocket:** 60 frames per minute per session
- **Login:** 5 attempts per 15 minutes per IP

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705300900
```

---

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `limit`: Items per page (default: 50)
- `offset`: Number of items to skip (default: 0)

**Response includes:**
```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 150
  }
}
```

---

## CORS

Enabled for origins:
- `http://localhost:3000` (development)
- `http://localhost:3001` (WebSocket)
- Configured origins in production

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Get stats
const stats = await api.get('/api/teacher/stats');
console.log(stats.data);
```

### Python

```python
import requests

headers = {'Authorization': f'Bearer {token}'}

# Get stats
response = requests.get('http://localhost:3000/api/teacher/stats', headers=headers)
stats = response.json()
print(stats)
```

### cURL

```bash
# Get stats
curl -X GET "http://localhost:3000/api/teacher/stats" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Changelog

### Version 1.0.0 (Current)

- ✅ Authentication endpoints
- ✅ Student endpoints
- ✅ Exam management
- ✅ Violation tracking
- ✅ Teacher dashboard
- ✅ Real-time SSE
- ✅ WebSocket proxy
- ✅ Manual proctoring compatibility

---

## Support

For issues or questions:
- GitHub Issues: [Project Repository]
- Documentation: [README](../README.md)
- Testing Guide: [TESTING.md](../TESTING.md)
