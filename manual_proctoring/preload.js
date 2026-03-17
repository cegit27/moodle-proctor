const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI",{

 startFullscreen:()=>ipcRenderer.send("start-fullscreen"),
 
 endTest:()=>ipcRenderer.send("end-test"),
 
 isTestActive:()=>ipcRenderer.invoke("is-test-active"),
 
 onWindowSwitched:(callback)=>ipcRenderer.on("window-switched", callback),
 
 onWindowsKeyPressed:(callback)=>ipcRenderer.on("windows-key-pressed", callback)

});