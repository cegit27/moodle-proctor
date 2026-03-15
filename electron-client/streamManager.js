/**
 * electron-client/streamManager.js
 *
 * Runs in the Electron renderer process (NOT in Node / main process).
 * Manages the local mediasoup-client Device, WebRTC send/recv transports,
 * and all producers / consumers for a single exam session.
 *
 * The `signalFn` constructor argument decouples this class from any specific
 * IPC or socket implementation — see the signalFn contract in README.md.
 *
 * Install dependency in the Electron project:
 *   npm install mediasoup-client
 */

import { Device } from 'mediasoup-client';

// ---------------------------------------------------------------------------
// StreamManager
// ---------------------------------------------------------------------------

/**
 * @typedef {(event: string, payload: object) => Promise<any>} SignalFn
 *   A function that sends a signalling message to the server and returns
 *   the server's acknowledgement payload.
 */

export default class StreamManager {
  /**
   * @param {SignalFn} signalFn
   */
  constructor(signalFn) {
    /** @type {import('mediasoup-client').Device} */
    this.device = new Device();

    /** @type {import('mediasoup-client').types.Transport | null} */
    this.sendTransport = null;

    /** @type {import('mediasoup-client').types.Transport | null} */
    this.recvTransport = null;

    /**
     * kind → Producer  ('camera' | 'screen' | 'audio')
     * @type {Map<string, import('mediasoup-client').types.Producer>}
     */
    this.producers = new Map();

    /**
     * consumerId → Consumer
     * @type {Map<string, import('mediasoup-client').types.Consumer>}
     */
    this.consumers = new Map();

    /** @type {SignalFn} */
    this.signal = signalFn;
  }

  // -------------------------------------------------------------------------
  // init
  // -------------------------------------------------------------------------

  /**
   * Load the server's router RTP capabilities into the mediasoup Device.
   * Must be called once before creating any transport.
   *
   * @param {object} routerRtpCapabilities
   * @returns {Promise<void>}
   */
  async init(routerRtpCapabilities) {
    await this.device.load({ routerRtpCapabilities });
  }

  // -------------------------------------------------------------------------
  // createSendTransport
  // -------------------------------------------------------------------------

  /**
   * Creates the send-side WebRTC transport and wires up the signalling events
   * that mediasoup-client will fire automatically during ICE/DTLS negotiation.
   *
   * @returns {Promise<void>}
   */
  async createSendTransport() {
    const params = await this.signal('create-transport', { direction: 'send' });
    this.sendTransport = this.device.createSendTransport(params);

    // Fired once when the local transport needs to complete DTLS
    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.signal('connect-transport', {
          transportId: this.sendTransport.id,
          dtlsParameters,
        });
        callback();
      } catch (err) {
        errback(err);
      }
    });

    // Fired for each produce() call — server returns the producerId
    this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const { producerId } = await this.signal('produce', {
          transportId: this.sendTransport.id,
          kind,
          rtpParameters,
          appData,
        });
        callback({ id: producerId });
      } catch (err) {
        errback(err);
      }
    });
  }

  // -------------------------------------------------------------------------
  // createRecvTransport
  // -------------------------------------------------------------------------

  /**
   * Creates the recv-side WebRTC transport for incoming streams.
   *
   * @returns {Promise<void>}
   */
  async createRecvTransport() {
    const params = await this.signal('create-transport', { direction: 'recv' });
    this.recvTransport = this.device.createRecvTransport(params);

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.signal('connect-transport', {
          transportId: this.recvTransport.id,
          dtlsParameters,
        });
        callback();
      } catch (err) {
        errback(err);
      }
    });
  }

  // -------------------------------------------------------------------------
  // publishCamera
  // -------------------------------------------------------------------------

  /**
   * Captures the default camera + microphone and publishes both tracks.
   * Uses three simulcast layers for the video track.
   *
   * @returns {Promise<{ videoProducerId: string, audioProducerId: string }>}
   */
  async publishCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, frameRate: 15 },
      audio: true,
    });

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    // Video — three simulcast layers (low / mid / high)
    const videoProducer = await this.sendTransport.produce({
      track: videoTrack,
      encodings: [
        { maxBitrate: 100_000, scaleResolutionDownBy: 4 },
        { maxBitrate: 300_000, scaleResolutionDownBy: 2 },
        { maxBitrate: 900_000 },
      ],
      codecOptions: { videoGoogleStartBitrate: 1000 },
      appData: { source: 'camera' },
    });
    this.producers.set('camera', videoProducer);

    // Audio
    const audioProducer = await this.sendTransport.produce({
      track: audioTrack,
      appData: { source: 'microphone' },
    });
    this.producers.set('audio', audioProducer);

    return {
      videoProducerId: videoProducer.id,
      audioProducerId: audioProducer.id,
    };
  }

  // -------------------------------------------------------------------------
  // publishScreen
  // -------------------------------------------------------------------------

  /**
   * Captures the entire screen (or a chosen window) and publishes it at a
   * low frame-rate suitable for exam proctoring.
   * Automatically closes the producer when the user stops sharing.
   *
   * @returns {Promise<{ producerId: string }>}
   */
  async publishScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 5 },
    });
    const track = stream.getVideoTracks()[0];

    const producer = await this.sendTransport.produce({
      track,
      appData: { source: 'screen' },
    });
    this.producers.set('screen', producer);

    // Browser fires 'ended' when the user clicks "Stop sharing"
    track.onended = () => {
      producer.close();
      this.producers.delete('screen');
    };

    return { producerId: producer.id };
  }

  // -------------------------------------------------------------------------
  // consumeStream
  // -------------------------------------------------------------------------

  /**
   * Subscribes to a remote producer and returns a MediaStream containing
   * the decoded track.  The consumer is resumed server-side and client-side.
   *
   * @param {string} producerId        Remote producer to consume.
   * @param {object} rtpCapabilities   Local device RTP capabilities.
   * @returns {Promise<MediaStream>}
   */
  async consumeStream(producerId, rtpCapabilities) {
    // Ask server to create a consumer and return its parameters
    const params = await this.signal('consume', { 
        producerId, 
        transportId: this.recvTransport.id,
        rtpCapabilities 
    });

    const consumer = await this.recvTransport.consume(params);
    this.consumers.set(consumer.id, consumer);

    // Tell server to resume the consumer (it was created paused)
    await this.signal('resume-consumer', { consumerId: consumer.id });

    // Resume locally so frames start flowing
    await consumer.resume();

    return new MediaStream([consumer.track]);
  }

  // -------------------------------------------------------------------------
  // closeAll
  // -------------------------------------------------------------------------

  /**
   * Tears down all producers, send transport, and recv transport.
   * Call this on exam-end or window unload.
   *
   * @returns {void}
   */
  closeAll() {
    for (const producer of this.producers.values()) {
      producer.close();
    }

    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    this.producers.clear();
    this.consumers.clear();
  }
}
