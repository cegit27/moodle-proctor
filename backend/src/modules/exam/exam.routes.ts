// ============================================================================
// Exam Module - Routes
// API endpoints for exam operations
// ============================================================================

import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { createExamService } from './exam.service';
import { authMiddleware, requireStudent, requireTeacher } from '../../middleware/auth.middleware';
import {
  getManualSessionFromRequest,
  isManualProctoringRequest
} from '../manual-proctoring/manual-proctoring.compat';
import {
  startManualExamAttempt,
  submitManualExamAttempt
} from '../manual-proctoring/manual-proctoring.compat';
import {
  getCompatibilityAttemptSnapshot,
  linkAttemptToEnrollment
} from '../room/room-enrollment.service';

// ============================================================================
// Routes Plugin
// ============================================================================

export default fp(async (fastify: FastifyInstance) => {
  const examService = createExamService(fastify.pg as any);

  // ==========================================================================
  // GET /api/exams - List all exams for teacher
  // ==========================================================================

  fastify.get('/api/exams', {
    onRequest: [authMiddleware, requireTeacher],
    handler: async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id;

      try {
        const result = await fastify.pg.query(
          `SELECT
             e.id,
             e.exam_name,
             c.course_name
           FROM exams e
           JOIN courses c ON e.course_id = c.id
           WHERE c.teacher_id = $1
           ORDER BY e.created_at DESC`,
          [userId]
        );

        return reply.send({
          success: true,
          data: result.rows
        });
      } catch (error) {
        console.error('Error fetching exams:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to fetch exams'
        });
      }
    }
  });

  // ==========================================================================
  // GET /api/exam/:id - Get exam details
  // ==========================================================================

  fastify.get('/api/exam/:id', {
    onRequest: [authMiddleware, requireStudent],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    },
    handler: async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id;
      const { id } = request.params as { id: number };

      try {
        const result = await examService.getExamDetails(id, userId);
        return reply.send(result);
      } catch (error) {
        if ((error as Error).message === 'Exam not found') {
          return reply.code(404).send({
            success: false,
            error: 'Exam not found'
          });
        }
        throw error;
      }
    }
  });

  // ==========================================================================
  // POST /api/exam/start - Start a new exam attempt
  // ==========================================================================

  fastify.post('/api/exam/start', {
    onRequest: [authMiddleware, requireStudent],
    handler: async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id;
      const roomEnrollment = (request as any).roomEnrollment as
        | { enrollmentId: number; examId: number; attemptId: number | null; maxWarnings: number }
        | undefined;
      const body = (request.body || {}) as { examId?: number };

      if (!roomEnrollment && isManualProctoringRequest(request)) {
        const session = getManualSessionFromRequest(request as any);

        if (!session) {
          return reply.code(401).send({
            success: false,
            message: 'Invalid session'
          });
        }

        const result = startManualExamAttempt();
        return reply.code(result.statusCode).send({
          success: result.success,
          ...(result.message ? { message: result.message } : {}),
          attempt: result.attempt
        });
      }

      let examId = body.examId || roomEnrollment?.examId;
      if (!examId) {
        return reply.code(400).send({
          success: false,
          error: 'Exam ID is required',
          message: 'No exam available'
        });
      }

      // Get IP and user agent
      // @ts-ignore
      const ipAddress = request.ip;
      // @ts-ignore
      const userAgent = request.headers['user-agent'];

      try {
        if (roomEnrollment) {
          const existingAttemptId = roomEnrollment.attemptId;

          if (existingAttemptId) {
            await linkAttemptToEnrollment(
              fastify.pg as any,
              roomEnrollment.enrollmentId,
              existingAttemptId
            );

            const attempt = await getCompatibilityAttemptSnapshot(
              fastify.pg as any,
              existingAttemptId,
              roomEnrollment.maxWarnings
            );

            return reply.send({
              success: true,
              attempt
            });
          }
        }

        let result;

        try {
          result = await examService.startExam(userId, examId, ipAddress, userAgent);
        } catch (error) {
          const message = (error as Error).message;

          if (roomEnrollment && message === 'Exam already in progress') {
            await examService.terminateActiveAttemptsForExam(userId, examId, 'superseded_by_new_room_session');
            result = await examService.startExam(userId, examId, ipAddress, userAgent);
          } else {
            throw error;
          }
        }

        if (roomEnrollment) {
          await linkAttemptToEnrollment(
            fastify.pg as any,
            roomEnrollment.enrollmentId,
            result.data.attempt.id
          );

          const attempt = await getCompatibilityAttemptSnapshot(
            fastify.pg as any,
            result.data.attempt.id,
            roomEnrollment.maxWarnings
          );

          return reply.code(201).send({
            success: true,
            attempt
          });
        }

        return reply.code(201).send(result);
      } catch (error) {
        const message = (error as Error).message;
        if (message === 'Cannot start exam' || message.includes('Cannot start')) {
          return reply.code(400).send({
            success: false,
            error: message
          });
        }
        if (message === 'Exam not found') {
          return reply.code(404).send({
            success: false,
            error: 'Exam not found'
          });
        }
        throw error;
      }
    }
  });

  // ==========================================================================
  // POST /api/exam/resume - Resume an existing exam attempt
  // ==========================================================================

  fastify.post('/api/exam/resume', {
    onRequest: [authMiddleware, requireStudent],
    schema: {
      body: {
        type: 'object',
        properties: {
          attemptId: { type: 'number' }
        },
        required: ['attemptId']
      }
    },
    handler: async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id;
      const { attemptId } = request.body as { attemptId: number };

      try {
        const result = await examService.resumeExam(userId, attemptId);
        return reply.send(result);
      } catch (error) {
        const message = (error as Error).message;
        if (message === 'Attempt not found') {
          return reply.code(404).send({
            success: false,
            error: 'Exam attempt not found'
          });
        }
        if (message.includes('Cannot resume')) {
          return reply.code(400).send({
            success: false,
            error: message
          });
        }
        throw error;
      }
    }
  });

  // ==========================================================================
  // POST /api/exam/submit - Submit exam answers
  // ==========================================================================

  fastify.post('/api/exam/submit', {
    onRequest: [authMiddleware, requireStudent],
    schema: {
      body: {
        type: 'object',
        properties: {
          attemptId: { type: 'number' },
          answers: { type: 'object' },
          reason: { type: 'string' },
          submissionReason: {
            type: 'string',
            enum: ['manual_submit', 'warning_limit_reached', 'time_expired'],
            default: 'manual_submit'
          }
        }
      }
    },
    handler: async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id;
      const roomEnrollment = (request as any).roomEnrollment as
        | { attemptId: number | null; maxWarnings: number }
        | undefined;
      const body = (request.body || {}) as {
        attemptId?: number;
        answers?: Record<string, unknown>;
        reason?: string;
        submissionReason?: string;
      };
      const { attemptId, answers, submissionReason } = body;

      if (!roomEnrollment && isManualProctoringRequest(request)) {
        const session = getManualSessionFromRequest(request as any);

        if (!session) {
          return reply.code(401).send({
            success: false,
            message: 'Invalid session'
          });
        }

        const result = submitManualExamAttempt(submissionReason || body.reason || 'manual_submit');
        return reply.send(result);
      }

      const finalAttemptId = attemptId || roomEnrollment?.attemptId;
      if (!finalAttemptId) {
        return reply.code(404).send({
          success: false,
          error: 'Exam attempt not found',
          message: 'No active exam attempt found'
        });
      }

      // Get IP address
      // @ts-ignore
      const ipAddress = request.ip;

      try {
        const result = await examService.submitExam(
          userId,
          finalAttemptId,
          answers || {},
          submissionReason || body.reason || 'manual_submit',
          ipAddress
        );

        if (roomEnrollment) {
          const attempt = await getCompatibilityAttemptSnapshot(
            fastify.pg as any,
            result.data.attempt.id,
            roomEnrollment.maxWarnings
          );

          return reply.send({
            success: true,
            attempt,
            submitted: true
          });
        }

        return reply.send(result);
      } catch (error) {
        const message = (error as Error).message;
        if (message === 'Attempt not found') {
          return reply.code(404).send({
            success: false,
            error: 'Exam attempt not found'
          });
        }
        if (message.includes('Cannot submit')) {
          return reply.code(400).send({
            success: false,
            error: message
          });
        }
        throw error;
      }
    }
  });

  // ==========================================================================
  // GET /api/exam/:id/questions - Get question summary
  // ==========================================================================

  fastify.get('/api/exam/:id/questions', {
    onRequest: [authMiddleware, requireStudent],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' }
        },
        required: ['id']
      }
    },
    handler: async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id;
      const { id } = request.params as { id: number };

      try {
        const result = await examService.getQuestionsSummary(id, userId);
        return reply.send(result);
      } catch (error) {
        if ((error as Error).message === 'Exam not found') {
          return reply.code(404).send({
            success: false,
            error: 'Exam not found'
          });
        }
        throw error;
      }
    }
  });

  console.log('✅ Exam routes registered');
}, {
  name: 'exam-routes'
});
