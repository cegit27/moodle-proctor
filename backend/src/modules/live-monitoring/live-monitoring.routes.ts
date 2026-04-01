import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../middleware/auth.middleware';
import { liveMonitoringStore } from './live-monitoring.store';

function normalizeMimeType(value: unknown): string {
  return value === 'image/png' ? 'image/png' : 'image/jpeg';
}

export default fp(async (fastify: FastifyInstance) => {
  fastify.post('/api/live-monitoring/rooms/:roomCode/frame', {
    onRequest: [authMiddleware],
    schema: {
      params: {
        type: 'object',
        properties: {
          roomCode: { type: 'string' },
        },
        required: ['roomCode'],
      },
      body: {
        type: 'object',
        properties: {
          imageBase64: { type: 'string' },
          mimeType: { type: 'string' },
        },
        required: ['imageBase64'],
      },
    },
    handler: async (request, reply) => {
      const { roomCode } = request.params as { roomCode: string };
      const { imageBase64, mimeType } = request.body as {
        imageBase64: string;
        mimeType?: string;
      };
      const user = (request as any).user;
      const roomEnrollment = (request as any).roomEnrollment as
        | {
            roomCode?: string;
            attemptId?: number | null;
            studentName?: string;
          }
        | undefined;

      if (!user) {
        return reply.code(401).send({
          success: false,
          error: 'Authentication required',
        });
      }

      if (roomEnrollment?.roomCode && roomEnrollment.roomCode.toUpperCase() !== roomCode.toUpperCase()) {
        return reply.code(403).send({
          success: false,
          error: 'Room code mismatch',
        });
      }

      liveMonitoringStore.upsertFrame({
        feedId: `${roomCode.toUpperCase()}:${roomEnrollment?.attemptId ?? 'no-attempt'}:${user.id}`,
        roomCode,
        attemptId: roomEnrollment?.attemptId ?? null,
        userId: user.id,
        studentName:
          roomEnrollment?.studentName ||
          [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
          user.username ||
          'Student',
        imageBase64,
        mimeType: normalizeMimeType(mimeType),
      });

      return {
        success: true,
        data: {
          roomCode,
          updatedAt: Date.now(),
        },
      };
    },
  });

  fastify.get('/api/live-monitoring/rooms/:roomCode/frames', {
    onRequest: [authMiddleware],
    schema: {
      params: {
        type: 'object',
        properties: {
          roomCode: { type: 'string' },
        },
        required: ['roomCode'],
      },
      querystring: {
        type: 'object',
        properties: {
          since: { type: 'number' },
        },
      },
    },
    handler: async (request, reply) => {
      const { roomCode } = request.params as { roomCode: string };
      const { since } = request.query as { since?: number };
      const user = (request as any).user;

      if (!user || user.role !== 'teacher') {
        return reply.code(403).send({
          success: false,
          error: 'Teacher access required',
        });
      }

      const snapshot = liveMonitoringStore.getRoomFrames(roomCode, since);

      return {
        success: true,
        data: {
          roomUpdatedAt: snapshot.roomUpdatedAt,
          activeFeedIds: snapshot.activeFeedIds,
          frames: snapshot.frames.map(frame => ({
            feedId: frame.feedId,
            roomCode: frame.roomCode,
            attemptId: frame.attemptId,
            userId: frame.userId,
            studentName: frame.studentName,
            imageDataUrl: `data:${frame.mimeType};base64,${frame.imageBase64}`,
            updatedAt: frame.updatedAt,
          })),
        },
      };
    },
  });
});
