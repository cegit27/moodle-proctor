const { app, BrowserWindow, ipcMain, safeStorage } = require('electron')
const { execFile, spawn } = require('child_process')
const fs = require('fs')
const net = require('net')
const path = require('path')
const { pathToFileURL } = require('url')

let mainWindow
let monitoringInterval = null
let aiProctoringProcess = null
let aiProctoringStartupPromise = null
let aiProctoringStatus = {
  state: 'idle',
  detail: 'AI proctoring has not started yet.'
}
const isDevelopmentMode = !app.isPackaged
let devBlockedAppMonitoringEnabled = !isDevelopmentMode

const AI_PROCTORING_PORT = 8000
const AI_PROCTORING_HOST = '127.0.0.1'
const AI_PROCTORING_DIR = path.join(__dirname, '..', 'ai_proctoring')
const AI_PROCTORING_ENTRYPOINT = 'main.py'
const PROTOCOL_NAME = 'proctor'
const AUTO_JOIN_QUERY_VALUES = new Set(['1', 'true', 'yes'])
const RENDERER_CHANNELS = {
  aiProctoringStatus: 'ai-proctoring-status',
  networkAppBlocked: 'network-app-blocked',
  fullscreenExited: 'fullscreen-exited'
}

let pendingRoomLaunch = null

const BLOCKED_APPS_CONFIG_PATH = path.join(
  __dirname,
  'config',
  'blocked-network-apps.json'
)
const FALLBACK_BLOCKED_NETWORK_APPS = [
  'arc',
  'brave',
  'chrome',
  'discord',
  'element',
  'firefox',
  'iexplore',
  'lineapp',
  'msedge',
  'opera',
  'opera gx',
  'opera_gx',
  'pidgin',
  'qutebrowser',
  'signal',
  'skype',
  'slack',
  'teams',
  'teamsclassic',
  'telegram',
  'vivaldi',
  'wechat',
  'whatsapp',
  'whatsapp.root',
  'whatsappbeta',
  'whatsappbusiness',
  'zoom'
]

function normalizeRoomCode (roomCode) {
  return String(roomCode || '')
    .replace(/\s/g, '')
    .toUpperCase()
}

function findProtocolUrl (argv = []) {
  return argv.find(
    argument =>
      typeof argument === 'string' &&
      argument.toLowerCase().startsWith(`${PROTOCOL_NAME}://`)
  ) || null
}

function parseRoomLaunch (rawUrl) {
  if (!rawUrl) {
    return null
  }

  try {
    const parsedUrl = new URL(rawUrl)

    if (parsedUrl.protocol !== `${PROTOCOL_NAME}:`) {
      return null
    }

    let roomCode = ''

    if (parsedUrl.hostname.toLowerCase() === 'room') {
      roomCode = parsedUrl.pathname.replace(/^\/+/, '')
    } else if (parsedUrl.searchParams.get('code')) {
      roomCode = parsedUrl.searchParams.get('code')
    } else {
      const pathSegments = parsedUrl.pathname
        .split('/')
        .map(segment => segment.trim())
        .filter(Boolean)
      roomCode = pathSegments[pathSegments.length - 1] || ''
    }

    const normalizedRoomCode = normalizeRoomCode(roomCode)

    if (!normalizedRoomCode) {
      return null
    }

    const autoJoinValue = String(parsedUrl.searchParams.get('autoJoin') || '')
      .trim()
      .toLowerCase()

    return {
      roomCode: normalizedRoomCode,
      studentName: String(parsedUrl.searchParams.get('name') || '').trim(),
      studentEmail: String(parsedUrl.searchParams.get('email') || '').trim(),
      autoJoin: AUTO_JOIN_QUERY_VALUES.has(autoJoinValue)
    }
  } catch (error) {
    console.error('Failed to parse room launch URL:', error.message)
    return null
  }
}

