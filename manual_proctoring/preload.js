const { contextBridge, ipcRenderer } = require('electron')
const path = require('path')

const IPC_CHANNELS = {
  startFullscreen: 'start-fullscreen',
  exitFullscreen: 'exit-fullscreen',
  startExamMonitoring: 'start-exam-monitoring',
  stopExamMonitoring: 'stop-exam-monitoring',
  stopAiProctoringService: 'stop-ai-proctoring-service',
  ensureAiProctoringService: 'ensure-ai-proctoring-service',
  getAiProctoringStatus: 'get-ai-proctoring-status',
  getExamDevSettings: 'get-exam-dev-settings',
  setBlockedAppMonitoringEnabled: 'set-blocked-app-monitoring-enabled',
  safeStorageIsAvailable: 'safe-storage-is-available',
  safeStorageEncryptString: 'safe-storage-encrypt-string',
  safeStorageDecryptString: 'safe-storage-decrypt-string',
  fullscreenExited: 'fullscreen-exited',
  networkAppBlocked: 'network-app-blocked',
  aiProctoringStatus: 'ai-proctoring-status',
  openScanner: 'open-scanner'
}

function send(channel, ...args) {
  return ipcRenderer.send(channel, ...args)
}

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args)
}

const MEDIASOUP_CLIENT_MODULE_PATH = path.resolve(
  __dirname,
  '..',
  'frontend',
  'node_modules',
  'mediasoup-client'
)
const WEBRTC_RECONNECT_DELAY_MS = 2500
const WEBRTC_MEDIA_WAIT_TIMEOUT_MS = 10000

let mediasoupClientModule = null
const webRTCBroadcastListeners = new Set()
let webRTCBroadcastState = {
  status: 'idle',
  detail: 'WebRTC broadcast is idle.',
  isConnected: false,
  isProducing: false,
  roomId: null,
  peerId: null,
  error: null
}
const webRTCRuntime = {
  device: null,
  sendTransport: null,
  producers: new Map(),
  roomId: null,
  peerId: null,
  backendUrl: null,
  studentName: null,
  requestHeaders: null,
  videoElementId: 'video',
  reconnectTimerId: null,
  joined: false,
  stopRequested: false,
  startToken: 0
}

function loadMediasoupClient() {
  if (mediasoupClientModule) {
    return mediasoupClientModule
  }

  try {
    mediasoupClientModule = require(MEDIASOUP_CLIENT_MODULE_PATH)
    return mediasoupClientModule
  } catch (error) {
    throw new Error(
      `mediasoup-client could not be loaded from ${MEDIASOUP_CLIENT_MODULE_PATH}: ${error.message}`
    )
  }
}

function notifyWebRTCBroadcastState(patch = {}) {
  webRTCBroadcastState = {
    ...webRTCBroadcastState,
    ...patch
  }

  for (const listener of webRTCBroadcastListeners) {
    try {
      listener({ ...webRTCBroadcastState })
    } catch (error) {
      console.error('Failed to deliver WebRTC broadcast state:', error)
    }
  }
}

function clearWebRTCReconnectTimer() {
  if (webRTCRuntime.reconnectTimerId) {
    clearTimeout(webRTCRuntime.reconnectTimerId)
    webRTCRuntime.reconnectTimerId = null
  }
}

