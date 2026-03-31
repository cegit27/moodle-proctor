import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import logger from '../../config/logger';
import { authMiddleware } from '../../middleware/auth.middleware';
import {
  buildManualStudent,
  createManualSession,
  destroyManualSession,
  ensureManualProctoringDirectories,
  getManualExamSummary,
  getManualQuestionPaperFilename,
  getManualSessionFromRequest,
  getManualTokenFromRequest,
  isManualProctoringRequest,
  MANUAL_PROCTORING_QUESTIONS,
  validateManualCredentials
} from './manual-proctoring.compat';
import {
  getCompatibilityAttemptSnapshot,
  getQuestionPaperFilename,
  resolveRoomEnrollmentAttemptId
} from '../room/room-enrollment.service';

export default fp(async (fastify: FastifyInstance) => {
  ensureManualProctoringDirectories();

  fastify.post('/api/login', async (request, reply) => {
    try {
      const { email, password } = request.body as {
        email?: string;
        password?: string;
      };

      if (!email || !password) {
        return reply.code(400).send({
          success: false,
          message: 'Email and password are required'
        });
      }

      if (!validateManualCredentials(email, password)) {
        return reply.code(401).send({
          success: false,
          message: 'Invalid credentials'
        });
      }

      const session = createManualSession();

      return reply.send({
        success: true,
        token: session.token,
        expiresAt: session.expiresAt,
        student: buildManualStudent()
      });
    } catch (error) {
      logger.error('Manual proctoring login error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Login failed'
      });
    }
  });

  fastify.post('/api/logout', { onRequest: [authMiddleware] }, async (request, reply) => {
    destroyManualSession(getManualTokenFromRequest(request as any));

    return reply.send({
      success: true,
      message: 'Logged out successfully'
    });
  });

  fastify.get('/api/session', { onRequest: [authMiddleware] }, async (request, reply) => {
    const roomEnrollment = (request as any).roomEnrollment as
      | {
          enrollmentId: number;
          studentName: string;
          studentEmail: string;
          examName: string;
          courseName: string;
        }
      | undefined;
    const session = getManualSessionFromRequest(request as any);

    if (roomEnrollment) {
      return reply.send({
        success: true,
        student: {
          id: `room-${roomEnrollment.enrollmentId}`,
          name: roomEnrollment.studentName,
          email: roomEnrollment.studentEmail,
          exam: roomEnrollment.examName
        }
      });
    }

    if (isManualProctoringRequest(request as any) && session) {
      return reply.send({
        success: true,
        expiresAt: session.expiresAt,
        student: buildManualStudent()
      });
    }

    return reply.code(401).send({
      success: false,
      message: 'Invalid session'
    });
  });

  fastify.get('/api/exam', { onRequest: [authMiddleware] }, async (request, reply) => {
    const roomEnrollment = (request as any).roomEnrollment as
        | {
          enrollmentId: number;
          examId: number;
          attemptId: number | null;
          examName: string;
          courseName: string;
          durationMinutes: number;
          maxWarnings: number;
          questionPaperPath: string | null;
          studentName: string;
          studentEmail: string;
          roomCode: string;
        }
      | undefined;

    if (roomEnrollment) {
      const userId = (request as any).user?.id as number;
      const resolvedAttemptId = await resolveRoomEnrollmentAttemptId(
        fastify.pg as any,
        {
          enrollmentId: roomEnrollment.enrollmentId,
          linkedAttemptId: roomEnrollment.attemptId,
          userId,
          examId: roomEnrollment.examId
        }
      );

      const attempt = await getCompatibilityAttemptSnapshot(
        fastify.pg as any,
        resolvedAttemptId,
        roomEnrollment.maxWarnings
      );

      return reply.send({
        success: true,
        timerSeconds: roomEnrollment.durationMinutes * 60,
        questionPaper: getQuestionPaperFilename(roomEnrollment.questionPaperPath),
        student: {
          id: `room-${roomEnrollment.enrollmentId}`,
          name: roomEnrollment.studentName,
          email: roomEnrollment.studentEmail,
          exam: roomEnrollment.examName,
          courseName: roomEnrollment.courseName,
          roomCode: roomEnrollment.roomCode
        },
        attempt
      });
    }

    const exam = getManualExamSummary();

    return reply.send({
      success: true,
      timerSeconds: exam.timerSeconds,
      questionPaper: getManualQuestionPaperFilename(),
      student: exam.student,
      attempt: exam.attempt
    });
  });

  fastify.get('/api/questions', { onRequest: [authMiddleware] }, async (_request, reply) => {
    return reply.send(MANUAL_PROCTORING_QUESTIONS);
  });

  logger.info('Manual proctoring compatibility routes registered');
});
