'use strict';

const logger = require('../utils/logger');

// ---------------------------------------------------------------------------
// TransportFactory
// ---------------------------------------------------------------------------

/**
 * Manages all mediasoup Transports, Producers, and Consumers for a single
 * room (one Router).  One instance is created per room.
 *
 * Internal maps
 * ─────────────
 *  transports    Map<transportId, transport>
 *  producers     Map<producerId,  { producer, peerId }>
 *  consumers     Map<consumerId,  { consumer, peerId }>
 *  peerTransports Map<peerId, Set<transportId>>   ← reverse index for cleanup
 */
class TransportFactory {
  /**
   * @param {import('mediasoup').types.Router} router
   * @param {{ MEDIASOUP_LISTEN_IP: string, MEDIASOUP_ANNOUNCED_IP: string }} config
   */
  constructor(router, config) {
    this._router = router;
    this._config = config;

    /** @type {Map<string, import('mediasoup').types.WebRtcTransport>} */
    this._transports = new Map();

    /** @type {Map<string, { producer: import('mediasoup').types.Producer, peerId: string }>} */
    this._producers = new Map();

    /** @type {Map<string, { consumer: import('mediasoup').types.Consumer, peerId: string }>} */
    this._consumers = new Map();

    /** @type {Map<string, Set<string>>}  peerId → Set of transportIds */
    this._peerTransports = new Map();
  }

  // -------------------------------------------------------------------------
  // createWebRtcTransport
  // -------------------------------------------------------------------------

