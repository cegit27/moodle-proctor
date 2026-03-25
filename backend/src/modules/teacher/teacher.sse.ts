// ============================================================================
// Teacher Module - Server-Sent Events
// Real-time updates for teacher dashboard
// ============================================================================

import fp from 'fastify-plugin';
import { EventEmitter } from 'events';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../websocket/ws.auth';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AIMessage } from '../../websocket/ws.types';

// ============================================================================
// SSE Event Types
// ============================================================================

interface SSEEvent {
  type: 'violation' | 'attempt_status' | 'exam_start' | 'exam_end' | 'student_action' | 'student_joined' | 'student_left' | 'student_warned' | 'student_kicked';
  data: Record<string, unknown>;
  timestamp: number;
}

interface SSEClient {
  userId: number;
  reply: FastifyReply;
  filters: {
    roomId?: number; // Issue #2: Room-scoped filtering (replaces examId)
    examId?: number; // Backwards compatibility
    userId?: number;
  };
  isConnected: boolean;
}

// ============================================================================
// SSE Manager
// ============================================================================

class SSEManager extends EventEmitter {
  private clients = new Map<FastifyReply, SSEClient>();

  /**
   * Add a new SSE client
   * Issue #2: Support room-scoped filtering
   */
  addClient(reply: FastifyReply, userId: number, filters: { roomId?: number; examId?: number; userId?: number }): void {
    const client: SSEClient = {
      userId,
      reply,
      filters,
      isConnected: true
    };

    this.clients.set(reply, client);

    // Send initial connection event
    this.sendToClient(reply, {
      type: 'student_action',
      data: {
        action: 'connected',
        message: filters.roomId
          ? `Connected to room ${filters.roomId}`
          : 'Connected to real-time updates',
        roomId: filters.roomId
      },
      timestamp: Date.now()
    });

    // Handle client disconnect
    reply.raw.on('close', () => {
      this.removeClient(reply);
    });
  }

  /**
   * Remove a client
   */
  removeClient(reply: FastifyReply): void {
    const client = this.clients.get(reply);
    if (client) {
      client.isConnected = false;
      this.clients.delete(reply);
    }
  }

