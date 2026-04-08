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
  getQuestionPaperFilename
} from '../room/room-enrollment.service';
import { createExamService } from '../exam/exam.service';

export default fp(async (fastify: FastifyInstance) => {
  ensureManualProctoringDirectories();
  const examService = createExamService(fastify.pg as any);

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
          attemptId: number | null;
          examName: string;
          courseName: string;
          durationMinutes: number;
          maxWarnings: number;
          enableAiProctoring: boolean;
          enableManualProctoring: boolean;
          autoSubmitOnWarningLimit: boolean;
          captureSnapshots: boolean;
          allowStudentRejoin: boolean;
          questionPaperPath: string | null;
          studentName: string;
          studentEmail: string;
          roomCode: string;
        }
      | undefined;

    if (roomEnrollment) {
      const attempt = await getCompatibilityAttemptSnapshot(
        fastify.pg as any,
        roomEnrollment.attemptId,
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
        settings: {
          enableAiProctoring: roomEnrollment.enableAiProctoring,
          enableManualProctoring: roomEnrollment.enableManualProctoring,
          autoSubmitOnWarningLimit: roomEnrollment.autoSubmitOnWarningLimit,
          captureSnapshots: roomEnrollment.captureSnapshots,
          allowStudentRejoin: roomEnrollment.allowStudentRejoin,
          maxWarnings: roomEnrollment.maxWarnings
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
      settings: {
        enableAiProctoring: true,
        enableManualProctoring: true,
        autoSubmitOnWarningLimit: true,
        captureSnapshots: true,
        allowStudentRejoin: true,
        maxWarnings: 15
      },
      attempt: exam.attempt
    });
  });

  fastify.get('/api/questions', { onRequest: [authMiddleware] }, async (request, reply) => {
    const roomEnrollment = (request as any).roomEnrollment as
      | {
          examId: number;
          user: { id: number };
        }
      | undefined;

    if (roomEnrollment) {
      const examDetails = await examService.getExamDetails(
        roomEnrollment.examId,
        roomEnrollment.user.id
      );
      const summary = await examService.getQuestionsSummary(
        roomEnrollment.examId,
        roomEnrollment.user.id
      );
      const configuredQuestions = examDetails.data.exam.questions || [];

      if (configuredQuestions.length > 0) {
        return reply.send(
          configuredQuestions.map(question => ({
            question: question.prompt,
            options: question.options || []
          }))
        );
      }

      return reply.send(
        summary.data.questions.map(question => ({
          question: question.text,
          options: []
        }))
      );
    }

    return reply.send(MANUAL_PROCTORING_QUESTIONS);
  });

  logger.info('Manual proctoring compatibility routes registered');
});
