const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let serverProcess;

function createWindow(){

 mainWindow = new BrowserWindow({
  width:1200,
  height:800,
  autoHideMenuBar:true,
  webPreferences:{
   preload:path.join(__dirname,"preload.js"),
   contextIsolation:true
  }
 });

 mainWindow.loadFile("renderer/login.html");

}

function startServer() {
  serverProcess = spawn('node', ['backend/server.js'], { stdio: 'inherit' });
}

app.whenReady().then(() => {
  startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  app.quit();
});


// START FULLSCREEN WHEN EXAM STARTS
ipcMain.on("start-fullscreen",()=>{

 mainWindow.setFullScreen(true);
 mainWindow.setKiosk(true);

});