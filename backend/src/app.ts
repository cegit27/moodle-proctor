// ============================================================================
// Fastify App Configuration
// Sets up all plugins, middleware, and routes
// ============================================================================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import config from './config';
import logger from './config/logger';

// Import plugins
import postgresPlugin from './plugins/postgres';
import securityModule from './modules/security';
import websocketProxy from './plugins/websocket-proxy';
import webrtcPlugin from './modules/webrtc';

// Import middleware
import { enrollmentSignatureMiddleware } from './middleware/enrollment.middleware';

// Import routes
import authRoutes from './modules/auth/auth.routes';
import studentRoutes from './modules/student/student.routes';
import examRoutes from './modules/exam/exam.routes';
import violationRoutes from './modules/violation/violation.routes';
import teacherRoutes from './modules/teacher/teacher.routes';
import teacherSSE from './modules/teacher/teacher.sse';
import manualProctoringRoutes from './modules/manual-proctoring/manual-proctoring.routes';
import roomRoutes from './modules/room/room.routes';

// ============================================================================
// Feature Flags
// ============================================================================

export const featureFlags = {
  webrtcEnabled: false,
};

// ============================================================================
// Create Fastify App
// ============================================================================

export async function createApp() {
  const app = Fastify({
    logger: false, // We use Winston instead
    disableRequestLogging: true,
    trustProxy: true,
  });

  // ==========================================================================
  // Register Global Plugins
  // ==========================================================================

  // CORS
  const allowedOrigins = config.cors.origin
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow Electron/file-based clients and non-browser tools without Origin headers.
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, allowedOrigins.includes(origin));
    },
    credentials: config.cors.credentials,
  });

  // JWT
  await app.register(jwt, {
    secret: config.jwt.secret,
  });

  // Cookie support
  await app.register(cookie, {
    secret: config.jwt.secret,
  });

  // CSRF protection (for state-changing operations)
  await app.register(import('@fastify/csrf-protection'), {
    getToken: (request) => request.headers['x-csrf-token'],
    sessionPlugin: '@fastify/cookie',
  });

  // PostgreSQL database
  await app.register(postgresPlugin);

  // Security module
  await app.register(securityModule);

  // WebRTC plugin (MediaSoup) - optional, may fail if mediasoup not built
  try {
    await app.register(webrtcPlugin);
    featureFlags.webrtcEnabled = true;
    logger.info('WebRTC plugin loaded successfully');
  } catch (error) {
    featureFlags.webrtcEnabled = false;
    logger.warn('WebRTC plugin failed to load (mediasoup not available). WebRTC features will be disabled.');
    logger.warn(error);
  }

  // WebSocket proxy
  await app.register(websocketProxy, {
    prefix: '/ws',
    aiServiceUrl: process.env.AI_SERVICE_URL || 'ws://localhost:8000/proctor'
  });

  // ==========================================================================
  // Global Middleware
  // ==========================================================================

  // Request logging
  app.addHook('preHandler', async (request, _reply) => {
    logger.debug(`${request.method} ${request.url}`);
  });

  // Enrollment signature validation (for room-based sessions)
  app.addHook('preHandler', enrollmentSignatureMiddleware);

  // Error handler
  app.addHook('onError', async (request, _reply, error) => {
    logger.error(`Request error: ${request.method} ${request.url}`, error);
  });

  // ==========================================================================
  // Health Check
  // ==========================================================================

  app.get('/health', async (_request, reply) => {
    try {
      // Check database connection
      const client = await app.pg.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }

      return reply.send({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'connected',
        environment: config.app.environment,
        version: config.app.version,
      });
    } catch (error) {
      logger.error('Health check failed:', error);

      return reply.code(503).send({
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: 'Service unavailable',
      });
    }
  });

  // ==========================================================================
  // Register Routes
  // ==========================================================================

  await app.register(authRoutes);
  await app.register(studentRoutes);
  await app.register(examRoutes);
  await app.register(violationRoutes);
  await app.register(teacherRoutes);
  await app.register(teacherSSE);
  await app.register(manualProctoringRoutes);
  await app.register(roomRoutes);

  // ==========================================================================
  // Health Check Endpoint
  // ==========================================================================

  app.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      features: {
        webrtc: featureFlags.webrtcEnabled,
      },
    };
  });

  // CSRF token endpoint (for unauthenticated state-changing operations)
  app.get('/api/csrf-token', async (request, reply) => {
    // @ts-ignore - fastify-csrf-protection decorates the reply object
    const token = reply.generateCsrf();
    return { token };
  });

  // ==========================================================================
  // 404 Handler
  // ==========================================================================

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send({
      success: false,
      error: 'Not found',
      path: request.url,
    });
  });

  // ==========================================================================
  // Global Error Handler
  // ==========================================================================

  app.setErrorHandler(async (error, _request, reply) => {
    logger.error('Global error handler:', error);

    const statusCode = (error as any).statusCode || 500;
    const message = (error as any).message || 'Internal server error';

    return reply.code(statusCode).send({
      success: false,
      error: message,
      ...(config.nodeEnv === 'development' && { stack: error.stack }),
    });
  });

  // ==========================================================================
  // Graceful Shutdown
  // ==========================================================================

  app.addHook('onClose', async () => {
    logger.info('Closing application...');
  });

  return app;
}

export default createApp;
