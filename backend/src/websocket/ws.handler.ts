// ============================================================================
// WebSocket Handler
// Manages WebSocket connections and message routing
// ============================================================================

import { EventEmitter } from 'events';
import type { Pool } from 'pg';
import type { ProctoringSession, WSConnection, AIConnection } from './ws.types';
import type { ClientMessage, AIMessage } from './ws.types';
import logger from '../config/logger';

// ============================================================================
// WebSocket Handler
// ============================================================================

export class WSHandler extends EventEmitter {
  private sessions = new Map<string, ProctoringSession>();
  private connections = new Map<any, string>(); // socket -> sessionId

  constructor(private pg?: Pool) {
    super();
  }

  /**
   * Create a new proctoring session
   * Issue #3: Cache roomId in memory to prevent N+1 queries on every violation
   */
  async createSession(sessionData: {
    attemptId: number;
    userId: number;
    examId: number;
    sessionId: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<ProctoringSession> {
    // Issue #3: Look up and cache roomId when session is created
    let roomId = 0;
    if (this.pg) {
      try {
        const roomResult = await this.pg.query(
          `SELECT id FROM proctoring_rooms
           WHERE exam_id = $1
           AND status = 'activated'
           ORDER BY created_at DESC
           LIMIT 1`,
          [sessionData.examId]
        );

        if (roomResult.rows.length > 0) {
          roomId = roomResult.rows[0].id;
          logger.info(`Cached roomId ${roomId} for session ${sessionData.sessionId} (exam ${sessionData.examId})`);
        } else {
          logger.warn(`No active room found for exam ${sessionData.examId} - session ${sessionData.sessionId} will not have room context`);
        }
      } catch (error) {
        logger.error(`Failed to lookup room for session ${sessionData.sessionId}:`, error);
        // Continue without roomId - system will still work but violations won't be room-scoped
      }
    }

    const session: ProctoringSession = {
      ...sessionData,
      roomId, // Issue #3: Cached in memory
      status: 'starting',
      clientConnection: null,
      aiConnection: null,
      startTime: Date.now(),
      lastActivity: Date.now()
    };

    this.sessions.set(sessionData.sessionId, session);
    logger.info(`Created proctoring session: ${sessionData.sessionId}${roomId ? ` (room ${roomId})` : ''}`);

    return session;
  }

  /**
   * Register client connection
   */
  registerClientConnection(
    socket: any,
    sessionId: string,
    connectionData: {
      userId: number;
      attemptId: number;
      ipAddress: string;
      userAgent: string;
    }
  ): WSConnection {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const connection: WSConnection = {
      socket,
      userId: connectionData.userId,
      attemptId: connectionData.attemptId,
      sessionId,
      isConnected: true,
      lastFrameSequence: 0,
      framesProcessed: 0,
      startTime: Date.now(),
      ipAddress: connectionData.ipAddress,
      userAgent: connectionData.userAgent
    };

    session.clientConnection = connection;
    this.connections.set(socket, sessionId);

    session.status = 'active';
    session.lastActivity = Date.now();

    this.emit('client:connected', { session, connection });
    logger.info(`Client connected to session: ${sessionId}`);

    return connection;
  }

  /**
   * Register AI service connection
   */
  registerAIConnection(socket: any, sessionId: string): AIConnection {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const connection: AIConnection = {
      socket,
      isConnected: true,
      lastHeartbeat: Date.now(),
      reconnectAttempts: 0
    };

    session.aiConnection = connection;
    session.lastActivity = Date.now();

    this.emit('ai:connected', { session, connection });
    logger.info(`AI service connected for session: ${sessionId}`);

    return connection;
  }

  /**
   * Handle message from client
   */
  async handleClientMessage(sessionId: string, message: ClientMessage): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.lastActivity = Date.now();

    if (message.type === 'frame') {
      session.clientConnection!.lastFrameSequence = message.sequence;
      session.clientConnection!.framesProcessed++;

      // Forward to AI service
      if (session.aiConnection?.isConnected) {
        this.sendToAI(sessionId, message);
      } else {
        // AI not connected, buffer or error
        this.emit('ai:unavailable', { session, message });
      }
    } else if (message.type === 'start' || message.type === 'stop') {
      this.emit('client:control', { session, message });
    } else if (message.type === 'ping') {
      // Respond with pong
      this.sendToClient(sessionId, {
        type: 'status',
        status: 'ready',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle message from AI service
   */
  async handleAIMessage(sessionId: string, message: AIMessage): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      logger.warn(`Received AI message for unknown session: ${sessionId}`);
      return;
    }

    session.lastActivity = Date.now();

    if (message.type === 'violation') {
      // Issue #3: Include cached roomId in violation event for room-based routing
      // This prevents N+1 queries on every violation
      this.emit('violation:detected', {
        session,
        message,
        roomId: session.roomId, // Cached in memory - no DB query needed
        attemptId: session.attemptId,
        examId: session.examId
      });

      // Forward to client
      this.sendToClient(sessionId, message);
    } else if (message.type === 'status') {
      // Forward status to client
      this.sendToClient(sessionId, message);
    } else if (message.type === 'error') {
      logger.error(`AI error for session ${sessionId}:`, message);
      this.sendToClient(sessionId, message);
    }
  }

  /**
   * Handle client disconnection
   */
  handleClientDisconnect(socket: any): void {
    const sessionId = this.connections.get(socket);

    if (!sessionId) {
      return;
    }

    const session = this.sessions.get(sessionId);

    if (session?.clientConnection) {
      session.clientConnection.isConnected = false;
      session.clientConnection.socket = null as any;
      session.status = 'stopping';

      this.emit('client:disconnected', { session });
      logger.info(`Client disconnected from session: ${sessionId}`);
    }

    this.connections.delete(socket);
  }

  /**
   * Handle AI disconnection
   */
  handleAIDisconnect(socket: any): void {
    // Find session by AI socket
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.aiConnection?.socket === socket) {
        session.aiConnection!.isConnected = false;
        session.aiConnection!.socket = null as any;

        this.emit('ai:disconnected', { session });
        logger.warn(`AI service disconnected for session: ${sessionId}`);

        // Attempt reconnect
        this.emit('ai:reconnect', { session });
        break;
      }
    }
  }

  /**
   * Send message to client
   */
  sendToClient(sessionId: string, message: AIMessage): boolean {
    const session = this.sessions.get(sessionId);

    if (!session?.clientConnection?.isConnected) {
      return false;
    }

    try {
      session.clientConnection.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error(`Failed to send to client ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Send message to AI service
   */
  sendToAI(sessionId: string, message: ClientMessage): boolean {
    const session = this.sessions.get(sessionId);

    if (!session?.aiConnection?.isConnected) {
      return false;
    }

    try {
      session.aiConnection.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error(`Failed to send to AI ${sessionId}:`, error);
      return false;
    }
  }

  /**
   * Broadcast violation to all teacher dashboards
   */
  broadcastViolation(violationData: {
    attemptId: number;
    violation: AIMessage;
  }): void {
    this.emit('violation:broadcast', violationData);
  }

  /**
   * Get session
   */
  getSession(sessionId: string): ProctoringSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session by attempt ID
   */
  getSessionByAttempt(attemptId: number): ProctoringSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.attemptId === attemptId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    // Close client connection
    if (session.clientConnection?.isConnected) {
      try {
        session.clientConnection.socket.close();
      } catch (error) {
        logger.error(`Error closing client socket:`, error);
      }
    }

    // Close AI connection
    if (session.aiConnection?.isConnected) {
      try {
        session.aiConnection.socket.close();
      } catch (error) {
        logger.error(`Error closing AI socket:`, error);
      }
    }

    session.status = 'stopped';

    this.sessions.delete(sessionId);
    this.emit('session:closed', { session });

    logger.info(`Closed proctoring session: ${sessionId}`);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    totalConnections: number;
  } {
    const activeSessions = Array.from(this.sessions.values()).filter(
      s => s.status === 'active'
    ).length;

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      totalConnections: this.connections.size
    };
  }

  /**
   * Clean up stale sessions
   */
  cleanupStaleSessions(timeoutMs: number = 300000): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      const staleTime = now - session.lastActivity;

      if (staleTime > timeoutMs && session.status !== 'stopped') {
        logger.warn(`Cleaning up stale session: ${sessionId} (${staleTime}ms inactive)`);
        toDelete.push(sessionId);
      }
    }

    for (const sessionId of toDelete) {
      this.closeSession(sessionId);
    }
  }
}
