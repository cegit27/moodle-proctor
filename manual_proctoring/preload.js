const { contextBridge, ipcRenderer } = require('electron')

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
  aiProctoringStatus: 'ai-proctoring-status'
}

function send(channel, ...args) {
  return ipcRenderer.send(channel, ...args)
}

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args)
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
  onFullscreenExited: callback =>
    ipcRenderer.on(IPC_CHANNELS.fullscreenExited, callback),
  onNetworkAppBlocked: callback =>
    ipcRenderer.on(IPC_CHANNELS.networkAppBlocked, (_, processes) =>
      callback(processes)
    ),
  onAIProctoringStatus: callback =>
    ipcRenderer.on(IPC_CHANNELS.aiProctoringStatus, (_, status) =>
      callback(status)
    )
})
