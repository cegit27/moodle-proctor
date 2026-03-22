import fs from 'fs';
import path from 'path';
import type { Pool } from 'pg';

export const MANUAL_PROCTORING_HEADER = 'x-manual-proctoring-client';
export const MANUAL_PROCTORING_QUESTIONS = [
  {
    id: 1,
    question: 'What does IoT stand for?',
    options: [
      'Internet of Things',
      'Input Output Technology',
      'Internet Tool',
      'None'
    ]
  },
  {
    id: 2,
    question: 'Which protocol is used in IoT?',
    options: ['MQTT', 'HTTP', 'CoAP', 'All of the above']
  }
];

const MANUAL_PROCTORING_UPLOADS_DIR = path.resolve(process.cwd(), 'uploads/manual-proctoring');
const MANUAL_PROCTORING_LOGS_DIR = path.resolve(process.cwd(), 'logs/manual-proctoring');

interface ManualUser {
  id: number;
  firstName?: string;
  lastName?: string;
  email?: string;
}

interface ManualAttemptRow {
  attempt_id: number | null;
  exam_id: number;
  exam_name: string;
  course_name: string | null;
  duration_minutes: number;
  max_warnings: number;
  question_paper_path: string | null;
  status: string;
  started_at: Date | null;
  submitted_at: Date | null;
  submission_reason: string | null;
  violation_count: number;
}

interface ManualViolationRow {
  violation_type: string;
  detail: string | null;
  severity: string;
  occurred_at: Date;
}

