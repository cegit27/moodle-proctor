// ============================================================================
// Teacher Module - API Routes
// Endpoints for teacher dashboard
// ============================================================================

import fp from 'fastify-plugin';
import { createTeacherService } from './teacher.service';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../websocket/ws.auth';
import type { FastifyInstance } from 'fastify';
import type { SendAlertRequest } from './teacher.schema';
import type { ListAttemptsQuery, ListStudentsQuery, ListReportsQuery, GetStatsQuery } from './teacher.schema';

// ============================================================================
// Teacher Routes Plugin
// ============================================================================

export default fp(async (fastify: FastifyInstance) => {
  const teacherService = createTeacherService(fastify.pg as any);

  // ==========================================================================
  // Exams
  // ==========================================================================

  /**
   * List all exams
   */
  fastify.get('/api/teacher/exams', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    const filters = {
      examId: (request.query as any).examId ? parseInt((request.query as any).examId, 10) : undefined
    };

    const result = await teacherService.listExams(filters);
    return reply.send(result);
  });

  /**
   * Get exam details
   */
  fastify.get('/api/teacher/exams/:id', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    const examId = parseInt((request.params as any).id, 10);

    if (isNaN(examId)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid exam ID'
      });
    }

    const result = await teacherService.getExam(examId);
    return reply.send(result);
  });

  // ==========================================================================
  // Attempts
  // ==========================================================================

  /**
   * List attempts with filtering
   */
  fastify.get('/api/teacher/attempts', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    const query = request.query as ListAttemptsQuery;

    // Parse numeric parameters
    const parsedQuery: ListAttemptsQuery = {
      examId: query.examId ? parseInt(query.examId as any, 10) : undefined,
      status: query.status,
      userId: query.userId ? parseInt(query.userId as any, 10) : undefined,
      startDate: query.startDate,
      endDate: query.endDate,
      limit: query.limit ? parseInt(query.limit as any, 10) : undefined,
      offset: query.offset ? parseInt(query.offset as any, 10) : undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder
    };

    const result = await teacherService.listAttempts(parsedQuery);
    return reply.send(result);
  });

  /**
   * Get attempt details with violations and session info
   */
  fastify.get('/api/teacher/attempts/:id', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    const attemptId = parseInt((request.params as any).id, 10);

    if (isNaN(attemptId)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid attempt ID'
      });
    }

    const result = await teacherService.getAttemptDetails(attemptId);
    return reply.send(result);
  });

  /**
   * Get violations for an attempt
   */
  fastify.get('/api/teacher/attempts/:id/violations', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    const attemptId = parseInt((request.params as any).id, 10);

    if (isNaN(attemptId)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid attempt ID'
      });
    }

    const result = await teacherService.getAttemptViolations(attemptId);
    return reply.send(result);
  });

  // ==========================================================================
  // Students
  // ==========================================================================

  /**
   * List students
   */
  fastify.get('/api/teacher/students', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    const query = request.query as ListStudentsQuery;

    const parsedQuery: ListStudentsQuery = {
      search: query.search,
      examId: query.examId ? parseInt(query.examId as any, 10) : undefined,
      limit: query.limit ? parseInt(query.limit as any, 10) : undefined,
      offset: query.offset ? parseInt(query.offset as any, 10) : undefined
    };

    const result = await teacherService.listStudents(parsedQuery);
    return reply.send(result);
  });

  // ==========================================================================
  // Reports
  // ==========================================================================

  /**
   * Generate reports
   */
  fastify.get('/api/teacher/reports', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    const query = request.query as ListReportsQuery;

    const parsedQuery: ListReportsQuery = {
      examId: query.examId ? parseInt(query.examId as any, 10) : undefined,
      userId: query.userId ? parseInt(query.userId as any, 10) : undefined,
      startDate: query.startDate,
      endDate: query.endDate,
      minViolations: query.minViolations ? parseInt(query.minViolations as any, 10) : undefined,
      limit: query.limit ? parseInt(query.limit as any, 10) : undefined,
      offset: query.offset ? parseInt(query.offset as any, 10) : undefined
    };

    const result = await teacherService.listReports(parsedQuery);
    return reply.send(result);
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get dashboard statistics
   */
  fastify.get('/api/teacher/stats', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    const query = request.query as GetStatsQuery;

    const parsedQuery: GetStatsQuery = {
      timeRange: query.timeRange,
      examId: query.examId ? parseInt(query.examId as any, 10) : undefined
    };

    const result = await teacherService.getStats(parsedQuery);
    return reply.send(result);
  });

  // ==========================================================================
  // Alerts
  // ==========================================================================

  /**
   * Send alert to a student
   */
  fastify.post('/api/teacher/alerts', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    const alertData = request.body as SendAlertRequest;

    // Validate required fields
    if (!alertData.attemptId || !alertData.message || !alertData.severity) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required fields: attemptId, message, severity'
      });
    }

    // Validate severity
    if (!['info', 'warning', 'critical'].includes(alertData.severity)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid severity. Must be: info, warning, or critical'
      });
    }

    try {
      // Send alert via service
      const serviceResult = await teacherService.sendAlert(
        alertData.attemptId,
        alertData.message,
        alertData.severity,
        user.id
      );

      if (!serviceResult.success) {
        return reply.code(400).send(serviceResult);
      }

      // Get teacher info for alert message
      const teacherResult = await fastify.pg.query(
        `SELECT first_name, last_name FROM users WHERE id = $1`,
        [user.id]
      );

      const teacher = teacherResult.rows[0];
      const teacherName = `${teacher.first_name} ${teacher.last_name}`.trim();

      // Create alert message
      const alertMessage = {
        type: 'teacher_alert' as const,
        alertId: serviceResult.alertId!,
        message: alertData.message,
        severity: alertData.severity,
        teacherId: user.id,
        teacherName,
        timestamp: Date.now()
      };

      // Send via WebSocket handler
      const wsHandler = (fastify as any).wsHandler;
      if (wsHandler) {
        const success = wsHandler.sendTeacherAlert(alertData.attemptId, alertMessage);
        if (!success) {
          return reply.code(404).send({
            success: false,
            error: 'Student is not currently connected'
          });
        }
      } else {
        return reply.code(500).send({
          success: false,
          error: 'WebSocket handler not available'
        });
      }

      return reply.send(serviceResult);
    } catch (error) {
      console.error('Error sending teacher alert:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to send alert'
      });
    }
  });

  // ==========================================================================
  // Decorate fastify instance
  // ==========================================================================

  fastify.decorate('teacherService', teacherService);
});
