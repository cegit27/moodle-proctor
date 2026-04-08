// ============================================================================
// Violation Module - Routes
// API endpoints for violation operations
// ============================================================================

import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createViolationService } from './violation.service';
import { authMiddleware, requireStudent } from '../../middleware/auth.middleware';
import type { ReportViolationRequest } from './violation.schema';
import {
  getManualSessionFromRequest,
  isManualProctoringRequest
} from '../manual-proctoring/manual-proctoring.compat';
import { recordManualViolation } from '../manual-proctoring/manual-proctoring.compat';
import { getCompatibilityAttemptSnapshot } from '../room/room-enrollment.service';

// ============================================================================
// Routes Plugin
// ============================================================================

export default fp(async (fastify: FastifyInstance) => {
  const violationService = createViolationService(fastify.pg as any);

  // ==========================================================================
  // POST /api/exam/violations - Report a violation
  // ==========================================================================

  fastify.post('/api/exam/violations', {
    onRequest: [authMiddleware, requireStudent],
    config: {
      rateLimit: {
        max: 100,
        timeWindow: '1 minute'
      }
    },
    schema: {
      body: {
        type: 'object',
        properties: {
          attemptId: { type: 'number' },
          violationType: { type: 'string' },
          type: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning'], default: 'warning' },
          detail: { type: 'string' },
          metadata: { type: 'object' },
          frameSnapshot: { type: 'string' }, // Base64
          integrityHash: { type: 'string' },
          aiSignature: { type: 'string' },
          clientIp: { type: 'string' },
          sessionId: { type: 'string' },
          timestamp: { type: 'number' }
        }
      }
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      // @ts-ignore
      const userId = request.user.id;
      const roomEnrollment = (request as any).roomEnrollment as
        | { roomId: number; attemptId: number | null; maxWarnings: number }
        | undefined;
      const body = (request.body || {}) as ReportViolationRequest & { type?: string };
      const normalizedViolationType = body.violationType || body.type || undefined;
      const resolvedAttemptId = body.attemptId || roomEnrollment?.attemptId || undefined;

      if (!roomEnrollment && isManualProctoringRequest(request)) {
        const session = getManualSessionFromRequest(request as any);

        if (!session) {
          return reply.code(401).send({
            success: false,
            message: 'Invalid session'
          });
        }

        const result = recordManualViolation(
          normalizedViolationType || 'unknown',
          body.detail || '',
          body.severity
        );

        return reply.code(result.statusCode).send({
          success: result.success,
          ...(result.message ? { message: result.message } : {}),
          attempt: result.attempt
        });
      }

      if (!resolvedAttemptId || !normalizedViolationType) {
        return reply.code(400).send({
          success: false,
          error: 'Attempt ID and violation type are required',
          message: 'No active exam attempt found'
        });
      }

      // Get signature service from fastify decoration
      // @ts-ignore
      const signatureService = fastify.security?.signatureService;

      try {
        const result = await violationService.recordViolation(
          {
            ...body,
            attemptId: resolvedAttemptId,
            roomId: roomEnrollment?.roomId,
            violationType: normalizedViolationType
          },
          userId,
          signatureService
        );

        if (roomEnrollment) {
          const attempt = await getCompatibilityAttemptSnapshot(
            fastify.pg as any,
            resolvedAttemptId,
            roomEnrollment.maxWarnings
          );

          return reply.code(200).send({
            success: true,
            attempt,
            violation: result.data.violation,
            ...(result.data.shouldAutoSubmit
              ? { message: 'Auto-submit threshold reached - exam submitted automatically' }
              : {})
          });
        }

        // If auto-submit was triggered, return special status
        if (result.data.shouldAutoSubmit) {
          return reply.code(200).send({
            ...result,
            message: 'Auto-submit threshold reached - exam submitted automatically'
          });
        }

        return reply.code(201).send(result);
      } catch (error) {
        const message = (error as Error).message;
        if (message === 'Attempt not found') {
          return reply.code(404).send({
            success: false,
            error: 'Exam attempt not found'
          });
        }
        if (message === 'Access denied') {
          return reply.code(403).send({
            success: false,
            error: 'You do not have permission to record violations for this attempt'
          });
        }
        if (message.includes('Cannot record violation')) {
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
  // GET /api/exam/:attemptId/violations - Get violations for an attempt
  // ==========================================================================

  fastify.get('/api/exam/:attemptId/violations', {
    onRequest: [authMiddleware, requireStudent],
    schema: {
      params: {
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
      const { attemptId } = request.params as { attemptId: number };

      try {
        const result = await violationService.getViolations(attemptId, userId);
        return reply.send(result);
      } catch (error) {
        const message = (error as Error).message;
        if (message === 'Attempt not found') {
          return reply.code(404).send({
            success: false,
            error: 'Exam attempt not found'
          });
        }
        if (message === 'Access denied') {
          return reply.code(403).send({
            success: false,
            error: 'You do not have permission to view violations for this attempt'
          });
        }
        throw error;
      }
    }
  });

  // ==========================================================================
  // GET /api/exam/:attemptId/violations/check - Check violation count
  // ==========================================================================

  fastify.get('/api/exam/:attemptId/violations/check', {
    onRequest: [authMiddleware, requireStudent],
    schema: {
      params: {
        type: 'object',
        properties: {
          attemptId: { type: 'number' }
        },
        required: ['attemptId']
      }
    },
    handler: async (request, reply) => {
      const { attemptId } = request.params as { attemptId: number };

      const result = await violationService.checkViolationCount(attemptId);
      return reply.send(result);
    }
  });

  console.log('✅ Violation routes registered');
}, {
  name: 'violation-routes'
});
