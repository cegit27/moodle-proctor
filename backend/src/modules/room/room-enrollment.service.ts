import path from 'path'
import { Pool } from 'pg'
import type { User } from '../../types'
import { UserRole } from '../../types'
import { validateEnrollmentSignature } from './room.service'

function getHeaderValue(headers: Record<string, unknown>, name: string): string | null {
  const value = headers[name]

  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null
  }

  return typeof value === 'string' ? value : null
}

export interface RoomEnrollmentHeaders {
  enrollmentId: number
  roomId: number
  signature: string
  roomCode?: string
  studentEmail?: string
}

export interface RoomEnrollmentContext {
  enrollmentId: number
  roomId: number
  roomCode: string
  roomStatus: string
  examId: number
  examName: string
  courseName: string
  durationMinutes: number
  maxWarnings: number
  enableAiProctoring: boolean
  enableManualProctoring: boolean
  autoSubmitOnWarningLimit: boolean
  captureSnapshots: boolean
  allowStudentRejoin: boolean
  questionPaperPath: string | null
  studentName: string
  studentEmail: string
  attemptId: number | null
  user: User
}

export interface RoomCompatibilityAttempt {
  id: number
  status: string
  startedAt: number | null
  submittedAt: number | null
  submissionReason: string | null
  maxWarnings: number
  canResume: boolean
  violationCount: number
  violations: Array<{
    type: string
    detail: string
    severity: 'info' | 'warning'
    createdAt: number
  }>
}

export function hasRoomEnrollmentHeaders(headers: Record<string, unknown>): boolean {
  return Boolean(
    getHeaderValue(headers, 'x-room-enrollment-id') &&
    getHeaderValue(headers, 'x-room-id') &&
    getHeaderValue(headers, 'x-room-enrollment-signature')
  )
}

export function parseRoomEnrollmentHeaders(headers: Record<string, unknown>): RoomEnrollmentHeaders | null {
  const enrollmentId = getHeaderValue(headers, 'x-room-enrollment-id')
  const roomId = getHeaderValue(headers, 'x-room-id')
  const signature = getHeaderValue(headers, 'x-room-enrollment-signature')

  if (!enrollmentId || !roomId || !signature) {
    return null
  }

  const enrollmentIdNum = parseInt(enrollmentId, 10)
  const roomIdNum = parseInt(roomId, 10)

  if (isNaN(enrollmentIdNum) || isNaN(roomIdNum)) {
    return null
  }

  return {
    enrollmentId: enrollmentIdNum,
    roomId: roomIdNum,
    signature,
    roomCode: getHeaderValue(headers, 'x-room-code') || undefined,
    studentEmail: getHeaderValue(headers, 'x-student-email') || undefined
  }
}

export function isValidRoomEnrollmentHeaders(headers: Record<string, unknown>): boolean {
  const parsed = parseRoomEnrollmentHeaders(headers)

  if (!parsed) {
    return false
  }

  return validateEnrollmentSignature(parsed.enrollmentId, parsed.roomId, parsed.signature)
}

export async function getRoomEnrollmentContext(
  pg: Pool,
  headers: Record<string, unknown>
): Promise<RoomEnrollmentContext | null> {
  const parsed = parseRoomEnrollmentHeaders(headers)

  if (!parsed || !validateEnrollmentSignature(parsed.enrollmentId, parsed.roomId, parsed.signature)) {
    return null
  }

  const conditions = [
    'prs.id = $1',
    'prs.room_id = $2'
  ]
  const params: Array<string | number> = [parsed.enrollmentId, parsed.roomId]

  if (parsed.studentEmail) {
    params.push(parsed.studentEmail)
    conditions.push(`LOWER(prs.student_email) = LOWER($${params.length})`)
  }

  if (parsed.roomCode) {
    params.push(parsed.roomCode)
    conditions.push(`UPPER(pr.room_code) = UPPER($${params.length})`)
  }

  const result = await pg.query(
    `SELECT
       prs.id as "enrollmentId",
       prs.room_id as "roomId",
       prs.attempt_id as "attemptId",
       prs.student_name as "studentName",
       prs.student_email as "studentEmail",
       pr.room_code as "roomCode",
       pr.status as "roomStatus",
       e.id as "examId",
       e.exam_name as "examName",
       e.course_name as "courseName",
       e.duration_minutes as "durationMinutes",
       e.max_warnings as "maxWarnings",
       e.ai_proctoring_enabled as "enableAiProctoring",
       e.manual_proctoring_enabled as "enableManualProctoring",
       e.auto_submit_on_warning_limit as "autoSubmitOnWarningLimit",
       e.capture_snapshots as "captureSnapshots",
       e.allow_student_rejoin as "allowStudentRejoin",
       e.question_paper_path as "questionPaperPath",
       u.id,
       u.moodle_user_id as "moodleUserId",
       u.username,
       u.email,
       u.first_name as "firstName",
       u.last_name as "lastName",
       u.profile_image_url as "profileImageUrl",
       u.created_at as "createdAt",
       u.updated_at as "updatedAt",
       u.last_login_at as "lastLoginAt"
     FROM proctoring_room_students prs
     JOIN proctoring_rooms pr ON pr.id = prs.room_id
     JOIN exams e ON e.id = pr.exam_id
     JOIN users u ON LOWER(u.email) = LOWER(prs.student_email)
     WHERE ${conditions.join(' AND ')}
     LIMIT 1`,
    params
  )

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]

  return {
    enrollmentId: row.enrollmentId,
    roomId: row.roomId,
    roomCode: row.roomCode,
    roomStatus: row.roomStatus,
    examId: row.examId,
    examName: row.examName,
    courseName: row.courseName,
    durationMinutes: row.durationMinutes,
    maxWarnings: row.maxWarnings,
    enableAiProctoring: Boolean(row.enableAiProctoring),
    enableManualProctoring: Boolean(row.enableManualProctoring),
    autoSubmitOnWarningLimit: Boolean(row.autoSubmitOnWarningLimit),
    captureSnapshots: Boolean(row.captureSnapshots),
    allowStudentRejoin: Boolean(row.allowStudentRejoin),
    questionPaperPath: row.questionPaperPath,
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    attemptId: row.attemptId,
    user: {
      id: row.id,
      moodleUserId: row.moodleUserId,
      username: row.username,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      role: UserRole.STUDENT,
      profileImageUrl: row.profileImageUrl || undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastLoginAt: row.lastLoginAt || undefined
    }
  }
}

