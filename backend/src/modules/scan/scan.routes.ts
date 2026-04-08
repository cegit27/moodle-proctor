import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import config from '../../config'
import {
  authMiddleware,
  requireStudent
} from '../../middleware/auth.middleware'
import {
  buildManualStudent,
  getLatestManualAttempt,
  isManualProctoringRequest
} from '../manual-proctoring/manual-proctoring.compat'
import { createScanService } from './scan.service'

const DEFAULT_UPLOAD_WINDOW_MINUTES = Math.max(
  1,
  parseInt(process.env.ANSWER_SHEET_UPLOAD_WINDOW_MINUTES || '30', 10)
)

function buildStudentName(row: {
  firstName?: string | null
  lastName?: string | null
  username?: string | null
  email?: string | null
}): string {
  const fullName = [row.firstName, row.lastName]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim()

  return fullName || String(row.username || row.email || 'Student')
}

export default fp(
  async (fastify: FastifyInstance) => {
    const scanService = createScanService(fastify.pg as any)

    fastify.post('/api/scan/sessions', {
      onRequest: [authMiddleware, requireStudent],
      schema: {
        body: {
          type: 'object',
          properties: {
            attemptId: { type: 'number' },
            uploadWindowMinutes: { type: 'number' },
            source: { type: 'string' }
          }
        }
      },
      handler: async (request, reply) => {
        const body = (request.body || {}) as {
          attemptId?: number
          uploadWindowMinutes?: number
          source?: string
        }
        const source = String(body.source || 'electron_post_exam')
        const roomEnrollment = (request as any).roomEnrollment as
          | {
              enrollmentId: number
              examId: number
              examName: string
              courseName: string
              studentName: string
              studentEmail: string
            }
          | undefined

        if (isManualProctoringRequest(request)) {
          const manualAttemptPayload = getLatestManualAttempt()
          const manualStudent = buildManualStudent()

          if (manualAttemptPayload.attempt.status !== 'submitted') {
            return reply.code(409).send({
              success: false,
              error:
                'Answer sheet upload is only available after the exam is submitted'
            })
          }

          const session = await scanService.createSession({
            attemptReference: `manual:${manualStudent.id}:${manualAttemptPayload.attempt.id}`,
            attemptStatus: manualAttemptPayload.attempt.status,
            attemptSubmittedAt: manualAttemptPayload.attempt.submittedAt
              ? new Date(manualAttemptPayload.attempt.submittedAt).toISOString()
              : null,
            attemptSubmissionReason: manualAttemptPayload.attempt.submissionReason,
            attemptViolationCount: manualAttemptPayload.attempt.violationCount,
            userId: null,
            studentId: manualStudent.id,
            studentName: manualStudent.name,
            studentEmail: manualStudent.email,
            examName: manualAttemptPayload.examName,
            courseName: null,
            source,
            uploadWindowMinutes: Math.max(
              1,
              Number(body.uploadWindowMinutes) || DEFAULT_UPLOAD_WINDOW_MINUTES
            )
          })

          return reply.send({
            success: true,
            data: session
          })
        }

        const userId = Number((request.user as any).id || 0)
        const attemptId = Number(body.attemptId || 0)

        if (!attemptId) {
          return reply.code(400).send({
            success: false,
            error: 'Attempt ID is required to create a scan session'
          })
        }

        const result = await fastify.pg.query<{
          attemptId: number
          attemptStatus: string
          submittedAt: Date | null
          submissionReason: string | null
          violationCount: number
          examId: number
          examName: string
          courseName: string | null
          answerSheetUploadWindowMinutes: number
          studentId: number
          studentEmail: string
          username: string
          firstName: string | null
          lastName: string | null
        }>(
          `SELECT
             ea.id as "attemptId",
             ea.status as "attemptStatus",
             ea.submitted_at as "submittedAt",
             ea.submission_reason as "submissionReason",
             ea.violation_count as "violationCount",
             e.id as "examId",
             e.exam_name as "examName",
             e.course_name as "courseName",
             e.answer_sheet_upload_window_minutes as "answerSheetUploadWindowMinutes",
             u.id as "studentId",
             u.email as "studentEmail",
             u.username as "username",
             u.first_name as "firstName",
             u.last_name as "lastName"
           FROM exam_attempts ea
           JOIN exams e ON e.id = ea.exam_id
           JOIN users u ON u.id = ea.user_id
           WHERE ea.id = $1
           AND ea.user_id = $2
           LIMIT 1`,
          [attemptId, userId]
        )

        if (result.rows.length === 0) {
          return reply.code(404).send({
            success: false,
            error: 'Submitted exam attempt not found'
          })
        }

        const row = result.rows[0]

        if (row.attemptStatus !== 'submitted') {
          return reply.code(409).send({
            success: false,
            error:
              'Answer sheet upload is only available after the exam is submitted'
          })
        }

        const session = await scanService.createSession({
          attemptId: row.attemptId,
          attemptReference: `attempt:${row.attemptId}`,
          attemptStatus: row.attemptStatus,
          attemptSubmittedAt: row.submittedAt
            ? new Date(row.submittedAt).toISOString()
            : null,
          attemptSubmissionReason: row.submissionReason,
          attemptViolationCount: row.violationCount,
          examId: roomEnrollment?.examId || row.examId,
          userId: row.studentId,
          roomEnrollmentId: roomEnrollment?.enrollmentId,
          studentId: String(row.studentId),
          studentName: roomEnrollment?.studentName || buildStudentName(row),
          studentEmail: roomEnrollment?.studentEmail || row.studentEmail,
          examName: roomEnrollment?.examName || row.examName,
          courseName: roomEnrollment?.courseName || row.courseName,
          source,
          uploadWindowMinutes: Math.max(
            1,
            Number(row.answerSheetUploadWindowMinutes) || DEFAULT_UPLOAD_WINDOW_MINUTES
          )
        })

        return reply.send({
          success: true,
          data: session
        })
      }
    })

    fastify.get('/api/scan/sessions/:token', {
      schema: {
        params: {
          type: 'object',
          properties: {
            token: { type: 'string' }
          },
          required: ['token']
        }
      },
      handler: async (request, reply) => {
        const { token } = request.params as { token: string }
        const session = await scanService.getSession(token)

        if (!session) {
          return reply.code(404).send({
            success: false,
            error: 'Scan session not found'
          })
        }

        if (session.status === 'expired') {
          return reply.code(410).send({
            success: false,
            error: 'Scan session has expired',
            data: session
          })
        }

        return reply.send({
          success: true,
          data: session
        })
      }
    })

    fastify.post('/api/scan/sessions/:token/pdf', {
      bodyLimit: Math.max(config.upload.maxFileSize, 4 * 1024 * 1024) * 2,
      schema: {
        params: {
          type: 'object',
          properties: {
            token: { type: 'string' }
          },
          required: ['token']
        },
        body: {
          type: 'object',
          properties: {
            fileName: { type: 'string' },
            mimeType: { type: 'string' },
            fileBase64: { type: 'string' }
          },
          required: ['fileName', 'mimeType', 'fileBase64']
        }
      },
      handler: async (request, reply) => {
        const { token } = request.params as { token: string }
        const body = request.body as {
          fileName: string
          mimeType: string
          fileBase64: string
        }

        try {
          const result = await scanService.uploadPdf(token, body)

          return reply.send({
            success: true,
            data: result.session,
            receipt: result.receipt
          })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Could not upload answer sheet PDF'

          const statusCode =
            message === 'Scan session not found'
              ? 404
              : message === 'Scan session has expired'
              ? 410
              : message ===
                'An answer sheet PDF has already been uploaded for this session'
              ? 409
              : message ===
                'An answer sheet PDF upload is already in progress for this session'
              ? 409
              : message.includes('Only PDF') ||
                message.includes('empty') ||
                message.includes('decoded') ||
                message.includes('valid PDF')
              ? 400
              : message.includes('exceeds')
              ? 413
              : 500

          const session =
            statusCode === 409 || statusCode === 410
              ? await scanService.getSession(token)
              : null

          return reply.code(statusCode).send({
            success: false,
            error: message,
            data: session
          })
        }
      }
    })
  },
  {
    name: 'scan-routes'
  }
)
