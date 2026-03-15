'use strict';

const config = require('./src/config');
const logger = require('./src/utils/logger');
const { initWorkerPool, getLeastLoadedWorker, createRouter } = require('./src/transport/workerPool');
const RoomManager = require('./src/rooms/roomManager');
const Redis = require('ioredis');

async function verify() {
  logger.info('--- Starting Prototyping Verification ---');
  
  // 1. Check Config
  logger.info({ config }, 'Config loaded');

  // 2. Initialize Worker Pool (This spawns the mediasoup-worker processes)
  try {
    await initWorkerPool();
    logger.info('Worker pool initialized successfully.');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize worker pool');
    process.exit(1);
  }

  // 3. Initialize Redis and RoomManager
  const redis = new Redis(config.REDIS_URL);
  const roomManager = new RoomManager(redis);
  
  try {
    // 4. Test Room Creation
    const examId = 'test-exam-' + Date.now();
    logger.info({ examId }, 'Attempting to create a room...');
    
    const { roomId, router } = await roomManager.createRoom(examId);
    logger.info({ roomId, routerId: router.id }, 'Room and Router created successfully');

    // 5. Verify local state
    const count = roomManager.getRoomCount();
    logger.info({ count }, 'Current active rooms in memory');

    // 6. Cleanup
    logger.info('Cleaning up...');
    await roomManager.destroyRoom(roomId);
    redis.disconnect();
    
    logger.info('--- Verification Successful ---');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Verification failed during room management');
    process.exit(1);
  }
}

verify();