  /**
   * Creates a WebRTC transport for a peer and returns the client-side
   * connection parameters.
   *
   * @param {string} peerId
   * @returns {Promise<{
   *   transportId:    string,
   *   iceParameters:  object,
   *   iceCandidates:  object[],
   *   dtlsParameters: object
   * }>}
   */
  async createWebRtcTransport(peerId) {
    const { MEDIASOUP_LISTEN_IP, MEDIASOUP_ANNOUNCED_IP } = this._config;

    const transport = await this._router.createWebRtcTransport({
      listenIps: [
        {
          ip: MEDIASOUP_LISTEN_IP,
          announcedIp: MEDIASOUP_ANNOUNCED_IP || undefined,
        },
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1_000_000,
      minimumAvailableOutgoingBitrate: 600_000,
      maxSctpMessageSize: 262144,
    });

    // ── store in transports map ─────────────────────────────────────────────
    this._transports.set(transport.id, transport);

    // ── reverse index: peerId → Set<transportId> ───────────────────────────
    if (!this._peerTransports.has(peerId)) {
      this._peerTransports.set(peerId, new Set());
    }
    this._peerTransports.get(peerId).add(transport.id);

    // ── DTLS state watchdog ─────────────────────────────────────────────────
    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'failed' || dtlsState === 'closed') {
        logger.warn(
          { transportId: transport.id, peerId, dtlsState },
          `WebRTC transport DTLS state → ${dtlsState}`
        );
      }
    });

    logger.debug(
      { transportId: transport.id, peerId },
      'WebRTC transport created'
    );

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  // -------------------------------------------------------------------------
  // connectTransport
  // -------------------------------------------------------------------------

  /**
   * Completes the DTLS handshake for an existing transport.
   *
   * @param {string} transportId
   * @param {object} dtlsParameters  Sent by the client after ICE is done.
   * @returns {Promise<void>}
   */
  async connectTransport(transportId, dtlsParameters) {
    const transport = this._transports.get(transportId);
    if (!transport) {
      throw new Error(`connectTransport: transport "${transportId}" not found`);
    }

    await transport.connect({ dtlsParameters });
    logger.debug({ transportId }, 'transport connected (DTLS)');
  }

  // -------------------------------------------------------------------------
  // createProducer
  // -------------------------------------------------------------------------

  /**
   * Creates a mediasoup Producer on behalf of a peer.
   *
   * @param {string} transportId
   * @param {'audio'|'video'} kind
   * @param {object} rtpParameters
   * @param {string} peerId
   * @param {object} [appData]
   * @returns {Promise<{ producerId: string }>}
   */
  async createProducer(transportId, kind, rtpParameters, peerId, appData = {}) {
    const transport = this._transports.get(transportId);
    if (!transport) {
      throw new Error(`createProducer: transport "${transportId}" not found`);
    }

    const producer = await transport.produce({
      kind,
      rtpParameters,
      appData: { ...appData, peerId },
    });

    this._producers.set(producer.id, { producer, peerId });

    // Auto-remove from map when the underlying transport is closed
    producer.on('transportclose', () => {
      logger.debug(
        { producerId: producer.id, peerId },
        'producer removed — transport closed'
      );
      this._producers.delete(producer.id);
    });

    logger.debug({ producerId: producer.id, kind, peerId }, 'producer created');

    return { producerId: producer.id };
  }

  // -------------------------------------------------------------------------
  // createConsumer
  // -------------------------------------------------------------------------

  /**
   * Creates a mediasoup Consumer so a peer can receive a remote track.
   * The consumer is created paused — the client must send a resume signal.
   *
   * @param {string} transportId
   * @param {string} producerId
   * @param {object} rtpCapabilities  Client's RTP capabilities.
   * @param {string} peerId
   * @returns {Promise<{
   *   consumerId:    string,
   *   producerId:    string,
   *   kind:          string,
   *   rtpParameters: object
   * }>}
   */
  async createConsumer(transportId, producerId, rtpCapabilities, peerId) {
    const transport = this._transports.get(transportId);
    if (!transport) {
      throw new Error(`createConsumer: transport "${transportId}" not found`);
    }

    const entry = this._producers.get(producerId);
    if (!entry) {
      throw new Error(`createConsumer: producer "${producerId}" not found`);
    }

    const canConsume = this._router.canConsume({
      producerId: entry.producer.id,
      rtpCapabilities,
    });
    if (!canConsume) {
      throw new Error(
        `createConsumer: cannot consume producer "${producerId}" — incompatible RTP capabilities`
      );
    }

    const consumer = await transport.consume({
      producerId: entry.producer.id,
      rtpCapabilities,
      paused: true, // client resumes after gathering consumer params
    });

    this._consumers.set(consumer.id, { consumer, peerId });

    logger.debug(
      { consumerId: consumer.id, producerId, kind: consumer.kind, peerId },
      'consumer created (paused)'
    );

    return {
      id: consumer.id,
      producerId: entry.producer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  // -------------------------------------------------------------------------
  // resumeConsumer
  // -------------------------------------------------------------------------

  /**
   * Resumes a previously paused consumer.
   *
   * @param {string} consumerId
   * @returns {Promise<void>}
   */
  async resumeConsumer(consumerId) {
    const entry = this._consumers.get(consumerId);
    if (!entry) {
      throw new Error(`resumeConsumer: consumer "${consumerId}" not found`);
    }

    await entry.consumer.resume();
    logger.debug({ consumerId }, 'consumer resumed');
  }

  // -------------------------------------------------------------------------
  // closeProducersForPeer
  // -------------------------------------------------------------------------

  /**
   * Closes and removes every Producer belonging to a given peer.
   * Called when a peer disconnects so downstream consumers stop receiving.
   *
   * @param {string} peerId
   */
  closeProducersForPeer(peerId) {
    for (const [producerId, entry] of this._producers) {
      if (entry.peerId === peerId) {
        entry.producer.close();
        this._producers.delete(producerId);
        logger.debug({ producerId, peerId }, 'producer closed for departing peer');
      }
    }
  }

  // -------------------------------------------------------------------------
  // closeTransportsForPeer
  // -------------------------------------------------------------------------

  /**
   * Closes and removes every WebRTC transport belonging to a given peer.
   * Implicitly closes any producers / consumers running on those transports
   * (mediasoup emits 'transportclose' on each).
   *
   * @param {string} peerId
   */
  closeTransportsForPeer(peerId) {
    const transportIds = this._peerTransports.get(peerId);
    if (!transportIds) return;

    for (const transportId of transportIds) {
      const transport = this._transports.get(transportId);
      if (transport) {
        transport.close();
        this._transports.delete(transportId);
        logger.debug(
          { transportId, peerId },
          'transport closed for departing peer'
        );
      }
    }

    this._peerTransports.delete(peerId);
  }

  // -------------------------------------------------------------------------
  // getProducersForRoom
  // -------------------------------------------------------------------------

  /**
   * Returns a snapshot of all active producers in this room.
   * Used by new peers joining to subscribe to existing streams.
   *
   * @returns {Array<{ producerId: string, peerId: string, kind: string, appData: object }>}
   */
  getProducersForRoom() {
    const result = [];
    for (const [producerId, { producer, peerId }] of this._producers) {
      result.push({
        producerId,
        peerId,
        kind: producer.kind,
        appData: producer.appData,
      });
    }
    return result;
  }
}

module.exports = TransportFactory;