function registerProtocolClient () {
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      return app.setAsDefaultProtocolClient(
        PROTOCOL_NAME,
        process.execPath,
        [path.resolve(process.argv[1])]
      )
    }

    return app.setAsDefaultProtocolClient(PROTOCOL_NAME)
  } catch (error) {
    console.error('Failed to register protocol client:', error.message)
    return false
  }
}

function buildRendererUrl (pageName, searchParams = {}) {
  const pageUrl = pathToFileURL(path.join(__dirname, 'renderer', pageName))

  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined || value === null || value === '') {
      continue
    }

    pageUrl.searchParams.set(key, String(value))
  }

  return pageUrl.toString()
}

function loadRendererPage (pageName, searchParams = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  return mainWindow.loadURL(buildRendererUrl(pageName, searchParams))
}

function focusMainWindow () {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

function loadPendingRoomLaunch () {
  if (!pendingRoomLaunch) {
    return
  }

  const roomLaunch = pendingRoomLaunch
  pendingRoomLaunch = null

  loadRendererPage('join.html', {
    code: roomLaunch.roomCode,
    name: roomLaunch.studentName,
    email: roomLaunch.studentEmail,
    autoJoin: roomLaunch.autoJoin ? '1' : undefined
  })
}

function queueRoomLaunch (rawUrl) {
  const parsedRoomLaunch = parseRoomLaunch(rawUrl)

  if (!parsedRoomLaunch) {
    return false
  }

  pendingRoomLaunch = parsedRoomLaunch

  if (!app.isReady()) {
    return true
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return true
  }

  focusMainWindow()
  loadPendingRoomLaunch()
  return true
}

pendingRoomLaunch = parseRoomLaunch(findProtocolUrl(process.argv))

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const protocolUrl = findProtocolUrl(argv)

    if (protocolUrl && queueRoomLaunch(protocolUrl)) {
      return
    }

    focusMainWindow()
  })
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  queueRoomLaunch(url)
})

function loadBlockedNetworkApps () {
  try {
    const rawConfig = fs.readFileSync(BLOCKED_APPS_CONFIG_PATH, 'utf8')
    const parsedConfig = JSON.parse(rawConfig)

    if (!Array.isArray(parsedConfig)) {
      throw new Error('Blocked network apps config must be an array.')
    }

    const normalizedApps = parsedConfig
      .map(entry =>
        String(entry || '')
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)

    if (normalizedApps.length === 0) {
      throw new Error('Blocked network apps config is empty.')
    }

    return normalizedApps
  } catch (error) {
    console.error(
      'Failed to load blocked network apps config, using fallback list:',
      error.message
    )
    return FALLBACK_BLOCKED_NETWORK_APPS
  }
}

function runProcessCommand (file, args = []) {
  return new Promise(resolve => {
    execFile(
      file,
      args,
      { windowsHide: true },
      (error, stdout = '', stderr = '') => {
        if (error) {
          resolve({
            ok: false,
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
            error
          })
          return
        }

        resolve({
          ok: true,
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          error: null
        })
      }
    )
  })
}

function setAiProctoringStatus (state, detail) {
  aiProctoringStatus = { state, detail }

  sendToRenderer(RENDERER_CHANNELS.aiProctoringStatus, aiProctoringStatus)
}

function sendToRenderer (channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send(channel, payload)
}

function isAiProctoringPortOpen () {
  return new Promise(resolve => {
    const socket = new net.Socket()

    const finish = isOpen => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(isOpen)
    }

    socket.setTimeout(1000)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(AI_PROCTORING_PORT, AI_PROCTORING_HOST)
  })
}

async function waitForAiProctoringReady (timeoutMs = 30000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await isAiProctoringPortOpen()) {
      return true
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  return false
}

function resolveAiPythonCommand () {
  const bundledPython = path.join(AI_PROCTORING_DIR, 'venv', 'Scripts', 'python.exe')

  if (fs.existsSync(bundledPython)) {
    return {
      file: bundledPython,
      args: [AI_PROCTORING_ENTRYPOINT]
    }
  }

  return {
    file: 'python',
    args: [AI_PROCTORING_ENTRYPOINT]
  }
}

