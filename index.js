'use strict';

const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

const config = require('./src/config');
const logger = require('./src/utils/logger');
const { initWorkerPool } = require('./src/transport/workerPool');
const RoomManager = require('./src/rooms/roomManager');
const attachSignaling = require('./src/signaling');

async function bootstrap() {
  try {
    // 1. Initialize Mediasoup Worker Pool
    await initWorkerPool();

    // 2. Initialize Redis and RoomManager
    const redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null // Don't retry indefinitely
    });
    redis.on('error', (err) => logger.warn('Redis not available, using in-memory state (local test mode)'));
    redis.on('connect', () => logger.info('Redis connected'));
    
    const roomManager = new RoomManager(redis);

    // 3. Create HTTP Server
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      if (req.url === '/' || req.url === '/index.html') {
        const filePath = path.join(__dirname, 'test-ui', 'index.html');
        if (fs.existsSync(filePath)) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(fs.readFileSync(filePath));
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      } else {
        const filePath = path.join(__dirname, 'test-ui', req.url);
        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath);
          const mimeTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css'
          };
          const contentType = mimeTypes[ext] || 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(fs.readFileSync(filePath));
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      }
    });

    // 4. Attach Socket.IO
    const createSignalingServer = require('./src/signaling/signalingServer');
    const io = createSignalingServer(server, roomManager, config);

    // 6. Start Server
    server.listen(config.PORT, () => {
      logger.info(`proctor-media-server starting on port ${config.PORT}`);
    });

    // Export app object for further extensibility
    const app = {
      server,
      io,
      roomManager,
      config,
      logger
    };

    module.exports = app;

  } catch (err) {
    logger.error({ err }, 'Failed to bootstrap server');
    process.exit(1);
  }
}

bootstrap();
