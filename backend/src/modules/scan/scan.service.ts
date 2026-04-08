import crypto from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { Pool } from 'pg'
import config from '../../config'

export interface ScanSessionSnapshot {
  token: string
  status: 'awaiting_upload' | 'upload_in_progress' | 'uploaded' | 'expired'
  createdAt: number
  expiresAt: number
  expiresInSeconds: number
  uploadWindowMinutes: number
  source: string
  mobileEntryUrl: string
  acceptedFileTypes: string[]
  student: {
    userId: number
    studentId: string
    name: string
    email: string
  }
  exam: {
    id: number
    name: string
    courseName: string | null
  }
  attempt: {
    id: number
    status: string
    submittedAt: string | null
    submissionReason: string | null
    violationCount: number
  }
  upload: {
    status: 'pending' | 'uploaded'
    format: 'pdf'
    uploadedAt: string | null
    fileName: string | null
    fileSizeBytes: number | null
    receiptId: string | null
    storedPath: string | null
  }
}

export interface CreateScanSessionInput {
  attemptId?: number | null
  attemptReference: string
  attemptStatus: string
  attemptSubmittedAt?: string | null
  attemptSubmissionReason?: string | null
  attemptViolationCount?: number
  examId?: number | null
  userId?: number | null
  roomEnrollmentId?: number | null
  studentId: string
  studentName: string
  studentEmail: string
  examName: string
  courseName?: string | null
  source: string
  uploadWindowMinutes: number
}

export interface UploadPdfResult {
  session: ScanSessionSnapshot
  receipt: {
    id: string
    uploadedAt: string
    fileName: string
    fileSizeBytes: number
  }
}

interface AnswerSheetUploadRow {
  session_token: string
  attempt_id: number | null
  attempt_reference: string
  attempt_status: string
  attempt_submitted_at: Date | null
  attempt_submission_reason: string | null
  attempt_violation_count: number
  exam_id: number | null
  user_id: number | null
  student_identifier: string
  student_name: string
  student_email: string
  exam_name: string
  course_name: string | null
  source: string
  status: 'awaiting_upload' | 'upload_in_progress' | 'uploaded' | 'expired'
  accepted_file_types: string[] | null
  upload_window_minutes: number
  expires_at: Date
  uploaded_at: Date | null
  file_name: string | null
  file_size_bytes: number | null
  mime_type: string | null
  stored_path: string | null
  receipt_id: string | null
  created_at: Date
  updated_at: Date
}

const DEFAULT_UPLOAD_WINDOW_MINUTES = Math.max(
  1,
  parseInt(process.env.ANSWER_SHEET_UPLOAD_WINDOW_MINUTES || '30', 10)
)
const MOBILE_SCAN_BASE_URL =
  process.env.MOBILE_SCAN_BASE_URL || 'http://localhost:3000'

const ANSWER_SHEET_UPLOAD_SELECT = `
  session_token,
  attempt_id,
  attempt_reference,
  attempt_status,
  attempt_submitted_at,
  attempt_submission_reason,
  attempt_violation_count,
  exam_id,
  user_id,
  student_identifier,
  student_name,
  student_email,
  exam_name,
  course_name,
  source,
  status,
  accepted_file_types,
  upload_window_minutes,
  expires_at,
  uploaded_at,
  file_name,
  file_size_bytes,
  mime_type,
  stored_path,
  receipt_id,
  created_at,
  updated_at
`

function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl
}

function buildMobileEntryUrl(token: string): string {
  const url = new URL(normalizeBaseUrl(MOBILE_SCAN_BASE_URL))
  url.searchParams.set('id', token)
  return url.toString()
}

function createToken(): string {
  return crypto.randomBytes(20).toString('base64url')
}

function sanitizeSegment(value: string, fallback: string): string {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || fallback
}

function sanitizeFileName(fileName: string): string {
  const baseName = path.basename(String(fileName || 'answer-sheet.pdf'))
  const normalized = baseName.replace(/[^a-zA-Z0-9._-]+/g, '_')
  return normalized.toLowerCase().endsWith('.pdf')
    ? normalized
    : `${normalized}.pdf`
}

