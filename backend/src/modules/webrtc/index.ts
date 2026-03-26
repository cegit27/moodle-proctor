// ============================================================================
// WebRTC Plugin
// Registers MediaSoup service and routes with Fastify
// ============================================================================

import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { webrtcService } from './webrtc.service';
import registerWebRTCRoutes from './webrtc.routes';
import logger from '../../config/logger';

const webrtcPlugin: FastifyPluginAsync = async (app) => {
  try {
    // Initialize MediaSoup
    await webrtcService.initialize();

    // Register WebRTC routes
    await registerWebRTCRoutes(app);

    // Hook for cleanup on server close
    app.addHook('onClose', async () => {
      logger.info('Closing WebRTC service');
      await webrtcService.close();
    });

    logger.info('WebRTC plugin registered');
  } catch (error) {
    logger.error('Failed to register WebRTC plugin:', error);
    logger.error('WebRTC features will be disabled');
    // Don't throw - allow the app to start without WebRTC
  }
};

export default fp(webrtcPlugin, {
  name: 'webrtc',
});
