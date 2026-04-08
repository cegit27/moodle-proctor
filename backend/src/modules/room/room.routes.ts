// ============================================================================
// Room Module - Routes
// API endpoints for proctoring room operations
// ============================================================================

import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import {
  createProctoringRoomService,
  generateEnrollmentSignature,
  RoomNotJoinableError
} from './room.service';
import { authMiddleware } from '../../middleware/auth.middleware';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomResponse,
  StudentJoinRequest,
  StudentJoinResponse,
  ActiveRoomsResponse,
  CloseRoomResponse,
  DeleteRoomResponse,
  RoomMonitoringStudentsResponse
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
          examId: { type: 'number' },
          capacity: { type: 'number', minimum: 1, maximum: 100 }
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
          teacherId,
          capacity: body.capacity
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
  // POST /api/room/:code/validate-token - Validate JWT token and return room info
  // ==========================================================================
  // NOTE: No authentication required - the JWT token IS the authentication

  fastify.post('/api/room/:code/validate-token', {
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
          token: { type: 'string' }
        },
        required: ['token']
      }
    },
    handler: async (request, reply) => {
    const { code } = request.params as { code: string };
    const { token } = request.body as { token: string };

    try {
      // Verify JWT token using Fastify's JWT plugin
      const decoded = fastify.jwt.verify(token) as any;

      // Check if token matches this room (case-insensitive)
      if (decoded.roomCode?.toUpperCase() !== code.toUpperCase()) {
        return reply.code(403).send({
          success: false,
          error: 'Token does not match this room'
        });
      }

      // Check if token is expired (jwt.verify should handle this, but double-check)
      if (decoded.exp && decoded.exp < Date.now() / 1000) {
        return reply.code(403).send({
          success: false,
          error: 'Token has expired'
        });
      }

      // Get room info with current enrollment count
      const roomResult = await fastify.pg.query(
        `SELECT r.id, r.room_code, r.capacity, r.status,
                COUNT(e.id) as current_enrolled
         FROM proctoring_rooms r
         LEFT JOIN proctoring_room_students e ON e.room_id = r.id
         WHERE r.room_code = $1
         GROUP BY r.id`,
        [code.toUpperCase()]
      );

      if (roomResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Room not found'
        });
      }

      const room = roomResult.rows[0];

      // Check if room is active
      if (room.status !== 'activated') {
        return reply.code(400).send({
          success: false,
          error: 'Room is not active'
        });
      }

      // Check capacity (prevent over-enrollment at validation stage)
      const currentEnrolled = parseInt(room.current_enrolled) || 0;
      if (currentEnrolled >= room.capacity) {
        return reply.code(429).send({
          success: false,
          error: `Room is full (${currentEnrolled}/${room.capacity} students enrolled)`
        });
      }

      return reply.send({
        success: true,
        data: {
          roomId: room.id,
          roomCode: room.room_code,
          capacity: room.capacity,
          currentEnrolled: currentEnrolled,
          userId: decoded.userId
        }
      });

    } catch (error) {
      const errorObj = error as any;

      if (errorObj.name === 'JsonWebTokenError' || errorObj.code === 'FAST_JWT_NO_ACTIVE') {
        return reply.code(403).send({
          success: false,
          error: 'Invalid token'
        });
      }

      if (errorObj.name === 'TokenExpiredError') {
        return reply.code(403).send({
          success: false,
          error: 'Token has expired'
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

      try {
        // 1. Get room details (validates room exists)
        const room = await roomService.getRoomByCode(code);

        if (room.status !== 'activated') {
          throw new RoomNotJoinableError(room.room_code, room.status);
        }

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
        const errorObj = error as any;

        // Handle specific error types with clear messages
        if (errorObj.name === 'RoomNotFoundError') {
          return reply.code(404).send({
            success: false,
            error: 'Invalid invite code'
          });
        }

        if (errorObj.name === 'DuplicateEnrollmentError') {
          return reply.code(409).send({
            success: false,
            error: 'You are already enrolled in this room'
          });
        }

        if (
          errorObj.name === 'RoomNotJoinableError' ||
          errorObj.name === 'AttemptAlreadyCompletedError'
        ) {
          return reply.code(409).send({
            success: false,
            error: errorObj.message
          });
        }

        if (errorObj.name === 'RoomFullError') {
          return reply.code(429).send({
            success: false,
            error: 'This room is full. Please contact the instructor.'
          });
        }

        // Database-specific error handling
        if (errorObj.code === 'ECONNREFUSED' ||
            errorObj.code === 'CONNECTION_ERROR' ||
            (errorObj.severity?.startsWith('ERROR') && errorObj.routine?.startsWith('SendRequest'))) {
          fastify.log.error({ error }, 'Database connection failed during student join');
          return reply.code(503).send({
            success: false,
            error: 'Unable to connect to the database. Please try again in a moment.'
          });
        }

        // Generic error handler (catches all other errors)
        fastify.log.error({ error }, 'Error during student join');
        return reply.code(500).send({
          success: false,
          error: 'Failed to join room. Please try again.'
        });
      }
    }
  });

  // ==========================================================================
  // GET /api/room/:id/students - Get room-scoped monitoring students
  // ==========================================================================

  fastify.get('/api/room/:id/students', {
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
    handler: async (request, reply): Promise<RoomMonitoringStudentsResponse> => {
      // @ts-ignore
      const teacherId = request.user.id;
      const { id } = request.params as { id: string };

      try {
        const roomId = parseInt(id, 10);
        const students = await roomService.getMonitoringStudents(roomId, teacherId);

        return {
          success: true,
          data: students.map(student => ({
            enrollmentId: student.enrollmentId,
            roomId: student.roomId,
            attemptId: student.attemptId,
            userId: student.userId,
            studentName: student.studentName,
            studentEmail: student.studentEmail,
            status: student.status,
            startedAt: student.startedAt?.toISOString() ?? null,
            submittedAt: student.submittedAt?.toISOString() ?? null,
            ipAddress: student.ipAddress,
            warningCount: Number(student.warningCount) || 0,
            totalViolationCount: Number(student.totalViolationCount) || 0
          }))
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

        throw error;
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
            examId: room.exam_id,
            roomCode: room.room_code,
            examName: room.exam_name,
            courseName: room.course_name,
            studentCount: room.student_count,
            capacity: room.capacity,
            durationMinutes: room.duration_minutes,
            createdAt: room.created_at.toISOString(),
            activatedAt: room.activated_at?.toISOString() ?? null
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
  // PUT /api/room/:id - Update room capacity (teacher only)
  // ==========================================================================

  fastify.put('/api/room/:id', {
    onRequest: [authMiddleware],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          capacity: { type: 'number', minimum: 1, maximum: 100 }
        },
        required: ['capacity']
      }
    },
    handler: async (request, reply) => {
    // @ts-ignore
    const teacherId = request.user.id;
    const { id } = request.params as { id: string };
    const { capacity } = request.body as { capacity: number };

    try {
      const roomId = parseInt(id, 10);

      // Verify room exists and ownership
      const roomResult = await fastify.pg.query(
        'SELECT id, teacher_id, capacity FROM proctoring_rooms WHERE id = $1',
        [roomId]
      );

      if (roomResult.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'Room not found'
        });
      }

      const room = roomResult.rows[0];

      // Verify ownership
      if (room.teacher_id !== teacherId) {
        return reply.code(403).send({
          success: false,
          error: 'You do not own this room'
        });
      }

      // Update capacity
      const updateResult = await fastify.pg.query(
        'UPDATE proctoring_rooms SET capacity = $1 WHERE id = $2 RETURNING *',
        [capacity, roomId]
      );

      return reply.send({
        success: true,
        data: updateResult.rows[0]
      });

    } catch (error) {
      const errorObj = error as any;

      // Database-specific error handling
      if (errorObj.code === 'ECONNREFUSED' ||
          errorObj.code === 'CONNECTION_ERROR') {
        fastify.log.error({ error }, 'Database connection failed during room update');
        return reply.code(503).send({
          success: false,
          error: 'Unable to connect to the database. Please try again in a moment.'
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

  fastify.delete('/api/room/:id', {
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
    handler: async (request, reply): Promise<DeleteRoomResponse> => {
      // @ts-ignore
      const teacherId = request.user.id;
      const { id } = request.params as { id: string };

      try {
        const roomId = parseInt(id, 10);
        await roomService.deleteRoom(roomId, teacherId);

        return {
          success: true,
          data: {
            roomId,
            deleted: true
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

        throw error;
      }
    }
  });
});
