// ============================================================================
// WebSocket Proxy Plugin
// Bidirectional WebSocket proxy to AI proctoring service
// ============================================================================

import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';
import crypto from 'crypto';
import { WSHandler } from '../websocket/ws.handler';
import { authenticateWS, canAccessAttempt } from '../websocket/ws.auth';
import { createViolationService } from '../modules/violation/violation.service';
import { SignatureService } from '../modules/security/signature.service';
import { ReplayPreventionService } from '../modules/security/replay-prevention.service';
import logger from '../config/logger';
import type { ClientMessage, AIMessage } from '../websocket/ws.types';

// Helper to generate UUID
function uuidv4(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Plugin Configuration
// ============================================================================

export interface WebSocketProxyOptions {
  prefix?: string;
  aiServiceUrl?: string;
}

// ============================================================================
// WebSocket Proxy Plugin
// ============================================================================

export default fp<WebSocketProxyOptions>(async (fastify: FastifyInstance, options: WebSocketProxyOptions) => {
  const {
    prefix = '/ws',
    aiServiceUrl = process.env.AI_SERVICE_URL || 'ws://localhost:8000/proctor'
  } = options;

  const handler = new WSHandler();
  const violationService = createViolationService(fastify.pg as any);

  // Get security services
  // @ts-ignore
  const signatureService: SignatureService = fastify.security?.signatureService;
  // @ts-ignore
  const replayPrevention: ReplayPreventionService = fastify.security?.replayPreventionService;

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  // Violation detected - store in database
  handler.on('violation:detected', async ({ session, message }: { session: any; message: any }) => {
    if (message.type !== 'violation' || !message.flag) {
      return; // Only store actual violations
    }

    try {
      await violationService.recordViolation(
        {
          attemptId: session.attemptId,
          violationType: message.violations[0] || 'unknown',
          severity: 'warning',
          detail: message.message,
          metadata: message.details,
          sessionId: session.sessionId,
          timestamp: message.timestamp
        },
        session.userId,
        signatureService
      );

      // Broadcast to teacher dashboards
      handler.broadcastViolation({
        attemptId: session.attemptId,
        violation: message
      });
    } catch (error) {
      logger.error('Failed to record violation:', error);
    }
  });

  // Client disconnected - close AI connection
  handler.on('client:disconnected', async ({ session }: { session: any }) => {
    try {
      // Store session end time
      await fastify.pg.query(
        `UPDATE proctoring_sessions
        SET session_end = NOW()
        WHERE attempt_id = $1 AND session_end IS NULL`,
        [session.attemptId]
      );
    } catch (error) {
      logger.error('Failed to update session end time:', error);
    }

    // Close AI connection
    if (session.aiConnection?.isConnected) {
      try {
        session.aiConnection.socket.close();
      } catch (error) {
        logger.error('Failed to close AI connection:', error);
      }
    }

    // Clean up session
    await handler.closeSession(session.sessionId);
  });

  // AI unavailable - notify client
  handler.on('ai:unavailable', ({ session }: { session: any }) => {
    handler.sendToClient(session.sessionId, {
      type: 'error',
      error: 'AI Service Unavailable',
      message: 'Proctoring service is not connected. Frames are not being monitored.',
      timestamp: Date.now()
    });
  });

  // ==========================================================================
  // Create WebSocket Server
  // ==========================================================================

  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade to WebSocket
  fastify.server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);

    // Only handle WebSocket requests for our prefix
    if (!url.pathname.startsWith(`${prefix}/proctor`)) {
      return;
    }

    wss.handleUpgrade(request, socket as any, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  // ==========================================================================
  // Handle Incoming WebSocket Connections
  // ==========================================================================

  wss.on('connection', async (ws, request) => {
    try {
      // Authenticate connection
      const user = await authenticateWS(request as any);

      // Get session parameters from query
      const requestUrl = new URL(request.url || '', `http://${request.headers.host}`);
      const attemptId = requestUrl.searchParams.get('attemptId') || undefined;
      const sessionId = requestUrl.searchParams.get('sessionId') || undefined;

      if (!attemptId) {
        ws.close(1008, 'Missing attemptId parameter');
        return;
      }

      const attemptIdNum = parseInt(attemptId, 10);

      // Verify access
      const canAccess = await canAccessAttempt(fastify.pg, user, attemptIdNum);

      if (!canAccess) {
        ws.close(1008, 'Access denied');
        return;
      }

      // Get exam info
      const examResult = await fastify.pg.query(
        `SELECT e.id as exam_id, ea.id as attempt_id, ea.status
        FROM exam_attempts ea
        JOIN exams e ON ea.exam_id = e.id
        WHERE ea.id = $1`,
        [attemptIdNum]
      );

      if (examResult.rows.length === 0) {
        ws.close(1008, 'Attempt not found');
        return;
      }

      const attempt = examResult.rows[0];

      if (attempt.status !== 'in_progress') {
        ws.close(1008, 'Attempt is not in progress');
        return;
      }

      // Generate session ID if not provided
      const finalSessionId = sessionId || uuidv4();

      // Create or get session
      let session = handler.getSession(finalSessionId);

      if (!session) {
        session = await handler.createSession({
          attemptId: attemptIdNum,
          userId: user.id,
          examId: attempt.exam_id,
          sessionId: finalSessionId,
          ipAddress: (request as any).socket.remoteAddress,
          userAgent: request.headers['user-agent'] || 'unknown'
        });

        // Create proctoring session record
        await fastify.pg.query(
          `INSERT INTO proctoring_sessions (attempt_id, session_start, ai_service_connected, client_info)
          VALUES ($1, NOW(), false, $2)`,
          [
            attemptIdNum,
            JSON.stringify({
              userId: user.id,
              ipAddress: (request as any).socket.remoteAddress,
              userAgent: request.headers['user-agent']
            })
          ]
        );
      }

      // Register client connection
      handler.registerClientConnection(
        ws as any,
        finalSessionId,
        {
          userId: user.id,
          attemptId: attemptIdNum,
          ipAddress: (request as any).socket.remoteAddress,
          userAgent: request.headers['user-agent'] || 'unknown'
        }
      );

      // Connect to AI service
      await connectToAIService(finalSessionId);

      // Send session ID to client
      ws.send(JSON.stringify({
        type: 'status',
        status: 'ready',
        sessionId: finalSessionId,
        timestamp: Date.now()
      }));

      // Handle messages from client
      ws.on('message', async (data: Buffer) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());

          // Verify signature if provided
          if (message.type === 'frame' && message.signature && signatureService) {
            const frameBuffer = Buffer.from(message.frame, 'base64');

            const isValid = signatureService.verifySignature(
              frameBuffer,
              message.signature,
              message.timestamp
            );

            if (!isValid) {
              logger.warn(`Invalid frame signature from session ${finalSessionId}`);
              return;
            }

            // Check replay prevention
            const isReplay = !replayPrevention.trackFrame(
              finalSessionId,
              message.sequence,
              message.timestamp
            );

            if (isReplay) {
              logger.warn(`Replay attack detected from session ${finalSessionId}`);
              return;
            }
          }

          await handler.handleClientMessage(finalSessionId, message);
        } catch (error) {
          logger.error(`Error handling message from session ${finalSessionId}:`, error);
        }
      });

      // Handle disconnect
      ws.on('close', () => {
        handler.handleClientDisconnect(ws as any);
      });

    } catch (error) {
      logger.error('WebSocket connection error:', error);

      try {
        ws.close(1008, (error as Error).message);
      } catch {
        // Ignore
      }
    }
  });

  // ==========================================================================
  // Helper: Connect to AI Service
  // ==========================================================================

  async function connectToAIService(sessionId: string): Promise<void> {
    const session = handler.getSession(sessionId);

    if (!session) {
      logger.error(`Session ${sessionId} not found when connecting to AI`);
      return;
    }

    try {
      const aiWs = new WebSocket(aiServiceUrl);

      aiWs.on('open', () => {
        logger.info(`Connected to AI service for session ${sessionId}`);

        try {
          handler.registerAIConnection(aiWs as any, sessionId);

          // Update database
          fastify.pg.query(
            `UPDATE proctoring_sessions SET ai_service_connected = true WHERE attempt_id = $1`,
            [session.attemptId]
          );
        } catch (error) {
          logger.error('Error registering AI connection:', error);
        }
      });

      aiWs.on('message', (data: Buffer) => {
        try {
          const message: AIMessage = JSON.parse(data.toString());
          handler.handleAIMessage(sessionId, message);
        } catch (error) {
          logger.error(`Error handling AI message for session ${sessionId}:`, error);
        }
      });

      aiWs.on('close', () => {
        logger.warn(`AI service disconnected for session ${sessionId}`);
        handler.handleAIDisconnect(aiWs as any);
      });

      aiWs.on('error', (error) => {
        logger.error(`AI service error for session ${sessionId}:`, error);
      });

    } catch (error) {
      logger.error(`Failed to connect to AI service for session ${sessionId}:`, error);

      // Notify client
      handler.sendToClient(sessionId, {
        type: 'error',
        error: 'ai_connection_failed',
        message: 'Failed to connect to AI proctoring service',
        timestamp: Date.now()
      });
    }
  }

  // ==========================================================================
  // Decorate Fastify
  // ==========================================================================

  fastify.decorate('wsHandler', handler);

  // ==========================================================================
  // Cleanup on close
  // ==========================================================================

  fastify.addHook('onClose', async () => {
    // Close all sessions
    const stats = handler.getStats();
    logger.info(`Closing ${stats.totalSessions} proctoring sessions...`);

    // Sessions are cleaned up individually
    wss.close();
  });

  // Periodic cleanup
  const cleanupInterval = setInterval(() => {
    handler.cleanupStaleSessions(300000); // 5 minutes
  }, 60000); // Every minute

  cleanupInterval.unref();

  logger.info('✅ WebSocket proxy plugin registered');
}, {
  name: 'websocket-proxy'
});