function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('utf8') === '%PDF-'
}

export class ScanService {
  constructor(private readonly pg: Pool) {}

  private mapRow(row: AnswerSheetUploadRow): ScanSessionSnapshot {
    const expiresAtMs = new Date(row.expires_at).getTime()
    const derivedAttemptId = row.attempt_id
      ? Number(row.attempt_id)
      : Number(
          String(row.attempt_reference || '')
            .split(':')
            .pop() || 0
        )

    return {
      token: row.session_token,
      status: row.status,
      createdAt: new Date(row.created_at).getTime(),
      expiresAt: expiresAtMs,
      expiresInSeconds: Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)),
      uploadWindowMinutes: Number(
        row.upload_window_minutes || DEFAULT_UPLOAD_WINDOW_MINUTES
      ),
      source: row.source,
      mobileEntryUrl: buildMobileEntryUrl(row.session_token),
      acceptedFileTypes: Array.isArray(row.accepted_file_types)
        ? row.accepted_file_types
        : ['application/pdf'],
      student: {
        userId: Number(row.user_id || 0),
        studentId: row.student_identifier,
        name: row.student_name,
        email: row.student_email
      },
      exam: {
        id: Number(row.exam_id || 0),
        name: row.exam_name,
        courseName: row.course_name
      },
      attempt: {
        id: Number.isFinite(derivedAttemptId) ? derivedAttemptId : 0,
        status: row.attempt_status,
        submittedAt: row.attempt_submitted_at
          ? new Date(row.attempt_submitted_at).toISOString()
          : null,
        submissionReason: row.attempt_submission_reason,
        violationCount: Number(row.attempt_violation_count || 0)
      },
      upload: {
        status: row.file_name ? 'uploaded' : 'pending',
        format: 'pdf',
        uploadedAt: row.uploaded_at ? new Date(row.uploaded_at).toISOString() : null,
        fileName: row.file_name,
        fileSizeBytes: row.file_size_bytes,
        receiptId: row.receipt_id,
        storedPath: row.stored_path
      }
    }
  }

  private async getRowByToken(token: string): Promise<AnswerSheetUploadRow | null> {
    const result = await this.pg.query<AnswerSheetUploadRow>(
      `SELECT ${ANSWER_SHEET_UPLOAD_SELECT}
       FROM answer_sheet_uploads
       WHERE session_token = $1
       LIMIT 1`,
      [token]
    )

    return result.rows[0] || null
  }

  async createSession(input: CreateScanSessionInput): Promise<ScanSessionSnapshot> {
    const existingResult = await this.pg.query<AnswerSheetUploadRow>(
      `SELECT ${ANSWER_SHEET_UPLOAD_SELECT}
       FROM answer_sheet_uploads
       WHERE attempt_reference = $1
       LIMIT 1`,
      [input.attemptReference]
    )

    const existing = existingResult.rows[0]
    if (existing?.status === 'uploaded') {
      return this.mapRow(existing)
    }

    const sessionToken = createToken()
    const uploadWindowMinutes = Math.max(
      1,
      Number(input.uploadWindowMinutes || DEFAULT_UPLOAD_WINDOW_MINUTES)
    )
    const expiresAt = new Date(Date.now() + uploadWindowMinutes * 60 * 1000)

    const result = await this.pg.query<AnswerSheetUploadRow>(
      `INSERT INTO answer_sheet_uploads (
         session_token,
         attempt_id,
         attempt_reference,
         attempt_status,
         attempt_submitted_at,
         attempt_submission_reason,
         attempt_violation_count,
         exam_id,
         user_id,
         room_enrollment_id,
         student_identifier,
         student_name,
         student_email,
         exam_name,
         course_name,
         source,
         status,
         accepted_file_types,
         upload_window_minutes,
         expires_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $16,
         'awaiting_upload', '["application/pdf"]'::jsonb, $17, $18
       )
       ON CONFLICT (attempt_reference) DO UPDATE
       SET session_token = EXCLUDED.session_token,
           attempt_id = EXCLUDED.attempt_id,
           attempt_status = EXCLUDED.attempt_status,
           attempt_submitted_at = EXCLUDED.attempt_submitted_at,
           attempt_submission_reason = EXCLUDED.attempt_submission_reason,
           attempt_violation_count = EXCLUDED.attempt_violation_count,
           exam_id = EXCLUDED.exam_id,
           user_id = EXCLUDED.user_id,
           room_enrollment_id = EXCLUDED.room_enrollment_id,
           student_identifier = EXCLUDED.student_identifier,
           student_name = EXCLUDED.student_name,
           student_email = EXCLUDED.student_email,
           exam_name = EXCLUDED.exam_name,
           course_name = EXCLUDED.course_name,
           source = EXCLUDED.source,
           status = 'awaiting_upload',
           accepted_file_types = EXCLUDED.accepted_file_types,
           upload_window_minutes = EXCLUDED.upload_window_minutes,
           expires_at = EXCLUDED.expires_at,
           uploaded_at = NULL,
           file_name = NULL,
           file_size_bytes = NULL,
           mime_type = NULL,
           stored_path = NULL,
           receipt_id = NULL,
           updated_at = NOW()
       RETURNING ${ANSWER_SHEET_UPLOAD_SELECT}`,
      [
        sessionToken,
        input.attemptId ?? null,
        input.attemptReference,
        input.attemptStatus,
        input.attemptSubmittedAt ?? null,
        input.attemptSubmissionReason ?? null,
        Number(input.attemptViolationCount || 0),
        input.examId ?? null,
        input.userId ?? null,
        input.roomEnrollmentId ?? null,
        input.studentId,
        input.studentName,
        input.studentEmail,
        input.examName,
        input.courseName ?? null,
        input.source,
        uploadWindowMinutes,
        expiresAt
      ]
    )

    return this.mapRow(result.rows[0])
  }

  async getSession(token: string): Promise<ScanSessionSnapshot | null> {
    let row = await this.getRowByToken(token)

    if (!row) {
      return null
    }

    if (
      row.status !== 'uploaded' &&
      row.status !== 'expired' &&
      Date.now() >= new Date(row.expires_at).getTime()
    ) {
      const expiredResult = await this.pg.query<AnswerSheetUploadRow>(
        `UPDATE answer_sheet_uploads
         SET status = 'expired',
             updated_at = NOW()
         WHERE session_token = $1
         RETURNING ${ANSWER_SHEET_UPLOAD_SELECT}`,
        [token]
      )

      row = expiredResult.rows[0] || row
    }

    return this.mapRow(row)
  }

  async uploadPdf(
    token: string,
    payload: {
      fileName: string
      mimeType: string
      fileBase64: string
    }
  ): Promise<UploadPdfResult> {
    const row = await this.getRowByToken(token)

    if (!row) {
      throw new Error('Scan session not found')
    }

    const expiresAtMs = new Date(row.expires_at).getTime()
    if (
      row.status === 'expired' ||
      (row.status !== 'uploaded' && Date.now() >= expiresAtMs)
    ) {
      await this.pg.query(
        `UPDATE answer_sheet_uploads
         SET status = 'expired',
             updated_at = NOW()
         WHERE session_token = $1`,
        [token]
      )
      throw new Error('Scan session has expired')
    }

    if (row.status === 'uploaded' || row.file_name) {
      throw new Error(
        'An answer sheet PDF has already been uploaded for this session'
      )
    }

    if (String(payload.mimeType || '').toLowerCase() !== 'application/pdf') {
      throw new Error('Only PDF uploads are supported for this session')
    }

    let fileBuffer: Buffer
    try {
      fileBuffer = Buffer.from(String(payload.fileBase64 || ''), 'base64')
    } catch (_error) {
      throw new Error('The uploaded PDF could not be decoded')
    }

    if (!fileBuffer.length) {
      throw new Error('The uploaded PDF is empty')
    }

    if (fileBuffer.length > config.upload.maxFileSize) {
      throw new Error(
        `The uploaded PDF exceeds the ${Math.round(
          config.upload.maxFileSize / (1024 * 1024)
        )} MB limit`
      )
    }

    if (!isPdfBuffer(fileBuffer)) {
      throw new Error('The uploaded file is not a valid PDF')
    }

    const claimedResult = await this.pg.query<AnswerSheetUploadRow>(
      `UPDATE answer_sheet_uploads
       SET status = 'upload_in_progress',
           updated_at = NOW()
       WHERE session_token = $1
       AND status = 'awaiting_upload'
       AND file_name IS NULL
       RETURNING ${ANSWER_SHEET_UPLOAD_SELECT}`,
      [token]
    )

    if (claimedResult.rows.length === 0) {
      const latestRow = await this.getRowByToken(token)

      if (!latestRow) {
        throw new Error('Scan session not found')
      }

      if (
        latestRow.status === 'expired' ||
        Date.now() >= new Date(latestRow.expires_at).getTime()
      ) {
        await this.pg.query(
          `UPDATE answer_sheet_uploads
           SET status = 'expired',
               updated_at = NOW()
           WHERE session_token = $1`,
          [token]
        )
        throw new Error('Scan session has expired')
      }

      if (latestRow.status === 'uploaded' || latestRow.file_name) {
        throw new Error(
          'An answer sheet PDF has already been uploaded for this session'
        )
      }

      if (latestRow.status === 'upload_in_progress') {
        throw new Error(
          'An answer sheet PDF upload is already in progress for this session'
        )
      }

      throw new Error('The answer sheet upload session is not ready for upload')
    }

    const receiptId = `receipt_${crypto.randomBytes(10).toString('hex')}`
    const uploadedAt = new Date().toISOString()
    const safeFileName = sanitizeFileName(payload.fileName)
    const studentDir = path.resolve(
      process.cwd(),
      config.upload.dir,
      'answer-sheet-pdfs',
      sanitizeSegment(row.student_identifier, 'student')
    )
    const storedFileName = `${sanitizeSegment(
      row.attempt_reference,
      'attempt'
    )}_${token.slice(0, 12)}_${safeFileName}`
    const storedPath = path.join(studentDir, storedFileName)

    let updatedRow: AnswerSheetUploadRow | undefined

    try {
      await fs.mkdir(studentDir, { recursive: true })
      await fs.writeFile(storedPath, fileBuffer)

      const updatedResult = await this.pg.query<AnswerSheetUploadRow>(
        `UPDATE answer_sheet_uploads
         SET status = 'uploaded',
             uploaded_at = $2,
             file_name = $3,
             file_size_bytes = $4,
             mime_type = $5,
             stored_path = $6,
             receipt_id = $7,
             updated_at = NOW()
         WHERE session_token = $1
         AND status = 'upload_in_progress'
         RETURNING ${ANSWER_SHEET_UPLOAD_SELECT}`,
        [
          token,
          uploadedAt,
          safeFileName,
          fileBuffer.length,
          payload.mimeType,
          storedPath,
          receiptId
        ]
      )

      updatedRow = updatedResult.rows[0]

      if (!updatedRow) {
        throw new Error('The answer sheet upload could not be finalized')
      }
    } catch (error) {
      await this.pg.query(
        `UPDATE answer_sheet_uploads
         SET status = 'awaiting_upload',
             updated_at = NOW()
         WHERE session_token = $1
         AND status = 'upload_in_progress'
         AND file_name IS NULL`,
        [token]
      )

      throw error
    }

    return {
      session: this.mapRow(updatedRow),
      receipt: {
        id: receiptId,
        uploadedAt,
        fileName: safeFileName,
        fileSizeBytes: fileBuffer.length
      }
    }
  }
}

export function createScanService(pg: Pool): ScanService {
  return new ScanService(pg)
}
