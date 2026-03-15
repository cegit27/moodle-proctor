'use strict';

const logger = require('../utils/logger');
const {
  getLeastLoadedWorker,
  createRouter,
  decrementWorkerLoad,
} = require('../transport/workerPool');
const RoomError = require('./roomError');

const roomKey = (roomId) => `room:${roomId}`;
const peersKey = (roomId) => `room:${roomId}:peers`;
const ROOM_TTL_SECONDS = 28800;

class RoomManager {
  constructor(redisClient) {
    this._redis = redisClient;
    this._memoryDb = new Map(); // Local fallback for tests without Redis

    this._routerMap = new Map();
  }

  async createRoom(examId) {
    const roomId = examId;
    const key = roomKey(roomId);

    // Try Redis, fallback to memory
    let existing = null;
    try {
      existing = await this._redis.hgetall(key);
    } catch (e) {
      existing = this._memoryDb.get(key);
    }

    if (existing && existing.routerId) {
      const entry = this._routerMap.get(roomId);
      if (entry) {
        return {
          roomId,
          router: entry.router,
          routerRtpCapabilities: entry.router.rtpCapabilities,
        };
      }
    }

    const worker = getLeastLoadedWorker();
    const router = await createRouter(worker);
    this._routerMap.set(roomId, { router, worker });

    const now = Date.now();
    const data = {
      routerId: router.id,
      workerPid: String(worker.pid),
      examId,
      createdAt: String(now),
    };

    // Try Redis
    try {
      const pipeline = this._redis.pipeline();
      pipeline.hset(key, data);
      pipeline.expire(key, ROOM_TTL_SECONDS);
      await pipeline.exec();
    } catch (e) {
      // Memory fallback
      this._memoryDb.set(key, data);
    }

    return {
      roomId,
      router,
      routerRtpCapabilities: router.rtpCapabilities,
    };
  }

  async addPeer(roomId, peerId, peerMeta) {
    const meta = {
      ...peerMeta,
      joinedAt: Date.now(),
    };

    const key = peersKey(roomId);
    try {
      const pipeline = this._redis.pipeline();
      pipeline.hset(key, peerId, JSON.stringify(meta));
      pipeline.expire(key, ROOM_TTL_SECONDS);
      await pipeline.exec();
    } catch (e) {
      const currentPeers = this._memoryDb.get(key) || {};
      currentPeers[peerId] = JSON.stringify(meta);
      this._memoryDb.set(key, currentPeers);
    }
  }

  async getRoomPeers(roomId) {
    const key = peersKey(roomId);
    let raw = null;
    try {
      raw = await this._redis.hgetall(key);
    } catch (e) {
      raw = this._memoryDb.get(key) || {};
    }

    return Object.values(raw).map((json) => {
      try {
        return JSON.parse(json);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  async removePeer(roomId, peerId) {
    const key = peersKey(roomId);
    try {
      await this._redis.hdel(key, peerId);
    } catch (e) {
      const currentPeers = this._memoryDb.get(key) || {};
      delete currentPeers[peerId];
      this._memoryDb.set(key, currentPeers);
    }
  }

  async destroyRoom(roomId) {
    const entry = this._routerMap.get(roomId);
    if (entry) {
      if (!entry.router.closed) entry.router.close();
      this._routerMap.delete(roomId);
      decrementWorkerLoad(entry.worker);
    }

    try {
      const pipeline = this._redis.pipeline();
      pipeline.del(roomKey(roomId));
      pipeline.del(peersKey(roomId));
      await pipeline.exec();
    } catch (e) {
      this._memoryDb.delete(roomKey(roomId));
      this._memoryDb.delete(peersKey(roomId));
    }
  }

  getRoomCount() {
    return this._routerMap.size;
  }
}

module.exports = RoomManager;
