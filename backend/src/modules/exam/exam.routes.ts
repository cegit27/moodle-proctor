// ============================================================================
// Exam Module - Routes
// API endpoints for exam operations
// ============================================================================

import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { createExamService } from './exam.service';
import { authMiddleware } from '../../middleware/auth.middleware';
import {
  getFirstAvailableExamId,
  getLatestManualAttempt,
  isManualProctoringRequest
} from '../manual-proctoring/manual-proctoring.compat';

// ============================================================================
// Routes Plugin
// ============================================================================

export default fp(async (fastify: FastifyInstance) => {
  const examService = createExamService(fastify.pg as any);

  // ==========================================================================
  // GET /api/exam/:id - Get exam details
  // ==========================================================================

  fastify.get('/api/exam/:id', {
    onRequest: [authMiddleware],
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
    onRequest: [authMiddleware], // TODO: Add role check middleware
    handler: async (request, reply) => {
      // @ts-ignore
      const userId = request.user.id;
      const body = (request.body || {}) as { examId?: number };
      let examId = body.examId;

      if (isManualProctoringRequest(request) && !examId) {
        examId = await getFirstAvailableExamId(fastify.pg as any) ?? undefined;
      }

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
        if (isManualProctoringRequest(request)) {
          const latest = await getLatestManualAttempt(fastify.pg as any, userId);

          if (latest.attempt?.status === 'submitted') {
            return reply.code(409).send({
              success: false,
              message: 'This exam has already been submitted.',
              attempt: latest.attempt
            });
          }
        }

        const result = await examService.startExam(userId, examId, ipAddress, userAgent);

        if (isManualProctoringRequest(request)) {
          const { attempt } = await getLatestManualAttempt(fastify.pg as any, userId);

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
    onRequest: [authMiddleware], // TODO: Add role check middleware
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
    onRequest: [authMiddleware], // TODO: Add role check middleware
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
      const body = (request.body || {}) as {
        attemptId?: number;
        answers?: Record<string, unknown>;
        reason?: string;
        submissionReason?: string;
      };
      const { attemptId, answers, submissionReason } = body;

      let finalAttemptId = attemptId;
      if (isManualProctoringRequest(request) && !finalAttemptId) {
        const latest = await getLatestManualAttempt(fastify.pg as any, userId);
        finalAttemptId = (latest.attempt as any)?.id;
      }

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

        if (isManualProctoringRequest(request)) {
          const { attempt } = await getLatestManualAttempt(fastify.pg as any, userId);

          return reply.send({
            success: true,
            attempt
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
    onRequest: [authMiddleware],
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