async function fetchWebRTCJson(input, init = {}, requestHeaders = null) {
  const headers = new Headers(init.headers || {})
  const mergedHeaders = requestHeaders ? new Headers(requestHeaders) : null

  if (mergedHeaders) {
    mergedHeaders.forEach((value, key) => {
      if (!headers.has(key)) {
        headers.set(key, value)
      }
    })
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(input, {
    credentials: 'include',
    ...init,
    headers
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(errorBody.error || `Request failed: ${response.status}`)
  }

  return response.json()
}

async function waitForVideoStream(videoElementId = 'video', timeoutMs = WEBRTC_MEDIA_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const videoElement = document.getElementById(videoElementId)

    if (videoElement) {
      const srcObject = videoElement.srcObject
      if (srcObject && typeof srcObject.getVideoTracks === 'function') {
        const directTracks = srcObject.getVideoTracks()
        if (directTracks.length > 0) {
          return srcObject
        }
      }

      const captureStream =
        typeof videoElement.captureStream === 'function'
          ? videoElement.captureStream.bind(videoElement)
          : typeof videoElement.mozCaptureStream === 'function'
            ? videoElement.mozCaptureStream.bind(videoElement)
            : null

      if (captureStream) {
        const capturedStream = captureStream()
        if (
          capturedStream &&
          typeof capturedStream.getVideoTracks === 'function' &&
          capturedStream.getVideoTracks().length > 0
        ) {
          return capturedStream
        }
      }
    }

    await new Promise(resolve => setTimeout(resolve, 100))
  }

  throw new Error(`Timed out waiting for video stream on #${videoElementId}`)
}

async function removeCurrentWebRTCPeer() {
  if (!webRTCRuntime.joined || !webRTCRuntime.backendUrl || !webRTCRuntime.roomId || !webRTCRuntime.peerId) {
    return
  }

  await fetch(
    `${webRTCRuntime.backendUrl}/api/webrtc/rooms/${webRTCRuntime.roomId}/peers/${webRTCRuntime.peerId}`,
    {
      method: 'DELETE',
      credentials: 'include',
      headers: webRTCRuntime.requestHeaders || undefined
    }
  ).catch(() => {})

  webRTCRuntime.joined = false
}

async function teardownWebRTCBroadcast({ removePeer = true } = {}) {
  clearWebRTCReconnectTimer()

  for (const producer of webRTCRuntime.producers.values()) {
    try {
      producer.close()
    } catch (error) {
      console.warn('Failed to close WebRTC producer:', error)
    }
  }
  webRTCRuntime.producers.clear()

  if (webRTCRuntime.sendTransport) {
    try {
      webRTCRuntime.sendTransport.close()
    } catch (error) {
      console.warn('Failed to close WebRTC send transport:', error)
    }
    webRTCRuntime.sendTransport = null
  }

  webRTCRuntime.device = null

  if (removePeer) {
    await removeCurrentWebRTCPeer()
  }
}

function scheduleWebRTCReconnect(detail) {
  if (webRTCRuntime.stopRequested || !webRTCRuntime.roomId || !webRTCRuntime.peerId) {
    return
  }

  clearWebRTCReconnectTimer()
  notifyWebRTCBroadcastState({
    status: 'reconnecting',
    detail,
    isConnected: false,
    isProducing: false
  })

  webRTCRuntime.reconnectTimerId = setTimeout(() => {
    startWebRTCBroadcast({
      roomId: webRTCRuntime.roomId,
      peerId: webRTCRuntime.peerId,
      studentName: webRTCRuntime.studentName,
      backendUrl: webRTCRuntime.backendUrl,
      requestHeaders: webRTCRuntime.requestHeaders,
      videoElementId: webRTCRuntime.videoElementId
    }).catch(error => {
      console.error('WebRTC reconnect failed:', error)
    })
  }, WEBRTC_RECONNECT_DELAY_MS)
}

async function startWebRTCBroadcast(config) {
  const {
    roomId,
    peerId,
    studentName,
    backendUrl,
    requestHeaders,
    videoElementId = 'video'
  } = config || {}

  if (!roomId || !peerId || !studentName || !backendUrl) {
    throw new Error('Missing WebRTC broadcast configuration')
  }

  const startToken = ++webRTCRuntime.startToken
  webRTCRuntime.stopRequested = false
  webRTCRuntime.roomId = roomId
  webRTCRuntime.peerId = peerId
  webRTCRuntime.studentName = studentName
  webRTCRuntime.backendUrl = backendUrl
  webRTCRuntime.requestHeaders = requestHeaders || null
  webRTCRuntime.videoElementId = videoElementId

  clearWebRTCReconnectTimer()
  await teardownWebRTCBroadcast({ removePeer: true })

  notifyWebRTCBroadcastState({
    status: 'starting',
    detail: 'Connecting the camera feed to the live room…',
    isConnected: false,
    isProducing: false,
    roomId,
    peerId,
    error: null
  })

  try {
    const mediasoupClient = loadMediasoupClient()
    const { Device } = mediasoupClient

    const roomUrl = `${backendUrl}/api/webrtc/rooms/${roomId}`
    const roomResponse = await fetch(roomUrl, {
      credentials: 'include',
      headers: requestHeaders || undefined
    })

    if (!roomResponse.ok && roomResponse.status !== 404) {
      const errorBody = await roomResponse.json().catch(() => ({}))
      throw new Error(errorBody.error || 'Failed to inspect WebRTC room')
    }

    if (roomResponse.status === 404) {
      await fetchWebRTCJson(
        `${backendUrl}/api/webrtc/rooms`,
        {
          method: 'POST',
          body: JSON.stringify({
            roomId,
            examId: 0
          })
        },
        requestHeaders
      )
    }

    const mediaStream = await waitForVideoStream(videoElementId)
    const videoTrack =
      typeof mediaStream.getVideoTracks === 'function'
        ? mediaStream.getVideoTracks()[0]
        : null

    if (!videoTrack) {
      throw new Error('No video track is available for WebRTC broadcast')
    }

    const joinResponse = await fetchWebRTCJson(
      `${backendUrl}/api/webrtc/rooms/${roomId}/peers`,
      {
        method: 'POST',
        body: JSON.stringify({
          peerId,
          studentName
        })
      },
      requestHeaders
    )

    if (webRTCRuntime.stopRequested || startToken !== webRTCRuntime.startToken) {
      await removeCurrentWebRTCPeer()
      return { ...webRTCBroadcastState }
    }

    webRTCRuntime.joined = true

    const device = await Device.factory()
    await device.load({
      routerRtpCapabilities: joinResponse.routerRtpCapabilities
    })
    webRTCRuntime.device = device

    const sendTransport = device.createSendTransport({
      id: joinResponse.transport.transportId,
      iceParameters: joinResponse.transport.iceParameters,
      iceCandidates: joinResponse.transport.iceCandidates,
      dtlsParameters: joinResponse.transport.dtlsParameters
    })

    sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      fetchWebRTCJson(
        `${backendUrl}/api/webrtc/rooms/${roomId}/peers/${peerId}/connect-transport`,
        {
          method: 'POST',
          body: JSON.stringify({
            dtlsParameters
          })
        },
        requestHeaders
      )
        .then(() => callback())
        .catch(error => errback(error instanceof Error ? error : new Error(String(error))))
    })

    sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
      fetchWebRTCJson(
        `${backendUrl}/api/webrtc/rooms/${roomId}/peers/${peerId}/produce`,
        {
          method: 'POST',
          body: JSON.stringify({
            kind,
            rtpParameters
          })
        },
        requestHeaders
      )
        .then(({ producerId }) => callback({ id: producerId }))
        .catch(error => errback(error instanceof Error ? error : new Error(String(error))))
    })

    sendTransport.on('connectionstatechange', state => {
      if (state === 'connected') {
        notifyWebRTCBroadcastState({
          status: 'running',
          detail: 'Live WebRTC broadcast is connected.',
          isConnected: true,
          isProducing: true,
          error: null
        })
        return
      }

      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        notifyWebRTCBroadcastState({
          status: 'reconnecting',
          detail: 'Live WebRTC broadcast dropped. Reconnecting…',
          isConnected: false,
          isProducing: false
        })

        teardownWebRTCBroadcast({ removePeer: true })
          .catch(error => {
            console.warn('Failed to tear down WebRTC broadcast after disconnect:', error)
          })
          .finally(() => {
            scheduleWebRTCReconnect('Live WebRTC broadcast dropped. Reconnecting…')
          })
      }
    })

    webRTCRuntime.sendTransport = sendTransport

    const producer = await sendTransport.produce({
      track: videoTrack,
      encodings: [
        {
          maxBitrate: 900000
        }
      ],
      codecOptions: {
        videoGoogleStartBitrate: 600
      }
    })

    webRTCRuntime.producers.set(producer.id, producer)

    producer.on('transportclose', () => {
      webRTCRuntime.producers.delete(producer.id)
    })

    producer.on('trackended', () => {
      webRTCRuntime.producers.delete(producer.id)
      scheduleWebRTCReconnect('Camera track ended. Reconnecting the live broadcast…')
    })

    notifyWebRTCBroadcastState({
      status: 'running',
      detail: 'Live WebRTC broadcast is connected.',
      isConnected: true,
      isProducing: true,
      roomId,
      peerId,
      error: null
    })

    return { ...webRTCBroadcastState }
  } catch (error) {
    await teardownWebRTCBroadcast({ removePeer: true }).catch(teardownError => {
      console.warn('Failed to clean up WebRTC broadcast after error:', teardownError)
    })

    const message = error instanceof Error ? error.message : 'Failed to start WebRTC broadcast'
    notifyWebRTCBroadcastState({
      status: 'error',
      detail: message,
      isConnected: false,
      isProducing: false,
      error: message
    })

    if (!webRTCRuntime.stopRequested) {
      scheduleWebRTCReconnect('Live WebRTC broadcast failed. Retrying…')
    }

    throw error
  }
}

