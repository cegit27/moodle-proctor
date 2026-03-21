'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const config = require('./proctor-media-server/src/config');
const logger = require('./proctor-media-server/src/utils/logger');
const Redis = require('ioredis');
const RoomManager = require('./proctor-media-server/src/rooms/roomManager');
const { initWorkerPool } = require('./proctor-media-server/src/transport/workerPool');
const createSignalingServer = require('./proctor-media-server/src/signaling/signalingServer');

async function main() {
  // 1. Initialize Worker Pool
  try {
    await initWorkerPool();
  } catch (err) {
    logger.error({ err }, 'failed to initialize mediasoup worker pool');
    process.exit(1);
  }

  // 2. Initialize Redis
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => {
      logger.warn(`Redis reconnection attempt ${times}`);
      return null; // Stop retrying and fallback to memory
    }
  });

  redis.on('error', (err) => {
    logger.error({ err }, 'Redis error');
  });

  redis.on('connect', () => {
    logger.info('Connected to Redis');
  });

  // 3. Initialize Room Manager
  const roomManager = new RoomManager(redis);

  // 4. Create HTTP Server for signaling and serving test-ui
  const server = http.createServer((req, res) => {
    // Basic CORS headers for static files/heartbeat
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Serve test-ui
    let urlPath = req.url === '/' ? '/index.html' : req.url;
    const testUiDir = path.join(__dirname, 'proctor-media-server', 'test-ui');
    const filePath = path.join(testUiDir, urlPath);

    if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  // 5. Initialize Signaling Server
  createSignalingServer(server, roomManager, config);

  // 6. Start listening
  const port = config.PORT;
  server.listen(port, () => {
    logger.info(`proctor-media-server starting on port ${port}`);
    logger.info(`test UI available at http://localhost:${port}/`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'unexpected error during startup');
  process.exit(1);
});
