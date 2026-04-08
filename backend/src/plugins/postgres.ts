// ============================================================================
// PostgreSQL Plugin
// Registers @fastify/postgres with connection pooling
// ============================================================================

import fp from 'fastify-plugin';
import postgres from '@fastify/postgres';
import config from '../config';
import logger from '../config/logger';
import { ensureRoomSchema } from '../db/ensure-room-schema';
import { ensureScanSchema } from '../db/ensure-scan-schema';

/**
 * PostgreSQL plugin for Fastify
 * Provides database connection with pooling
 */
export default fp(async (fastify, _options) => {
  try {
    await fastify.register(postgres, {
      connectionString: config.database.url,
      max: config.database.poolMax,
      min: config.database.poolMin,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Health check for database
    fastify.addHook('onReady', async () => {
      const client = await fastify.pg.connect();
      try {
        await client.query('SELECT 1');
        await ensureRoomSchema(client);
        await ensureScanSchema(client);
        logger.info('PostgreSQL database connected successfully');
      } finally {
        client.release();
      }
    });

    // Graceful shutdown
    fastify.addHook('onClose', async (instance) => {
      await instance.pg.pool.end();
      logger.info('PostgreSQL connection pool closed');
    });

    // Decorate reply with query helper for convenience
    fastify.decorateReply('query', async function(queryText: string, values?: unknown[]) {
      return fastify.pg.query(queryText, values);
    });

  } catch (error) {
    logger.error('Failed to initialize PostgreSQL plugin:', error);
    throw error;
  }
}, {
  name: 'postgres',
  dependencies: [],
});
