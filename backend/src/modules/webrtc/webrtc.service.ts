// ============================================================================
// WebRTC Service
// Manages MediaSoup routers, transports, producers, and consumers
// ============================================================================

import * as mediasoup from 'mediasoup';
import type {
  Worker,
  Router,
  Producer,
  Consumer,
  IceCandidate,
  DtlsParameters,
  IceParameters,
  RtpParameters,
} from 'mediasoup/node/lib/types';
import { mediasoupConfig } from '../../config/mediasoup';
import type { WebRTCPeer, WebRTCRoom } from './webrtc.types';
import logger from '../../config/logger';

// ============================================================================
// WebRTC Service
// ============================================================================

export class WebRTCService {
  private worker: Worker | null = null;
  private routers = new Map<string, Router>();
  private rooms = new Map<string, WebRTCRoom>();
  private peers = new Map<string, WebRTCPeer>();

  private async disposePeer(room: WebRTCRoom, peerId: string): Promise<void> {
    const peer = room.peers.get(peerId);

    if (!peer) {
      return;
    }

    for (const consumer of peer.consumers.values()) {
      await consumer.close();
    }

    for (const producer of peer.producers.values()) {
      await producer.close();
    }

    if (peer.transport) {
      await peer.transport.close();
    }

    room.peers.delete(peerId);
    this.peers.delete(peerId);
  }

  /**
   * Initialize MediaSoup worker
   */
  async initialize(): Promise<void> {
    try {
      this.worker = await mediasoup.createWorker(
        mediasoupConfig.worker as any
      );

      this.worker.on('died', () => {
        logger.error('MediaSoup worker died. Exiting process.');
        process.exit(1);
      });

      logger.info('MediaSoup worker initialized');
    } catch (error) {
      logger.error('Failed to initialize MediaSoup worker:', error);
      throw error;
    }
  }

  /**
   * Get or create router for room
   */
  async getOrCreateRouter(roomId: string): Promise<Router> {
    if (this.routers.has(roomId)) {
      return this.routers.get(roomId)!;
    }

    if (!this.worker) {
      throw new Error('MediaSoup worker not initialized');
    }

    const router = await this.worker.createRouter(
      mediasoupConfig.router as any
    );

    this.routers.set(roomId, router);
    logger.info(`Created router for room: ${roomId}`);

    return router;
  }

  /**
   * Create room
   */
  async createRoom(roomId: string, examId: number): Promise<WebRTCRoom> {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!;
    }

    const router = await this.getOrCreateRouter(roomId);

    const room: WebRTCRoom = {
      roomId,
      examId,
      router,
      peers: new Map(),
      createdAt: Date.now(),
    };

    this.rooms.set(roomId, room);
    logger.info(`Created WebRTC room: ${roomId}`);

