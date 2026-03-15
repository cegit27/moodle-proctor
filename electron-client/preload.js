'use strict';

/**
 * electron-client/preload.js
 *
 * Runs in the Electron preload script context (Node integration OFF).
 * Exposes a typed `window.mediaApi` surface to the renderer via
 * contextBridge so the renderer never touches ipcRenderer directly.
 *
 * ─── ipcMain handlers required ───────────────────────────────────────────
 * The app team must register these ipcMain.handle() names in the main
 * process.  See README.md for the full wiring guide.
 *
 *   media:connect          (serverUrl, identity) → void
 *   media:joinExam         ()                    → { routerRtpCapabilities }
 *   media:create-transport (direction)            → transportParams
 *   media:connect-transport(transportId, dtls)   → void
 *   media:produce          (transportId, kind, rtpParameters, appData) → { producerId }
 *   media:consume          (producerId, rtpCapabilities) → consumerParams
 *   media:resume-consumer  (consumerId)           → void
 *   media:heartbeat        ()                     → void
 *   media:get-room-peers   ()                     → peer[]
 *   media:disconnect       ()                     → void
 *
 * ─── ipcMain events pushed TO renderer ───────────────────────────────────
 *   media:peer-joined   { peerId, meta }
 *   media:peer-left     { peerId }
 *   media:new-producer  { producerId, peerId, kind, appData }
 * ─────────────────────────────────────────────────────────────────────────
 */

const { contextBridge, ipcRenderer } = require('electron');

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Thin wrapper: invoke an ipcMain handler and return its result.
 * All errors propagate naturally to the caller.
 *
 * @param {string} channel
 * @param {...any} args
 * @returns {Promise<any>}
 */
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

/**
 * Registers a one-time-style listener for a push event from main.
 * The listener persists until the preload context is destroyed.
 *
 * @param {string} channel
 * @param {(data: any) => void} callback
 */
const onPush = (channel, callback) => {
  // Remove any previously registered listener for this channel so that
  // calling onPeer* multiple times doesn't stack duplicate handlers.
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_event, data) => callback(data));
};

// ── exposed API ────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('mediaApi', {
  /**
   * Open a Socket.IO connection to the media server and identify the peer.
   *
   * @param {string} serverUrl  e.g. 'https://proctoring.example.com:4000'
   * @param {{ studentId: string, examId: string, role: 'student'|'proctor' }} identity
   * @returns {Promise<void>}
   */
  connect: (serverUrl, identity) =>
    invoke('media:connect', serverUrl, identity),

  /**
   * Join the exam room on the server.
   * Returns the router's RTP capabilities — pass them to StreamManager.init().
   *
   * @returns {Promise<{ routerRtpCapabilities: object }>}
   */
  joinExam: () => invoke('media:joinExam'),

  /**
   * Ask the server to create a WebRTC send transport for this peer.
   *
   * @returns {Promise<{ transportId: string, iceParameters: object, iceCandidates: object[], dtlsParameters: object }>}
   */
  createSendTransport: () => invoke('media:create-transport', 'send'),

  /**
   * Ask the server to create a WebRTC recv transport for this peer.
   *
   * @returns {Promise<{ transportId: string, iceParameters: object, iceCandidates: object[], dtlsParameters: object }>}
   */
  createRecvTransport: () => invoke('media:create-transport', 'recv'),

  /**
   * Produce a media track (camera video, screen share, or audio).
   *
   * @param {'camera'|'screen'|'audio'} kind
   * @returns {Promise<{ producerId: string }>}
   */
  produce: (kind) => invoke('media:produce', kind),

  /**
   * Consume a remote producer's stream.
   *
   * @param {string} producerId
   * @param {object} rtpCapabilities  Local device RTP capabilities.
   * @returns {Promise<{ consumerId: string, producerId: string, kind: string, rtpParameters: object }>}
   */
  consume: (producerId, rtpCapabilities) =>
    invoke('media:consume', producerId, rtpCapabilities),

  /**
   * Resume a paused consumer (call after setting up RTCRtpReceiver).
   *
   * @param {string} consumerId
   * @returns {Promise<void>}
   */
  resumeConsumer: (consumerId) =>
    invoke('media:resume-consumer', consumerId),

  /**
   * Send a heartbeat to keep the room session alive.
   *
   * @returns {Promise<void>}
   */
  sendHeartbeat: () => invoke('media:heartbeat'),

  /**
   * Fetch the current peer list for the room.
   *
   * @returns {Promise<Array<{ studentId: string, examId: string, role: string, joinedAt: number }>>}
   */
  getRoomPeers: () => invoke('media:get-room-peers'),

  /**
   * Register a callback invoked whenever a new peer joins the room.
   *
   * @param {(data: { peerId: string, meta: object }) => void} callback
   */
  onPeerJoined: (callback) => onPush('media:peer-joined', callback),

  /**
   * Register a callback invoked whenever a peer leaves the room.
   *
   * @param {(data: { peerId: string }) => void} callback
   */
  onPeerLeft: (callback) => onPush('media:peer-left', callback),

  /**
   * Register a callback invoked when a new producer becomes available
   * (another peer started sending a track).
   *
   * @param {(data: { producerId: string, peerId: string, kind: string, appData: object }) => void} callback
   */
  onNewProducer: (callback) => onPush('media:new-producer', callback),

  /**
   * Cleanly disconnect from the media server.
   *
   * @returns {Promise<void>}
   */
  disconnect: () => invoke('media:disconnect'),
});
