const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI",{

 startFullscreen:()=>ipcRenderer.send("start-fullscreen")

});