export async function linkAttemptToEnrollment(
  pg: Pool,
  enrollmentId: number,
  attemptId: number
): Promise<void> {
  await pg.query(
    `UPDATE proctoring_room_students
     SET attempt_id = $1
     WHERE id = $2`,
    [attemptId, enrollmentId]
  )
}

export async function getActiveAttemptIdForUserAndExam(
  pg: Pool,
  userId: number,
  examId: number
): Promise<number | null> {
  const result = await pg.query<{ id: number }>(
    `SELECT id
     FROM exam_attempts
     WHERE user_id = $1
     AND exam_id = $2
     AND status = 'in_progress'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, examId]
  )

  return result.rows[0]?.id || null
}

export async function getCompatibilityAttemptSnapshot(
  pg: Pool,
  attemptId: number | null,
  fallbackMaxWarnings: number
): Promise<RoomCompatibilityAttempt> {
  if (!attemptId) {
    return {
      id: 0,
      status: 'not_started',
      startedAt: null,
      submittedAt: null,
      submissionReason: null,
      maxWarnings: fallbackMaxWarnings,
      canResume: false,
      violationCount: 0,
      violations: []
    }
  }

  const attemptResult = await pg.query(
    `SELECT
       ea.id,
       ea.status,
       ea.started_at as "startedAt",
       ea.submitted_at as "submittedAt",
       ea.submission_reason as "submissionReason",
       ea.violation_count as "violationCount",
       e.max_warnings as "maxWarnings"
     FROM exam_attempts ea
     JOIN exams e ON e.id = ea.exam_id
     WHERE ea.id = $1
     LIMIT 1`,
    [attemptId]
  )

  if (attemptResult.rows.length === 0) {
    return {
      id: 0,
      status: 'not_started',
      startedAt: null,
      submittedAt: null,
      submissionReason: null,
      maxWarnings: fallbackMaxWarnings,
      canResume: false,
      violationCount: 0,
      violations: []
    }
  }

  const attempt = attemptResult.rows[0]
  const violationsResult = await pg.query(
    `SELECT
       violation_type as type,
       COALESCE(detail, 'A warning was recorded for this exam attempt.') as detail,
       severity,
       EXTRACT(EPOCH FROM occurred_at) * 1000 as "createdAt"
     FROM violations
     WHERE attempt_id = $1
     ORDER BY occurred_at DESC`,
    [attemptId]
  )

  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt ? new Date(attempt.startedAt).getTime() : null,
    submittedAt: attempt.submittedAt ? new Date(attempt.submittedAt).getTime() : null,
    submissionReason: attempt.submissionReason,
    maxWarnings: attempt.maxWarnings,
    canResume: attempt.status === 'in_progress',
    violationCount: attempt.violationCount,
    violations: violationsResult.rows.map(violation => ({
      type: violation.type,
      detail: violation.detail,
      severity: violation.severity,
      createdAt: Number(violation.createdAt)
    }))
  }
}

export function getQuestionPaperFilename(questionPaperPath?: string | null): string {
  if (!questionPaperPath) {
    return 'question-paper.pdf'
  }

  const basename = path.basename(questionPaperPath)
  return basename || 'question-paper.pdf'
}