async function stopWebRTCBroadcast() {
  webRTCRuntime.stopRequested = true
  await teardownWebRTCBroadcast({ removePeer: true })
  notifyWebRTCBroadcastState({
    status: 'stopped',
    detail: 'Live WebRTC broadcast stopped.',
    isConnected: false,
    isProducing: false,
    error: null
  })
  return { ...webRTCBroadcastState }
}

contextBridge.exposeInMainWorld('electronAPI', {
  startFullscreen: () => send(IPC_CHANNELS.startFullscreen),
  exitFullscreen: () => send(IPC_CHANNELS.exitFullscreen),
  startExamMonitoring: () => send(IPC_CHANNELS.startExamMonitoring),
  stopExamMonitoring: () => send(IPC_CHANNELS.stopExamMonitoring),
  stopAIProctoringService: () => send(IPC_CHANNELS.stopAiProctoringService),
  ensureAIProctoringService: () => invoke(IPC_CHANNELS.ensureAiProctoringService),
  getAIProctoringStatus: () => invoke(IPC_CHANNELS.getAiProctoringStatus),
  getExamDevSettings: () => invoke(IPC_CHANNELS.getExamDevSettings),
  setBlockedAppMonitoringEnabled: isEnabled =>
    invoke(IPC_CHANNELS.setBlockedAppMonitoringEnabled, isEnabled),
  safeStorage: {
    isEncryptionAvailable: () => invoke(IPC_CHANNELS.safeStorageIsAvailable),
    encryptString: value =>
      invoke(IPC_CHANNELS.safeStorageEncryptString, value),
    decryptString: value =>
      invoke(IPC_CHANNELS.safeStorageDecryptString, value)
  },
  startWebRTCBroadcast: config => startWebRTCBroadcast(config),
  stopWebRTCBroadcast: () => stopWebRTCBroadcast(),
  getWebRTCBroadcastState: () => Promise.resolve({ ...webRTCBroadcastState }),
  onWebRTCBroadcastState: callback => {
    if (typeof callback !== 'function') {
      return
    }

    webRTCBroadcastListeners.add(callback)
    callback({ ...webRTCBroadcastState })
  },
  onFullscreenExited: callback =>
    ipcRenderer.on(IPC_CHANNELS.fullscreenExited, callback),
  onNetworkAppBlocked: callback =>
    ipcRenderer.on(IPC_CHANNELS.networkAppBlocked, (_, processes) =>
      callback(processes)
    ),
  onAIProctoringStatus: callback =>
    ipcRenderer.on(IPC_CHANNELS.aiProctoringStatus, (_, status) =>
      callback(status)
    ),
  openScanner: () => send(IPC_CHANNELS.openScanner)
})