async function ensureAiProctoringService () {
  if (await isAiProctoringPortOpen()) {
    setAiProctoringStatus('running', 'AI proctoring is connected.')
    return aiProctoringStatus
  }

  if (aiProctoringStartupPromise) {
    return aiProctoringStartupPromise
  }

  aiProctoringStartupPromise = (async () => {
    const { file, args } = resolveAiPythonCommand()

    setAiProctoringStatus('starting', 'Starting AI proctoring...')

    aiProctoringProcess = spawn(file, args, {
      cwd: AI_PROCTORING_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    aiProctoringProcess.stdout.on('data', chunk => {
      console.log(`[AI Proctoring] ${String(chunk).trimEnd()}`)
    })

    aiProctoringProcess.stderr.on('data', chunk => {
      console.error(`[AI Proctoring] ${String(chunk).trimEnd()}`)
    })

    aiProctoringProcess.once('error', error => {
      setAiProctoringStatus('error', `AI proctoring failed to start: ${error.message}`)
    })

    aiProctoringProcess.once('exit', code => {
      aiProctoringProcess = null

      if (aiProctoringStatus.state !== 'stopped') {
        const detail = code === 0
          ? 'AI proctoring stopped.'
          : `AI proctoring stopped unexpectedly (exit code ${code ?? 'unknown'}).`
        setAiProctoringStatus(code === 0 ? 'stopped' : 'error', detail)
      }
    })

    const isReady = await waitForAiProctoringReady()

    if (!isReady) {
      if (aiProctoringProcess && !aiProctoringProcess.killed) {
        aiProctoringProcess.kill()
      }

      aiProctoringProcess = null
      setAiProctoringStatus('error', 'AI proctoring did not become ready in time.')
      throw new Error('AI proctoring service did not become ready in time.')
    }

    setAiProctoringStatus('running', 'AI proctoring is connected.')
    return aiProctoringStatus
  })()

  try {
    return await aiProctoringStartupPromise
  } finally {
    aiProctoringStartupPromise = null
  }
}

function stopAiProctoringService () {
  if (!aiProctoringProcess) {
    if (aiProctoringStatus.state !== 'idle') {
      setAiProctoringStatus('stopped', 'AI proctoring stopped.')
    }
    return
  }

  setAiProctoringStatus('stopped', 'Stopping AI proctoring...')
  aiProctoringProcess.kill()
  aiProctoringProcess = null
}

function parseCsvLine (line) {
  const values = []
  let currentValue = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    const nextCharacter = line[index + 1]

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"'
        index += 1
        continue
      }

      insideQuotes = !insideQuotes
      continue
    }

    if (character === ',' && !insideQuotes) {
      values.push(currentValue)
      currentValue = ''
      continue
    }

    currentValue += character
  }

  values.push(currentValue)
  return values.map(value => value.trim())
}

function matchesBlockedPattern (processName, blockedPatterns) {
  const normalizedProcessName = String(processName || '')
    .toLowerCase()
    .replace(/\.exe$/i, '')

  return blockedPatterns.includes(normalizedProcessName)
}

async function getRunningProcesses () {
  const processResult = await runProcessCommand('powershell.exe', [
    '-NoProfile',
    '-Command',
    'Get-Process | Select-Object ProcessName,Id | ConvertTo-Json -Compress'
  ])

  if (!processResult.ok || !processResult.stdout.trim()) {
    return []
  }

  try {
    const parsedProcesses = JSON.parse(processResult.stdout)
    const processes = Array.isArray(parsedProcesses)
      ? parsedProcesses
      : [parsedProcesses]

    return processes
      .map(process => ({
        processName: String(process.ProcessName || ''),
        processId: String(process.Id || '')
      }))
      .filter(process => process.processName && process.processId)
  } catch (error) {
    console.error('Failed to parse running process list:', error.message)
    return []
  }
}

