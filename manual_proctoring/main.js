const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let mainWindow;

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

app.whenReady().then(createWindow);


// START FULLSCREEN WHEN EXAM STARTS
ipcMain.on("start-fullscreen",()=>{

 mainWindow.setFullScreen(true);
 mainWindow.setKiosk(true);

});