interface ManualUserRow {
  id: number;
  moodleUserId: number;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'student' | 'teacher';
  profileImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export function isManualProctoringRequest(request: { headers: Record<string, unknown> }): boolean {
  const headerValue = request.headers[MANUAL_PROCTORING_HEADER];
  if (Array.isArray(headerValue)) {
    return headerValue.some(value => String(value).toLowerCase() === '1' || String(value).toLowerCase() === 'true');
  }

  const normalized = String(headerValue || '').toLowerCase();
  return normalized === '1' || normalized === 'true';
}

export function getManualQuestionPaperFilename(exam?: { question_paper_path?: string | null }): string {
  const configured = exam?.question_paper_path ? path.basename(exam.question_paper_path) : '';
  return configured || 'question-paper.pdf';
}

export function getManualQuestionPaperPath(filename: string): string {
  const safeFilename = path.basename(filename);
  return path.join(MANUAL_PROCTORING_UPLOADS_DIR, safeFilename);
}

export function ensureManualProctoringDirectories(): void {
  fs.mkdirSync(MANUAL_PROCTORING_UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(MANUAL_PROCTORING_LOGS_DIR, { recursive: true });
}

export async function getLatestManualAttempt(pg: Pool, userId: number): Promise<{
  attempt: ReturnType<typeof mapManualAttempt> | null;
  examName: string;
  questionPaper: string;
}> {
  const attemptResult = await pg.query<ManualAttemptRow>(
    `SELECT
      ea.id as attempt_id,
      ea.exam_id,
      e.exam_name,
      e.course_name,
      e.duration_minutes,
      e.max_warnings,
      e.question_paper_path,
      ea.status,
      ea.started_at,
      ea.submitted_at,
      ea.submission_reason,
      ea.violation_count
    FROM exam_attempts ea
    JOIN exams e ON ea.exam_id = e.id
    WHERE ea.user_id = $1
    ORDER BY ea.created_at DESC
    LIMIT 1`,
    [userId]
  );

  if (attemptResult.rows.length === 0) {
    const examResult = await pg.query<{
      exam_name: string;
      question_paper_path: string | null;
    }>(
      `SELECT exam_name, question_paper_path
      FROM exams
      ORDER BY created_at ASC
      LIMIT 1`
    );

    return {
      attempt: createEmptyManualAttempt(),
      examName: examResult.rows[0]?.exam_name || 'No exam',
      questionPaper: getManualQuestionPaperFilename(examResult.rows[0])
    };
  }

  const attemptRow = attemptResult.rows[0];
  const violationsResult = await pg.query<ManualViolationRow>(
    `SELECT violation_type, detail, severity, occurred_at
    FROM violations
    WHERE attempt_id = $1
    ORDER BY occurred_at DESC`,
    [attemptRow.attempt_id]
  );

  return {
    attempt: mapManualAttempt(attemptRow, violationsResult.rows),
    examName: attemptRow.exam_name || 'Exam',
    questionPaper: getManualQuestionPaperFilename(attemptRow)
  };
}

export async function getManualExamSummary(pg: Pool, userId: number): Promise<{
  examId: number;
  timerSeconds: number;
  questionPaper: string;
  examName: string;
  attempt: ReturnType<typeof mapManualAttempt> | null;
}> {
  const examResult = await pg.query<ManualAttemptRow>(
    `SELECT
      ea.id as attempt_id,
      e.id as exam_id,
      e.exam_name,
      e.course_name,
      e.duration_minutes,
      e.max_warnings,
      e.question_paper_path,
      ea.status,
      ea.started_at,
      ea.submitted_at,
      ea.submission_reason,
      ea.violation_count
    FROM exams e
    LEFT JOIN exam_attempts ea ON e.id = ea.exam_id AND ea.user_id = $1
    ORDER BY ea.created_at DESC NULLS LAST, e.created_at DESC
    LIMIT 1`,
    [userId]
  );

  if (examResult.rows.length === 0) {
    throw new Error('No exam found');
  }

  const exam = examResult.rows[0];
  let attempt = null;

  if (exam.attempt_id) {
    const violationsResult = await pg.query<ManualViolationRow>(
      `SELECT violation_type, detail, severity, occurred_at
      FROM violations
      WHERE attempt_id = $1
      ORDER BY occurred_at DESC`,
      [exam.attempt_id]
    );
    attempt = mapManualAttempt(exam, violationsResult.rows);
  }

  return {
    examId: exam.exam_id,
    timerSeconds: (Number(exam.duration_minutes) || 60) * 60,
    questionPaper: getManualQuestionPaperFilename(exam),
    examName: exam.exam_name || 'Exam',
    attempt: attempt || createEmptyManualAttempt()
  };
}

export async function getFirstAvailableExamId(pg: Pool): Promise<number | null> {
  const result = await pg.query<{ id: number }>(
    'SELECT id FROM exams ORDER BY created_at ASC LIMIT 1'
  );

  return result.rows[0]?.id ?? null;
}

export async function findManualUserByIdentifier(
  pg: Pool,
  identifier: string
): Promise<ManualUserRow | null> {
  const result = await pg.query<ManualUserRow>(
    `SELECT
      id,
      moodle_user_id as "moodleUserId",
      username,
      email,
      first_name as "firstName",
      last_name as "lastName",
      role,
      profile_image_url as "profileImageUrl",
      created_at as "createdAt",
      updated_at as "updatedAt",
      last_login_at as "lastLoginAt"
    FROM users
    WHERE username = $1 OR email = $1
    LIMIT 1`,
    [identifier]
  );

  return result.rows[0] || null;
}

export async function ensureManualDevData(pg: Pool): Promise<void> {
  const userCheck = await pg.query<{ id: number }>(
    `SELECT id FROM users WHERE username = 'user' OR email = 'user' LIMIT 1`
  );

  if (userCheck.rows.length === 0) {
    await pg.query(
      `INSERT INTO users (
        moodle_user_id, username, email, first_name, last_name, role, profile_image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [900001, 'user', 'user', 'Test', 'User', 'student', null]
    );
  }

  const examCheck = await pg.query<{ id: number }>(
    `SELECT id FROM exams WHERE exam_name = 'IoT Final Exam' LIMIT 1`
  );

  if (examCheck.rows.length === 0) {
    await pg.query(
      `INSERT INTO exams (
        moodle_course_id, moodle_course_module_id, exam_name, course_name,
        duration_minutes, max_warnings, question_paper_path
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [900001, 900001, 'IoT Final Exam', 'Internet of Things', 10, 15, '/manual-proctoring/question-paper.pdf']
    );
  }
}

export function buildManualStudent(user: ManualUser, examName: string): {
  id: string;
  name: string;
  email: string;
  exam: string;
} {
  return {
    id: String(user.id),
    name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
    email: user.email || '',
    exam: examName
  };
}

export function appendManualWarningLog(student: { id: string; name: string }, violation: {
  type: string;
  detail?: string | null;
  severity?: string;
  createdAt?: number | Date;
}): void {
  ensureManualProctoringDirectories();

  const createdAt = violation.createdAt instanceof Date
    ? violation.createdAt
    : new Date(violation.createdAt || Date.now());
  const severity = normalizeSeverity(violation.severity).toUpperCase();
  const logEntry =
    `[${createdAt.toISOString()}] ${severity} studentId=${student.id} name="${student.name}" ` +
    `type=${violation.type} detail="${violation.detail || 'N/A'}"`;

  fs.appendFileSync(path.join(MANUAL_PROCTORING_LOGS_DIR, 'warnings.log'), `${logEntry}\n`, 'utf8');
}

function mapManualAttempt(
  row: ManualAttemptRow,
  violations: ManualViolationRow[] = []
): {
  id: number | null;
  status: string;
  startedAt: Date | null;
  submittedAt: Date | null;
  submissionReason: string | null;
  maxWarnings: number;
  canResume: boolean;
  violationCount: number;
  violations: Array<{
    type: string;
    detail: string | null;
    severity: string;
    createdAt: Date;
  }>;
} {
  return {
    id: row.attempt_id,
    status: row.status || 'not_started',
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    submissionReason: row.submission_reason,
    maxWarnings: Number(row.max_warnings) || 15,
    canResume: row.status === 'in_progress',
    violationCount: Number(row.violation_count) || 0,
    violations: violations.map(violation => ({
      type: violation.violation_type,
      detail: violation.detail,
      severity: normalizeSeverity(violation.severity),
      createdAt: violation.occurred_at
    }))
  };
}

function createEmptyManualAttempt(): {
  id: null;
  status: string;
  startedAt: null;
  submittedAt: null;
  submissionReason: null;
  maxWarnings: number;
  canResume: boolean;
  violationCount: number;
  violations: [];
} {
  return {
    id: null,
    status: 'not_started',
    startedAt: null,
    submittedAt: null,
    submissionReason: null,
    maxWarnings: 15,
    canResume: false,
    violationCount: 0,
    violations: []
  };
}

function normalizeSeverity(value?: string | null): 'info' | 'warning' {
  return String(value || '').trim().toLowerCase() === 'info' ? 'info' : 'warning';
}
