# electron-client — Integration Guide

This folder contains two files that the Electron desktop app team copies into
their project to integrate live video streaming with the proctor-media-server.

| File | Runs in | Purpose |
|---|---|---|
| `preload.js` | Preload script (Node + limited browser) | Exposes `window.mediaApi` safely via `contextBridge` |
| `streamManager.js` | Renderer process (browser JS) | Manages mediasoup-client Device, transports, and tracks |

---

## 1 — Dependency

Install `mediasoup-client` in the **Electron project** (not in the server repo):

```bash
npm install mediasoup-client
```

---

## 2 — Wiring `preload.js` in `BrowserWindow`

Pass the absolute path to `preload.js` in `webPreferences`:

```js
// main.js (Electron main process)
const path = require('path');
const { BrowserWindow, app } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'electron-client', 'preload.js'),
      contextIsolation: true,   // REQUIRED — keeps Node APIs out of renderer
      nodeIntegration: false,   // REQUIRED — security best practice
    },
  });

  win.loadFile('index.html');
});
```

> **Important:** `contextIsolation: true` and `nodeIntegration: false` are
> mandatory for `contextBridge` to work correctly.

---

## 3 — Required `ipcMain` Handlers

`preload.js` calls `ipcRenderer.invoke(channel, ...args)` for every API
method.  The main process **must** register a matching `ipcMain.handle()`
for each channel.  The socket connection to `proctor-media-server` lives
here — never in the renderer.

```js
// main.js (continued)
const { ipcMain } = require('electron');
const { io } = require('socket.io-client');

let socket = null;

// ─── helper: emit and wait for ack ────────────────────────────────────────
function signal(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (response?.error) reject(new Error(response.error));
      else resolve(response);
    });
  });
}

// ─── media:connect ────────────────────────────────────────────────────────
ipcMain.handle('media:connect', async (_e, serverUrl, identity) => {
  socket = io(serverUrl, { transports: ['websocket'] });
  await new Promise((res, rej) => {
    socket.on('connect', res);
    socket.on('connect_error', rej);
  });

  // Forward server push events to the renderer window
  socket.on('peer-joined',  (data) => win.webContents.send('media:peer-joined',  data));
  socket.on('peer-left',    (data) => win.webContents.send('media:peer-left',    data));
  socket.on('new-producer', (data) => win.webContents.send('media:new-producer', data));
});

// ─── media:joinExam ───────────────────────────────────────────────────────
ipcMain.handle('media:joinExam', () =>
  signal('join-exam'));

// ─── media:create-transport ───────────────────────────────────────────────
ipcMain.handle('media:create-transport', (_e, direction) =>
  signal('create-transport', { direction }));

// ─── media:connect-transport ──────────────────────────────────────────────
ipcMain.handle('media:connect-transport', (_e, transportId, dtlsParameters) =>
  signal('connect-transport', { transportId, dtlsParameters }));

// ─── media:produce ────────────────────────────────────────────────────────
ipcMain.handle('media:produce', (_e, transportId, kind, rtpParameters, appData) =>
  signal('produce', { transportId, kind, rtpParameters, appData }));

// ─── media:consume ────────────────────────────────────────────────────────
ipcMain.handle('media:consume', (_e, producerId, rtpCapabilities) =>
  signal('consume', { producerId, rtpCapabilities }));

// ─── media:resume-consumer ────────────────────────────────────────────────
ipcMain.handle('media:resume-consumer', (_e, consumerId) =>
  signal('resume-consumer', { consumerId }));

// ─── media:heartbeat ──────────────────────────────────────────────────────
ipcMain.handle('media:heartbeat', () =>
  signal('heartbeat'));

// ─── media:get-room-peers ─────────────────────────────────────────────────
ipcMain.handle('media:get-room-peers', () =>
  signal('get-room-peers'));

// ─── media:disconnect ─────────────────────────────────────────────────────
ipcMain.handle('media:disconnect', () => {
  socket?.disconnect();
  socket = null;
});
```

---

## 4 — Instantiating `StreamManager` in the Renderer

`streamManager.js` uses ES module syntax. Bundle it with your renderer
build (Vite, Webpack, etc.) or add `"type": "module"` to your package.json.

