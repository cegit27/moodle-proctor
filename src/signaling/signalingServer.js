'use strict';

const { Server } = require('socket.io');
const attachSignaling = require('./index');

/**
 * Initializes the Socket.IO server with the provided HTTP server.
 * 
 * @param {import('http').Server} httpServer 
 * @param {import('../rooms/roomManager')} roomManager 
 * @param {object} config 
 * @returns {import('socket.io').Server}
 */
function createSignalingServer(httpServer, roomManager, config) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  });

  attachSignaling(io, roomManager, config);

  return io;
}

module.exports = createSignalingServer;
