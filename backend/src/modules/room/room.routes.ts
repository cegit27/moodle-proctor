// ============================================================================
// Room Module - Routes
// API endpoints for proctoring room operations
// ============================================================================

import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { createProctoringRoomService, generateEnrollmentSignature } from './room.service';
import { authMiddleware } from '../../middleware/auth.middleware';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomResponse,
  StudentJoinRequest,
  StudentJoinResponse,
  ActiveRoomsResponse,
  CloseRoomResponse
} from './room.schema';

// ============================================================================
// Rate Limiter Configuration
// ============================================================================

const joinRateLimitConfig = {
  max: 10, // Maximum 10 requests
  timeWindow: '1 minute', // Per minute
  allowList: [], // No IP exceptions
  continueExceeding: true, // Don't ban, just slow down
  skipOnError: true, // Allow requests if rate limiter fails
};

// ============================================================================
// Routes Plugin
// ============================================================================

export default fp(async (fastify: FastifyInstance) => {
  const roomService = createProctoringRoomService(fastify.pg as any);

  // Register rate limiter plugin
  await fastify.register(import('@fastify/rate-limit'), {
    global: false, // Don't apply to all routes
  });

  // ==========================================================================
  // POST /api/room/create - Create a new proctoring room
  // ==========================================================================

  fastify.post('/api/room/create', {
    onRequest: [authMiddleware],
    schema: {
      body: {
        type: 'object',
        properties: {
          examId: { type: 'number' }
        },
        required: ['examId']
      }
    },
    handler: async (request, reply): Promise<CreateRoomResponse> => {
      // @ts-ignore
      const teacherId = request.user.id;
      const body = request.body as CreateRoomRequest;

      try {
        const room = await roomService.createRoom({
          examId: body.examId,
          teacherId
        });

        // Get exam details for response
        const examResult = await fastify.pg.query(
          'SELECT exam_name, course_name FROM exams WHERE id = $1',
          [room.exam_id]
        );

        const exam = examResult.rows[0];

        return {
          success: true,
          data: {
            roomId: room.id,
            roomCode: room.room_code,
            inviteLink: `proctor://room/${room.room_code}`,
            examName: exam.exam_name,
            courseName: exam.course_name
          }
        };
      } catch (error) {
        if ((error as Error).name === 'ExamNotFoundError') {
          return reply.code(404).send({
            success: false,
            error: 'Exam not found'
          });
        }

        if ((error as Error).name === 'NotEnrolledError') {
          return reply.code(403).send({
            success: false,
            error: 'You are not enrolled in this exam'
          });
        }

        if ((error as Error).name === 'CapacityExceededError') {
          return reply.code(429).send({
            success: false,
            error: (error as Error).message
          });
        }

        if ((error as Error).name === 'RoomCollisionError') {
          return reply.code(500).send({
            success: false,
            error: 'Failed to generate unique room code. Please try again.'
          });
        }

        throw error;
      }
    }
  });

  // ==========================================================================
  // GET /api/room/:code - Get room by code (for student joins)
  // ==========================================================================

  fastify.get('/api/room/:code', {
    onRequest: [authMiddleware],
    schema: {
      params: {
        type: 'object',
        properties: {
          code: { type: 'string' }
        },
        required: ['code']
      }
    },
    handler: async (request, reply): Promise<JoinRoomResponse> => {
      const { code } = request.params as { code: string };

      try {
        const room = await roomService.getRoomByCode(code);

        return {
          success: true,
          data: {
            roomId: room.id,
            examName: room.exam_name,
            courseName: room.course_name,
            status: room.status
          }
        };
      } catch (error) {
        if ((error as Error).name === 'RoomNotFoundError') {
          return reply.code(404).send({
            success: false,
            error: 'Invalid invite link'
          });
        }

        throw error;
      }
    }
  });

  // ==========================================================================
  // POST /api/room/:code/join - Student joins a room with invite code
  // ==========================================================================

  fastify.post('/api/room/:code/join', {
    config: {
      rateLimit: joinRateLimitConfig,
    },
    schema: {
      params: {
        type: 'object',
        properties: {
          code: { type: 'string' }
        },
        required: ['code']
      },
      body: {
        type: 'object',
        properties: {
          studentName: { type: 'string' },
          studentEmail: { type: 'string' }
        },
        required: ['studentName', 'studentEmail']
      }
    },
    handler: async (request, reply): Promise<StudentJoinResponse> => {
      const { code } = request.params as { code: string };
      const body = request.body as StudentJoinRequest;

      // Validate CSRF token for state-changing operation
      // @ts-ignore - fastify-csrf-protection decorates the request object
      await reply.csrfProtection(request, reply);

      try {
        // 1. Get room details (validates room exists)
        const room = await roomService.getRoomByCode(code);

        // 2. Get or create user
        const user = await roomService.getOrCreateUserByEmail(
          body.studentEmail,
          body.studentName
        );

        // 3. Enroll student in room
        const enrollment = await roomService.enrollStudent({
          roomId: room.id,
          userId: user.id,
          studentName: body.studentName,
          studentEmail: body.studentEmail
        });

        // Generate signature to prevent enrollment ID tampering
        const enrollmentSignature = generateEnrollmentSignature(enrollment.id, room.id);

        return {
          success: true,
          data: {
            enrollmentId: enrollment.id,
            roomId: room.id,
            roomCode: room.room_code,
            examName: room.exam_name,
            courseName: room.course_name,
            status: room.status,
            enrollmentSignature // Include signature for validation
          }
        };
      } catch (error) {
        // Handle specific error types with clear messages
        if ((error as Error).name === 'RoomNotFoundError') {
          return reply.code(404).send({
            success: false,
            error: 'Invalid invite code'
          });
        }

        if ((error as Error).name === 'DuplicateEnrollmentError') {
          return reply.code(409).send({
            success: false,
            error: 'You are already enrolled in this room'
          });
        }

        if ((error as Error).name === 'RoomFullError') {
          return reply.code(429).send({
            success: false,
            error: 'This room is full. Please contact the instructor.'
          });
        }

        // Generic error handler (catches database connection issues)
        fastify.log.error({ error }, 'Error during student join');
        return reply.code(500).send({
          success: false,
          error: 'Failed to join room. Please try again.'
        });
      }
    }
  });

  // ==========================================================================
  // GET /api/room/active - Get teacher's active rooms
  // ==========================================================================

  fastify.get('/api/room/active', {
    onRequest: [authMiddleware],
    handler: async (request): Promise<ActiveRoomsResponse> => {
      // @ts-ignore
      const teacherId = request.user.id;

      try {
        const rooms = await roomService.getActiveRooms(teacherId);

        return {
          success: true,
          data: rooms.map(room => ({
            id: room.id,
            roomCode: room.room_code,
            examName: room.exam_name,
            studentCount: room.student_count,
            durationMinutes: room.duration_minutes,
            createdAt: room.created_at.toISOString()
          }))
        };
      } catch (error) {
        throw error;
      }
    }
  });

  // ==========================================================================
  // POST /api/room/:id/activate - Activate a room (teacher navigates to dashboard)
  // ==========================================================================

  fastify.post('/api/room/:id/activate', {
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
      const teacherId = request.user.id;
      const { id } = request.params as { id: string };

      try {
        const roomId = parseInt(id, 10);
        const room = await roomService.activateRoom(roomId, teacherId);

        return {
          success: true,
          data: {
            roomId: room.id,
            status: room.status
          }
        };
      } catch (error) {
        if ((error as Error).name === 'RoomNotFoundError') {
          return reply.code(404).send({
            success: false,
            error: 'Room not found'
          });
        }

        if ((error as Error).name === 'NotRoomOwnerError') {
          return reply.code(403).send({
            success: false,
            error: 'You are not the owner of this room'
          });
        }

        if ((error as Error).name === 'InvalidStateTransitionError') {
          return reply.code(400).send({
            success: false,
            error: (error as Error).message
          });
        }

        throw error;
      }
    }
  });

  // ==========================================================================
  // POST /api/room/:id/close - Close a room (teacher ends exam)
  // ==========================================================================

  fastify.post('/api/room/:id/close', {
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
    handler: async (request, reply): Promise<CloseRoomResponse> => {
      // @ts-ignore
      const teacherId = request.user.id;
      const { id } = request.params as { id: string };

      try {
        const roomId = parseInt(id, 10);
        const room = await roomService.closeRoom(roomId, teacherId);

        return {
          success: true,
          data: {
            roomId: room.id,
            status: room.status
          }
        };
      } catch (error) {
        if ((error as Error).name === 'RoomNotFoundError') {
          return reply.code(404).send({
            success: false,
            error: 'Room not found'
          });
        }

        if ((error as Error).name === 'NotRoomOwnerError') {
          return reply.code(403).send({
            success: false,
            error: 'You are not the owner of this room'
          });
        }

        if ((error as Error).name === 'InvalidStateTransitionError') {
          return reply.code(400).send({
            success: false,
            error: (error as Error).message
          });
        }

        throw error;
      }
    }
  });
});