```js
// renderer.js (loaded by index.html)
import StreamManager from './electron-client/streamManager.js';

// signalFn wraps window.mediaApi calls so StreamManager stays transport-agnostic
const signalFn = (event, payload) => {
  switch (event) {
    case 'create-transport':
      return payload.direction === 'send'
        ? window.mediaApi.createSendTransport()
        : window.mediaApi.createRecvTransport();
    case 'connect-transport':
      // handled internally by ipcMain — see section 3
      return Promise.resolve();
    case 'produce':
      return window.mediaApi.produce(payload.kind);
    case 'consume':
      return window.mediaApi.consume(payload.producerId, payload.rtpCapabilities);
    case 'resume-consumer':
      return window.mediaApi.resumeConsumer(payload.consumerId);
    default:
      return Promise.reject(new Error(`Unknown signal event: ${event}`));
  }
};

const streamManager = new StreamManager(signalFn);
```

---

## 5 — The `signalFn` Contract

`StreamManager` calls `this.signal(event, payload)` and expects a `Promise`
that resolves with the server's acknowledgement object.

| `event` string | `payload` | Resolved value |
|---|---|---|
| `'create-transport'` | `{ direction: 'send'\|'recv' }` | transport params (iceParameters, …) |
| `'connect-transport'` | `{ transportId, dtlsParameters }` | `void` |
| `'produce'` | `{ transportId, kind, rtpParameters, appData }` | `{ producerId }` |
| `'consume'` | `{ producerId, rtpCapabilities }` | consumer params (consumerId, rtpParameters, …) |
| `'resume-consumer'` | `{ consumerId }` | `void` |

The abstraction means `StreamManager` can be tested with a mock `signalFn`
without any Electron or socket dependency.

---

## 6 — Full Join Flow

```
Renderer                     Main (ipcMain)            proctor-media-server
   │                              │                              │
   │  window.mediaApi.connect()   │   socket.io connect          │
   │ ────────────────────────── ► │ ──────────────────────────► │
   │                              │   ack                        │
   │  window.mediaApi.joinExam()  │   join-exam                  │
   │ ────────────────────────── ► │ ──────────────────────────► │
   │ ◄────────────────────────── │ ◄── { routerRtpCapabilities }│
   │                              │                              │
   │  streamManager.init(caps)    │  (local Device.load)         │
   │                              │                              │
   │  streamManager               │  create-transport send       │
   │    .createSendTransport()  ► │ ──────────────────────────► │
   │ ◄──────────────────────────  │ ◄── transportParams          │
   │                              │                              │
   │  streamManager               │  create-transport recv       │
   │    .createRecvTransport()  ► │ ──────────────────────────► │
   │ ◄──────────────────────────  │ ◄── transportParams          │
   │                              │                              │
   │  streamManager               │  (getUserMedia local)        │
   │    .publishCamera()          │  connect-transport (DTLS)    │
   │                            ► │ ──────────────────────────► │
   │                              │  produce (video + audio)     │
   │                            ► │ ──────────────────────────► │
   │ ◄────── { videoProducerId,   │ ◄── { producerId }           │
   │           audioProducerId }  │                              │
```

### Code snippet

```js
// Inside an async function in renderer.js
const identity = { studentId: 'S123', examId: 'EXAM42', role: 'student' };

await window.mediaApi.connect('https://proctor.example.com:4000', identity);

const { routerRtpCapabilities } = await window.mediaApi.joinExam();

await streamManager.init(routerRtpCapabilities);
await streamManager.createSendTransport();
await streamManager.createRecvTransport();

const { videoProducerId, audioProducerId } = await streamManager.publishCamera();
console.log('Camera live:', videoProducerId, audioProducerId);

// Subscribe to a remote producer announced via onNewProducer
window.mediaApi.onNewProducer(async ({ producerId }) => {
  const mediaStream = await streamManager.consumeStream(
    producerId,
    streamManager.device.rtpCapabilities
  );
  document.querySelector('#remoteVideo').srcObject = mediaStream;
});

// Cleanup on exam end
window.addEventListener('beforeunload', () => {
  streamManager.closeAll();
  window.mediaApi.disconnect();
});
```

---

## Push Events (server → renderer)

Register handlers **before** calling `joinExam()`:

```js
window.mediaApi.onPeerJoined(({ peerId, meta }) => {
  console.log('Peer joined:', peerId, meta);
});

window.mediaApi.onPeerLeft(({ peerId }) => {
  console.log('Peer left:', peerId);
});

window.mediaApi.onNewProducer(({ producerId, peerId, kind }) => {
  console.log(`New ${kind} producer from ${peerId}:`, producerId);
  // call streamManager.consumeStream(producerId, ...) here
});
```
