// ============================================================================
// Room Module - Routes
// API endpoints for proctoring room operations
// ============================================================================

import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { createProctoringRoomService } from './room.service';
import { authMiddleware } from '../../middleware/auth.middleware';
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomResponse,
  ActiveRoomsResponse,
  CloseRoomResponse
} from './room.schema';

// ============================================================================
// Routes Plugin
// ============================================================================

export default fp(async (fastify: FastifyInstance) => {
  const roomService = createProctoringRoomService(fastify.pg as any);

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
  // GET /api/room/active - Get teacher's active rooms
  // ==========================================================================

  fastify.get('/api/room/active', {
    onRequest: [authMiddleware],
    handler: async (request, reply): Promise<ActiveRoomsResponse> => {
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