  /**
   * Send event to a specific client
   */
  private sendToClient(reply: FastifyReply, event: SSEEvent): boolean {
    const client = this.clients.get(reply);

    if (!client?.isConnected) {
      return false;
    }

    try {
      // Format SSE message
      const message = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\nid: ${event.timestamp}\n\n`;

      // Write to response
      reply.raw.write(message);

      return true;
    } catch (error) {
      console.error('Failed to send SSE event:', error);
      this.removeClient(reply);
      return false;
    }
  }

  /**
   * Broadcast event to all matching clients
   * Issue #2: Room-scoped filtering - only send to clients monitoring this room
   */
  broadcast(event: SSEEvent, filters?: { roomId?: number; examId?: number; userId?: number }): void {
    for (const [reply, client] of this.clients.entries()) {
      // Check if client should receive this event
      // Priority: roomId > examId > userId (room is most specific)

      // Room-scoped filtering (Issue #2)
      if (filters?.roomId && client.filters.roomId) {
        if (filters.roomId !== client.filters.roomId) {
          continue; // Different room, skip
        }
      } else if (filters?.roomId && !client.filters.roomId) {
        continue; // Event has roomId but client not in room, skip
      } else if (!filters?.roomId && client.filters.roomId) {
        continue; // Client in room but event has no roomId, skip (backwards compat: check examId below)
      }

      // Backwards compatibility: examId filtering
      if (!filters?.roomId && !client.filters.roomId) {
        // Only check examId if neither event nor client has roomId
        if (filters?.examId && client.filters.examId && filters.examId !== client.filters.examId) {
          continue;
        }
      }

      // User filtering (for targeted events like warnings)
      if (filters?.userId && client.filters.userId && filters.userId !== client.filters.userId) {
        continue;
      }

      this.sendToClient(reply, event);
    }

    // Also emit for logging/monitoring
    this.emit('broadcast', event, filters);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalClients: number;
    connectedClients: number;
  } {
    const connectedClients = Array.from(this.clients.values()).filter(c => c.isConnected).length;

    return {
      totalClients: this.clients.size,
      connectedClients
    };
  }

  /**
   * Remove all clients for a specific user
   */
  disconnectUser(userId: number): void {
    for (const [reply, client] of this.clients.entries()) {
      if (client.userId === userId) {
        try {
          reply.raw.end();
        } catch {
          // Ignore errors during cleanup
        }
        this.removeClient(reply);
      }
    }
  }
}

// ============================================================================
// SSE Routes Plugin
// ============================================================================

const sseManager = new SSEManager();

export default fp(async (fastify: FastifyInstance) => {
  // ==========================================================================
  // SSE Endpoint
  // ==========================================================================

  /**
   * SSE endpoint for real-time updates
   * Issue #2: Accept room_id parameter for room-scoped alerts
   */
  fastify.get('/api/teacher/events', {
    onRequest: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    // Get filters from query
    // Issue #2: Support room_id for room-based monitoring
    const roomId = (request.query as any).room_id ? parseInt((request.query as any).room_id, 10) : undefined;
    const examId = (request.query as any).examId ? parseInt((request.query as any).examId, 10) : undefined;
    const userId = (request.query as any).userId ? parseInt((request.query as any).userId, 10) : undefined;

    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');

    // Issue #2: Disconnect old SSE connection before creating new one (prevent memory leak)
    if (roomId) {
      sseManager.disconnectUser(user.id);
    }

    // Add client to manager
    sseManager.addClient(reply, user.id, { roomId, examId, userId });

    // Send periodic heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        const heartbeatMessage = `event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\nid: ${Date.now()}\n\n`;
        reply.raw.write(heartbeatMessage);
      } catch {
        clearInterval(heartbeatInterval);
      }
    }, 15000); // Every 15 seconds

    // Cleanup on disconnect
    reply.raw.on('close', () => {
      clearInterval(heartbeatInterval);
    });

    // Keep connection open
    return reply.raw;
  });

  // ==========================================================================
  // Test Endpoint (for development)
  // ==========================================================================

  /**
   * Test endpoint to trigger SSE events
   */
  fastify.post('/api/teacher/events/test', {
    onRequest: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    const { eventType, data, filters } = request.body as {
      eventType: 'violation' | 'attempt_status' | 'exam_start' | 'exam_end';
      data: Record<string, unknown>;
      filters?: { examId?: number; userId?: number };
    };

    // Broadcast test event
    sseManager.broadcast({
      type: eventType,
      data,
      timestamp: Date.now()
    }, filters);

    return reply.send({
      success: true,
      message: 'Test event broadcasted',
      stats: sseManager.getStats()
    });
  });

  // ==========================================================================
  // Statistics Endpoint
  // ==========================================================================

  /**
   * Get SSE connection statistics
   */
  fastify.get('/api/teacher/events/stats', {
    onRequest: [authMiddleware]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;

    // Verify teacher role
    requireRole(user, ['teacher']);

    return reply.send({
      success: true,
      data: sseManager.getStats()
    });
  });

  // ==========================================================================
  // Decorate Fastify Instance
  // ==========================================================================

  fastify.decorate('sseManager', sseManager);

  // ==========================================================================
  // Integration with WebSocket Handler
  // ==========================================================================

  // Listen to WebSocket events and broadcast to SSE clients
  const wsHandler = (fastify as any).wsHandler;

  if (wsHandler) {
    // Violation detected
    wsHandler.on('violation:broadcast', (data: { attemptId: number; violation: AIMessage }) => {
      if (data.violation.type === 'violation') {
        sseManager.broadcast({
          type: 'violation',
          data: {
            attemptId: data.attemptId,
            violations: data.violation.violations,
            details: data.violation.details
          },
          timestamp: Date.now()
        });
      }
    });

    // Client connected (student started exam)
    wsHandler.on('client:connected', (data: { session: any; connection: any }) => {
      sseManager.broadcast({
        type: 'exam_start',
        data: {
          attemptId: data.session.attemptId,
          userId: data.session.userId,
          examId: data.session.examId,
          sessionId: data.session.sessionId
        },
        timestamp: Date.now()
      }, {
        examId: data.session.examId
      });
    });

    // Client disconnected (student stopped exam)
    wsHandler.on('client:disconnected', (data: { session: any }) => {
      sseManager.broadcast({
        type: 'exam_end',
        data: {
          attemptId: data.session.attemptId,
          userId: data.session.userId,
          examId: data.session.examId,
          sessionId: data.session.sessionId
        },
        timestamp: Date.now()
      }, {
        examId: data.session.examId
      });
    });
  }

  // ==========================================================================
  // Cleanup on Shutdown
  // ==========================================================================

  fastify.addHook('onClose', async () => {
    // Disconnect all SSE clients
    for (const [reply] of sseManager['clients'].entries()) {
      try {
        reply.raw.end();
      } catch {
        // Ignore errors during shutdown
      }
    }
  });
});

// ============================================================================
// Export SSE Manager for External Use
// ============================================================================

export { sseManager, SSEManager };
export type { SSEEvent, SSEClient };
