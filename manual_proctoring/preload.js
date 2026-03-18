const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI",{

 startFullscreen:()=>ipcRenderer.send("start-fullscreen"),
 exitFullscreen:()=>ipcRenderer.send("exit-fullscreen"),
 startExamMonitoring:()=>ipcRenderer.send("start-exam-monitoring"),
 stopExamMonitoring:()=>ipcRenderer.send("stop-exam-monitoring"),
 stopAIProctoringService:()=>ipcRenderer.send("stop-ai-proctoring-service"),
 ensureAIProctoringService:()=>ipcRenderer.invoke("ensure-ai-proctoring-service"),
 getAIProctoringStatus:()=>ipcRenderer.invoke("get-ai-proctoring-status"),
 getExamDevSettings:()=>ipcRenderer.invoke("get-exam-dev-settings"),
 setBlockedAppMonitoringEnabled:(isEnabled)=>ipcRenderer.invoke("set-blocked-app-monitoring-enabled", isEnabled),
 onFullscreenExited:(callback)=>ipcRenderer.on("fullscreen-exited", callback),
 onNetworkAppBlocked:(callback)=>ipcRenderer.on("network-app-blocked", (_, processes) => callback(processes)),
 onAIProctoringStatus:(callback)=>ipcRenderer.on("ai-proctoring-status", (_, status) => callback(status))

});
