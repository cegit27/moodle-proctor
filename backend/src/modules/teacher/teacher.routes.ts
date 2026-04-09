// ============================================================================
// Teacher Module - API Routes
// Endpoints for teacher dashboard
// ============================================================================

import fp from 'fastify-plugin';
import { createReadStream } from 'fs';
import config from '../../config';
import { createTeacherService } from './teacher.service';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../websocket/ws.auth';
import type { FastifyInstance } from 'fastify';
import type {
  GetStatsQuery,
  ListAnswerSheetUploadsQuery,
  ListAttemptsQuery,
  ListReportsQuery,
  ListStudentsQuery,
  TeacherExamQuestion,
  UpsertTeacherExamRequest
} from './teacher.schema';

function parseOptionalNumber(value: unknown, fieldName: string): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a number`);
  }

  return parsed;
}

function parseQuestions(value: unknown): TeacherExamQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((question, index) => {
    const current = (question || {}) as Record<string, unknown>;

    return {
      id: typeof current.id === 'string' && current.id ? current.id : `question-${index + 1}`,
      prompt: typeof current.prompt === 'string' ? current.prompt : '',
      type: typeof current.type === 'string' ? current.type : 'short_answer',
      marks: Number(current.marks) || 0,
      options: Array.isArray(current.options)
        ? current.options.map(option => String(option))
        : [],
      answer: typeof current.answer === 'string' && current.answer ? current.answer : null
    };
  });
}

function parseExamPayload(body: Record<string, unknown>): UpsertTeacherExamRequest {
  const examName = typeof body.examName === 'string' ? body.examName.trim() : '';
  const courseName = typeof body.courseName === 'string' ? body.courseName.trim() : '';
  const durationMinutes = Number(body.durationMinutes);
  const maxWarnings = Number(body.maxWarnings);
  const roomCapacity = Number(body.roomCapacity);
  const answerSheetUploadWindowMinutes = Number(body.answerSheetUploadWindowMinutes ?? 30);

  if (!examName) {
    throw new Error('Exam name is required');
  }

  if (!courseName) {
    throw new Error('Course name is required');
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error('Duration must be greater than 0 minutes');
  }

  if (!Number.isFinite(maxWarnings) || maxWarnings < 0) {
    throw new Error('Warning limit must be 0 or greater');
  }

  if (!Number.isFinite(roomCapacity) || roomCapacity <= 0) {
    throw new Error('Room capacity must be greater than 0');
  }

  if (
    !Number.isFinite(answerSheetUploadWindowMinutes) ||
    answerSheetUploadWindowMinutes < 1
  ) {
    throw new Error('Answer sheet upload window must be at least 1 minute');
  }

  return {
    moodleCourseId: parseOptionalNumber(body.moodleCourseId, 'Moodle course ID'),
    moodleCourseModuleId: parseOptionalNumber(body.moodleCourseModuleId, 'Moodle course module ID'),
    examName,
    courseName,
    description: typeof body.description === 'string' ? body.description.trim() : null,
    instructions: typeof body.instructions === 'string' ? body.instructions.trim() : null,
    durationMinutes,
    maxWarnings,
    roomCapacity,
    enableAiProctoring: body.enableAiProctoring !== false,
    enableManualProctoring: body.enableManualProctoring !== false,
    autoSubmitOnWarningLimit: body.autoSubmitOnWarningLimit !== false,
    captureSnapshots: body.captureSnapshots !== false,
    allowStudentRejoin: body.allowStudentRejoin !== false,
    answerSheetUploadWindowMinutes,
    scheduledStartAt:
      typeof body.scheduledStartAt === 'string' && body.scheduledStartAt ? body.scheduledStartAt : null,
    scheduledEndAt:
      typeof body.scheduledEndAt === 'string' && body.scheduledEndAt ? body.scheduledEndAt : null,
    questions: parseQuestions(body.questions),
    questionPaper:
      body.questionPaper && typeof body.questionPaper === 'object'
        ? {
            fileName: String((body.questionPaper as any).fileName || 'question-paper.pdf'),
            mimeType: String((body.questionPaper as any).mimeType || 'application/pdf'),
            contentBase64: String((body.questionPaper as any).contentBase64 || '')
          }
        : null,
    removeQuestionPaper: body.removeQuestionPaper === true
  };
}

const examPayloadBodyLimit = Math.max(config.upload.maxFileSize, 4 * 1024 * 1024) * 2;

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

  fastify.post('/api/teacher/exams', {
    onRequest: [authMiddleware],
    bodyLimit: examPayloadBodyLimit
  }, async (request, reply) => {
    const user = (request as any).user;
    requireRole(user, ['teacher']);

    try {
      const payload = parseExamPayload((request.body || {}) as Record<string, unknown>);
      const result = await teacherService.createExam(payload, user.id);
      return reply.code(201).send(result);
    } catch (error) {
      const message = (error as Error).message || 'Invalid exam payload';
      const statusCode = message.includes('exceeds') ? 413 : 400;

      return reply.code(statusCode).send({
        success: false,
        error: message
      });
    }
  });

  fastify.put('/api/teacher/exams/:id', {
    onRequest: [authMiddleware],
    bodyLimit: examPayloadBodyLimit
  }, async (request, reply) => {
    const user = (request as any).user;
    requireRole(user, ['teacher']);

    const examId = parseInt((request.params as any).id, 10);

    if (isNaN(examId)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid exam ID'
      });
    }

    try {
      const payload = parseExamPayload((request.body || {}) as Record<string, unknown>);
      const result = await teacherService.updateExam(examId, payload, user.id);
      return reply.send(result);
    } catch (error) {
      const message = (error as Error).message || 'Unable to update exam';

      if (message === 'Exam not found') {
        return reply.code(404).send({
          success: false,
          error: message
        });
      }

      const statusCode = message.includes('exceeds') ? 413 : 400;

      return reply.code(statusCode).send({
        success: false,
        error: message
      });
    }
  });

  fastify.delete('/api/teacher/exams/:id', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;
    requireRole(user, ['teacher']);

    const examId = parseInt((request.params as any).id, 10);

    if (isNaN(examId)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid exam ID'
      });
    }

    try {
      const result = await teacherService.deleteExam(examId, user.id);
      return reply.send(result);
    } catch (error) {
      const message = (error as Error).message || 'Unable to delete exam';

      if (message === 'Exam not found') {
        return reply.code(404).send({
          success: false,
          error: message
        });
      }

      throw error;
    }
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
    const rawIncludeHidden = (query as any).includeHidden;

    const parsedQuery: ListAttemptsQuery = {
      examId: query.examId ? parseInt(query.examId as any, 10) : undefined,
      status: query.status,
      userId: query.userId ? parseInt(query.userId as any, 10) : undefined,
      search: query.search,
      includeHidden: rawIncludeHidden === true || rawIncludeHidden === 'true',
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

  fastify.post('/api/teacher/attempts/:id/hide', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;
    requireRole(user, ['teacher']);

    const attemptId = parseInt((request.params as any).id, 10);

    if (isNaN(attemptId)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid attempt ID'
      });
    }

    try {
      const result = await teacherService.hideAttempt(attemptId, user.id);
      return reply.send(result);
    } catch (error) {
      if ((error as Error).message === 'Attempt not found') {
        return reply.code(404).send({
          success: false,
          error: 'Attempt not found'
        });
      }

      throw error;
    }
  });

  fastify.post('/api/teacher/attempts/:id/unhide', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;
    requireRole(user, ['teacher']);

    const attemptId = parseInt((request.params as any).id, 10);

    if (isNaN(attemptId)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid attempt ID'
      });
    }

    try {
      const result = await teacherService.unhideAttempt(attemptId);
      return reply.send(result);
    } catch (error) {
      if ((error as Error).message === 'Attempt not found') {
        return reply.code(404).send({
          success: false,
          error: 'Attempt not found'
        });
      }

      throw error;
    }
  });

  fastify.delete('/api/teacher/attempts/:id', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;
    requireRole(user, ['teacher']);

    const attemptId = parseInt((request.params as any).id, 10);

    if (isNaN(attemptId)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid attempt ID'
      });
    }

    try {
      const result = await teacherService.deleteAttempt(attemptId, user.id);
      return reply.send(result);
    } catch (error) {
      if ((error as Error).message === 'Attempt not found') {
        return reply.code(404).send({
          success: false,
          error: 'Attempt not found'
        });
      }

      throw error;
    }
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
  // Answer Sheet Uploads
  // ==========================================================================

  fastify.get('/api/teacher/answer-sheet-uploads', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;
    requireRole(user, ['teacher']);

    const query = request.query as ListAnswerSheetUploadsQuery;

    const parsedQuery: ListAnswerSheetUploadsQuery = {
      examId: query.examId ? parseInt(query.examId as any, 10) : undefined,
      search: query.search,
      status: query.status,
      limit: query.limit ? parseInt(query.limit as any, 10) : undefined,
      offset: query.offset ? parseInt(query.offset as any, 10) : undefined
    };

    const result = await teacherService.listAnswerSheetUploads(parsedQuery);
    return reply.send(result);
  });

  fastify.get('/api/teacher/answer-sheet-uploads/:id/file', {
    onRequest: [authMiddleware]
  }, async (request, reply) => {
    const user = (request as any).user;
    requireRole(user, ['teacher']);

    const uploadId = parseInt((request.params as any).id, 10);

    if (isNaN(uploadId)) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid answer sheet upload ID'
      });
    }

    try {
      const file = await teacherService.getAnswerSheetUploadFile(uploadId);

      reply.header('Content-Type', file.mimeType);
      reply.header('Content-Disposition', `inline; filename="${file.fileName}"`);
      reply.header('Cache-Control', 'no-store');

      return reply.send(createReadStream(file.absolutePath));
    } catch (error) {
      const message = (error as Error).message || 'Unable to load answer sheet PDF';
      const statusCode =
        message === 'Answer sheet upload not found'
          ? 404
          : message === 'No PDF has been uploaded for this answer sheet'
            ? 409
            : 500;

      return reply.code(statusCode).send({
        success: false,
        error: message
      });
    }
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
  // Decorate fastify instance
  // ==========================================================================

  fastify.decorate('teacherService', teacherService);
});