async function scanAndBlockNetworkApps () {
  if (isDevelopmentMode && !devBlockedAppMonitoringEnabled) {
    return
  }

  const blockedNetworkApps = loadBlockedNetworkApps()
  const runningProcesses = await getRunningProcesses()

  const detectedApps = new Set()
  for (const { processName, processId } of runningProcesses) {
    const normalizedProcessName = String(processName || '').toLowerCase()

    if (!matchesBlockedPattern(normalizedProcessName, blockedNetworkApps)) {
      continue
    }

    detectedApps.add(normalizedProcessName)
    await runProcessCommand('taskkill', ['/PID', processId, '/F'])
  }

  if (detectedApps.size > 0) {
    sendToRenderer(RENDERER_CHANNELS.networkAppBlocked, Array.from(detectedApps))
  }
}

function startExamMonitoring () {
  stopExamMonitoring()
  monitoringInterval = setInterval(scanAndBlockNetworkApps, 2000)
  scanAndBlockNetworkApps()
}

function stopExamMonitoring () {
  if (!monitoringInterval) {
    return
  }

  clearInterval(monitoringInterval)
  monitoringInterval = null
}

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (pendingRoomLaunch) {
    loadPendingRoomLaunch()
    return
  }

  loadRendererPage('login.html')
}

app.whenReady().then(() => {
  registerProtocolClient()

  if (!mainWindow) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// START FULLSCREEN WHEN EXAM STARTS
ipcMain.on('start-fullscreen', () => {
  mainWindow.setFullScreen(true)
  mainWindow.setKiosk(true)
})

ipcMain.on('exit-fullscreen', () => {
  if (!mainWindow) {
    return
  }

  stopExamMonitoring()
  mainWindow.setKiosk(false)
  mainWindow.setFullScreen(false)
})

ipcMain.on('start-exam-monitoring', () => {
  startExamMonitoring()
})

ipcMain.on('stop-exam-monitoring', () => {
  stopExamMonitoring()
})

ipcMain.handle('ensure-ai-proctoring-service', async () => {
  try {
    return await ensureAiProctoringService()
  } catch (error) {
    return {
      state: 'error',
      detail: error.message
    }
  }
})

ipcMain.handle('get-ai-proctoring-status', () => aiProctoringStatus)

ipcMain.on('stop-ai-proctoring-service', () => {
  stopAiProctoringService()
})

ipcMain.handle('get-exam-dev-settings', () => ({
  isDevelopmentMode,
  blockedAppMonitoringEnabled: isDevelopmentMode
    ? devBlockedAppMonitoringEnabled
    : true
}))

ipcMain.handle('safe-storage-is-available', () => safeStorage.isEncryptionAvailable())

ipcMain.handle('safe-storage-encrypt-string', (_event, value) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Safe storage encryption is unavailable on this device.')
  }

  return safeStorage.encryptString(String(value || '')).toString('base64')
})

ipcMain.handle('safe-storage-decrypt-string', (_event, value) => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Safe storage decryption is unavailable on this device.')
  }

  return safeStorage.decryptString(Buffer.from(String(value || ''), 'base64'))
})

ipcMain.handle('set-blocked-app-monitoring-enabled', (_, isEnabled) => {
  if (!isDevelopmentMode) {
    return {
      isDevelopmentMode,
      blockedAppMonitoringEnabled: true
    }
  }

  devBlockedAppMonitoringEnabled = Boolean(isEnabled)

  if (devBlockedAppMonitoringEnabled && monitoringInterval) {
    scanAndBlockNetworkApps()
  }

  return {
    isDevelopmentMode,
    blockedAppMonitoringEnabled: devBlockedAppMonitoringEnabled
  }
})

app.on('browser-window-created', (_, window) => {
  window.on('leave-full-screen', () => {
    sendToRenderer(RENDERER_CHANNELS.fullscreenExited)
  })
})

app.on('before-quit', () => {
  stopExamMonitoring()
  stopAiProctoringService()
})

// Open scanner page inside the existing main window
ipcMain.on('open-scanner', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  mainWindow.loadURL('http://localhost:3000/scan?source=electron&token=exam-complete')
})