    return room;
  }

  /**
   * Add peer to room
   */
  async addPeer(
    roomId: string,
    peerId: string,
    userId: number,
    studentName: string
  ): Promise<WebRTCPeer> {
    let room = this.rooms.get(roomId);

    if (!room) {
      room = await this.createRoom(roomId, 0); // examId can be 0 for now
    }

    if (room.peers.has(peerId)) {
      await this.disposePeer(room, peerId);
      logger.info(`Replaced existing peer: ${peerId} in room: ${roomId}`);
    }

    const peer: WebRTCPeer = {
      peerId,
      userId,
      studentName,
      producers: new Map(),
      consumers: new Map(),
      isProducing: false,
      connectionState: 'connecting',
      videoEnabled: true,
      audioEnabled: true,
      joinedAt: Date.now(),
    };

    room.peers.set(peerId, peer);
    this.peers.set(peerId, peer);

    logger.info(`Added peer: ${peerId} to room: ${roomId}`);

    return peer;
  }

  /**
   * Remove peer from room
   */
  async removePeer(roomId: string, peerId: string): Promise<void> {
    const room = this.rooms.get(roomId);

    if (!room) {
      return;
    }

    const peer = room.peers.get(peerId);

    if (peer) {
      await this.disposePeer(room, peerId);

      logger.info(`Removed peer: ${peerId} from room: ${roomId}`);
    }

    // Clean up empty room
    if (room.peers.size === 0) {
      if (room.router) {
        await room.router.close();
      }

      this.routers.delete(roomId);
      this.rooms.delete(roomId);

      logger.info(`Deleted empty room: ${roomId}`);
    }
  }

  /**
   * Create WebRTC transport for peer
   */
  async createTransport(
    roomId: string,
    peerId: string
  ): Promise<{
    transportId: string;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
  }> {
    const room = this.rooms.get(roomId);

    if (!room || !room.router) {
      throw new Error(`Room not found: ${roomId}`);
    }

    const peer = room.peers.get(peerId);

    if (!peer) {
      throw new Error(`Peer not found: ${peerId}`);
    }

    const transport = await room.router.createWebRtcTransport(
      mediasoupConfig.webRtcTransport as any
    );

    peer.transport = transport;
    peer.connectionState = 'connected';

    transport.on('dtlsstatechange', (dtlsState: string) => {
      logger.info(
        `Transport DTLS state changed: ${dtlsState} for peer ${peerId}`
      );
    });

    transport.on('icestatechange', (iceState: string) => {
      logger.info(
        `Transport ICE state changed: ${iceState} for peer ${peerId}`
      );
    });

    logger.info(`Created transport for peer: ${peerId}`);

    return {
      transportId: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  /**
   * Connect transport
   */
  async connectTransport(
    roomId: string,
    peerId: string,
    dtlsParameters: DtlsParameters
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);

    if (!peer || !peer.transport) {
      throw new Error(`Transport not found for peer: ${peerId}`);
    }

    await peer.transport.connect({ dtlsParameters });

    logger.info(`Connected transport for peer: ${peerId}`);
  }

  /**
   * Create producer (video/audio stream from student)
   */
  async createProducer(
    roomId: string,
    peerId: string,
    kind: 'audio' | 'video',
    rtpParameters: RtpParameters
  ): Promise<Producer> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);

    if (!peer || !peer.transport) {
      throw new Error(`Transport not found for peer: ${peerId}`);
    }

    const producer = await peer.transport.produce({
      kind,
      rtpParameters,
    });

    if (kind === 'video') {
      peer.isProducing = true;
    }

    peer.producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      logger.info(`Producer transport closed for peer: ${peerId}`);
      peer.producers.delete(producer.id);
      producer.close();
    });

    logger.info(
      `Created ${kind} producer for peer: ${peerId}, producerId: ${producer.id}`
    );

    return producer;
  }

  /**
   * Get consumers for peer (all other producers in room)
   */
  async getConsumers(roomId: string, peerId: string): Promise<any[]> {
    const room = this.rooms.get(roomId);

    if (!room) {
      return [];
    }

    const consumers: any[] = [];

    for (const [otherPeerId, otherPeer] of room.peers) {
      if (otherPeerId === peerId || otherPeer.producers.size === 0) {
        continue;
      }

      for (const producer of otherPeer.producers.values()) {
        consumers.push({
          producerId: producer.id,
          peerId: otherPeerId,
          studentName: otherPeer.studentName,
          kind: producer.kind,
        });
      }
    }

    return consumers;
  }

  /**
   * Create consumer (receive stream)
   */
  async createConsumer(
    roomId: string,
    peerId: string,
    producerId: string,
    rtpCapabilities: RtpParameters
  ): Promise<Consumer> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);

    if (!room?.router || !peer || !peer.transport) {
      throw new Error(`Transport not found for peer: ${peerId}`);
    }

    if (!room.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error(`Peer ${peerId} cannot consume producer ${producerId}`);
    }

    const consumer = await peer.transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });

    peer.consumers.set(producerId, consumer);

    consumer.on('transportclose', () => {
      logger.info(
        `Consumer transport closed, producerId: ${producerId}, peerId: ${peerId}`
      );
      peer.consumers.delete(producerId);
    });

    logger.info(
      `Created consumer for peer: ${peerId}, producerId: ${producerId}`
    );

    return consumer;
  }

  /**
   * Resume consumer (start receiving)
   */
  async resumeConsumer(
    roomId: string,
    peerId: string,
    producerId: string
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);
    const consumer = peer?.consumers.get(producerId);

    if (!consumer) {
      throw new Error(
        `Consumer not found for producerId: ${producerId}, peerId: ${peerId}`
      );
    }

    await consumer.resume();

    logger.info(
      `Resumed consumer for peer: ${peerId}, producerId: ${producerId}`
    );
  }

  /**
   * Pause consumer
   */
  async pauseConsumer(
    roomId: string,
    peerId: string,
    producerId: string
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);
    const consumer = peer?.consumers.get(producerId);

    if (!consumer) {
      return;
    }

    await consumer.pause();

    logger.info(
      `Paused consumer for peer: ${peerId}, producerId: ${producerId}`
    );
  }

  /**
   * Get room info
   */
  getRoomInfo(roomId: string): any {
    const room = this.rooms.get(roomId);

    if (!room) {
      return null;
    }

    return {
      roomId,
      examId: room.examId,
      peerCount: room.peers.size,
      peers: Array.from(room.peers.values()).map((peer) => ({
        peerId: peer.peerId,
        studentName: peer.studentName,
        isProducing: peer.isProducing,
        producerCount: peer.producers.size,
        connectionState: peer.connectionState,
        videoEnabled: peer.videoEnabled,
        audioEnabled: peer.audioEnabled,
      })),
      createdAt: room.createdAt,
    };
  }

  getRouterRtpCapabilities(roomId: string): RtpParameters | null {
    const room = this.rooms.get(roomId);
    return room?.router?.rtpCapabilities || null;
  }

  getPeer(roomId: string, peerId: string): WebRTCPeer | null {
    return this.rooms.get(roomId)?.peers.get(peerId) || null;
  }

  // ==========================================================================
  // Bulk Room Operations (Issue #5)
  // ==========================================================================

  /**
   * Disconnect all peers in a room (parallelized for speed)
   * Issue #5: Reduces room switch latency from 1.5s to ~750ms
   */
  async disconnectRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);

    if (!room) {
      logger.warn(`Room not found for disconnect: ${roomId}`);
      return;
    }

    const peerIds = Array.from(room.peers.keys());

    if (peerIds.length === 0) {
      logger.info(`Room ${roomId} has no peers to disconnect`);
      return;
    }

    // Parallelize peer disposal for speed (Issue #5)
    const disconnectPromises = peerIds.map(peerId =>
      this.disposePeer(room, peerId).catch(error => {
        logger.error(`Failed to disconnect peer ${peerId}:`, error);
      })
    );

    await Promise.all(disconnectPromises);

    // Clean up the room
    if (room.router) {
      await room.router.close();
    }

    this.routers.delete(roomId);
    this.rooms.delete(roomId);

    logger.info(`Disconnected ${peerIds.length} peers from room: ${roomId}`);
  }

  /**
   * Get all peer IDs in a room
   */
  getRoomPeerIds(roomId: string): string[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.peers.keys()) : [];
  }

  /**
   * Get peer count for a room
   */
  getRoomPeerCount(roomId: string): number {
    const room = this.rooms.get(roomId);
    return room ? room.peers.size : 0;
  }

  /**
   * Close everything
   */
  async close(): Promise<void> {
    for (const room of this.rooms.values()) {
      for (const peer of room.peers.values()) {
        for (const producer of peer.producers.values()) {
          await producer.close();
        }

        for (const consumer of peer.consumers.values()) {
          await consumer.close();
        }

        if (peer.transport) {
          await peer.transport.close();
        }
      }

      if (room.router) {
        await room.router.close();
      }
    }

    if (this.worker) {
      await this.worker.close();
    }

    this.rooms.clear();
    this.routers.clear();
    this.peers.clear();

    logger.info('WebRTC service closed');
  }
}

export const webrtcService = new WebRTCService();
export default webrtcService;
