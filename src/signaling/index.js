'use strict';

const logger = require('../utils/logger');
const TransportFactory = require('../transport/transportFactory');
const RoomError = require('../rooms/roomError');

/**
 * Attaches signaling event handlers to the Socket.IO server.
 * 
 * @param {import('socket.io').Server} io 
 * @param {import('../rooms/roomManager')} roomManager 
 * @param {object} config 
 */
function attachSignaling(io, roomManager, config) {
  // Map to store TransportFactory instances per room
  // Key: roomId, Value: TransportFactory
  const transportFactories = new Map();

  io.on('connection', async (socket) => {
    const { studentId, examId, role } = socket.handshake.auth;

    if (!studentId || !examId) {
      logger.warn({ socketId: socket.id }, 'Connection rejected: missing auth credentials');
      return socket.disconnect();
    }

    const roomId = examId; // Using examId as roomId per requirements
    const peerId = studentId;

    logger.info({ socketId: socket.id, studentId, examId, role }, 'Peer connecting');

    // --- join-exam ---
    socket.on('join-exam', async (data, callback) => {
      try {
        const { router, routerRtpCapabilities } = await roomManager.createRoom(roomId);
        
        // Ensure transport factory exists for this room
        if (!transportFactories.has(roomId)) {
          transportFactories.set(roomId, new TransportFactory(router, config));
        }

        await roomManager.addPeer(roomId, peerId, { studentId, examId, role });
        
        socket.join(roomId);
        
        // Notify others
        socket.to(roomId).emit('peer-joined', { peerId, meta: { studentId, role } });

        logger.info({ roomId, peerId }, 'Peer joined exam');
        callback({ routerRtpCapabilities });
      } catch (err) {
        logger.error({ err, roomId, peerId }, 'Error in join-exam');
        callback({ error: err.message });
      }
    });

    // --- create-transport ---
    socket.on('create-transport', async (data, callback) => {
      try {
        const factory = transportFactories.get(roomId);
        if (!factory) throw new Error('Room not joined');

        const params = await factory.createWebRtcTransport(peerId);
        callback(params);
      } catch (err) {
        logger.error({ err, roomId, peerId }, 'Error in create-transport');
        callback({ error: err.message });
      }
    });

    // --- connect-transport ---
    socket.on('connect-transport', async (data, callback) => {
      try {
        const { transportId, dtlsParameters } = data;
        const factory = transportFactories.get(roomId);
        if (!factory) throw new Error('Room not joined');

        await factory.connectTransport(transportId, dtlsParameters);
        callback({ success: true });
      } catch (err) {
        logger.error({ err, roomId, peerId }, 'Error in connect-transport');
        callback({ error: err.message });
      }
    });

    // --- produce ---
    socket.on('produce', async (data, callback) => {
      try {
        const { transportId, kind, rtpParameters, appData } = data;
        const factory = transportFactories.get(roomId);
        if (!factory) throw new Error('Room not joined');

        const { producerId } = await factory.createProducer(transportId, kind, rtpParameters, peerId, appData);
        
        // Notify others in the room about new producer
        socket.to(roomId).emit('new-producer', { 
          producerId, 
          peerId, 
          kind, 
          appData 
        });

        callback({ producerId });
      } catch (err) {
        logger.error({ err, roomId, peerId }, 'Error in produce');
        callback({ error: err.message });
      }
    });

    // --- consume ---
    socket.on('consume', async (data, callback) => {
      try {
        const { producerId, rtpCapabilities } = data;
        const factory = transportFactories.get(roomId);
        if (!factory) throw new Error('Room not joined');

        const params = await factory.createConsumer(data.transportId || Array.from(factory._transports.keys())[0], producerId, rtpCapabilities, peerId);
        callback(params);
      } catch (err) {
        logger.error({ err, roomId, peerId }, 'Error in consume');
        callback({ error: err.message });
      }
    });

    // --- resume-consumer ---
    socket.on('resume-consumer', async (data, callback) => {
      try {
        const { consumerId } = data;
        const factory = transportFactories.get(roomId);
        if (!factory) throw new Error('Room not joined');

        await factory.resumeConsumer(consumerId);
        callback({ success: true });
      } catch (err) {
        logger.error({ err, roomId, peerId }, 'Error in resume-consumer');
        callback({ error: err.message });
      }
    });

    // --- get-room-peers ---
    socket.on('get-room-peers', async (data, callback) => {
      try {
        const peers = await roomManager.getRoomPeers(roomId);
        callback(peers);
      } catch (err) {
        callback({ error: err.message });
      }
    });

    // --- get-producers ---
    socket.on('get-producers', async (data, callback) => {
      try {
        const factory = transportFactories.get(roomId);
        if (!factory) return callback([]);

        const producers = factory.getProducersForRoom();
        const otherProducers = producers.filter(p => p.peerId !== peerId);
        callback(otherProducers);
      } catch (err) {
        logger.error({ err, roomId, peerId }, 'Error in get-producers');
        callback({ error: err.message });
      }
    });

    // --- heartbeat ---
    socket.on('heartbeat', (data, callback) => {
      // Just acknowledge
      if (typeof callback === 'function') callback({ status: 'ok' });
    });

    // --- disconnect ---
    socket.on('disconnect', async () => {
      logger.info({ socketId: socket.id, peerId, roomId }, 'Peer disconnected');
      
      try {
        await roomManager.removePeer(roomId, peerId);
        
        const factory = transportFactories.get(roomId);
        if (factory) {
          factory.closeProducersForPeer(peerId);
          factory.closeTransportsForPeer(peerId);
        }

        socket.to(roomId).emit('peer-left', { peerId });

        // If no more peers, optionally cleanup room
        const peers = await roomManager.getRoomPeers(roomId);
        if (peers.length === 0) {
          logger.info({ roomId }, 'Room empty, destroying');
          await roomManager.destroyRoom(roomId);
          transportFactories.delete(roomId);
        }
      } catch (err) {
        logger.error({ err, roomId, peerId }, 'Error in disconnect cleanup');
      }
    });
  });
}

module.exports = attachSignaling;
