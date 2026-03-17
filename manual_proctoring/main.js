const { app, BrowserWindow, ipcMain, Menu, globalShortcut } = require("electron");
const path = require("path");

let mainWindow;
let isTestActive = false;

function createWindow(){

 const windowOptions = {
  width:1200,
  height:800,
  autoHideMenuBar:true,
  webPreferences:{
   preload:path.join(__dirname,"preload.js"),
   contextIsolation:true,
   nodeIntegration:false,
   enableRemoteModule:false,
   sandbox:true
  }
 };

 mainWindow = new BrowserWindow(windowOptions);

 // Detect window focus loss (indicates Alt+Tab or window switch)
 mainWindow.on("blur", ()=>{
  if(isTestActive){
   // Add small delay to filter out permission dialog blur (temporary)
   const blurTime = Date.now();
   setTimeout(()=>{
    // If window is still blurred after 500ms, it's a real Alt+Tab
    if(!mainWindow.isFocused()){
     mainWindow.webContents.send("window-switched");
     mainWindow.focus();
    }
   }, 500);
  }
 });

 // Setup keyboard shortcut blocking for when test is active
 mainWindow.webContents.on("before-input-event", (event, input)=>{
  if(isTestActive){
   // Block ESC key
   if(input.key.toLowerCase() === "escape"){
    event.preventDefault();
   }
   // Block Alt+Tab
   if(input.alt && input.key.toLowerCase() === "tab"){
    event.preventDefault();
   }
   // Block F11 (toggle fullscreen)
   if(input.key === "F11"){
    event.preventDefault();
   }
   // Block Alt+F4 (close window)
   if(input.alt && input.key === "F4"){
    event.preventDefault();
   }
   // Block Ctrl+Shift+I (DevTools)
   if(input.control && input.shift && input.key.toLowerCase() === "i"){
    event.preventDefault();
   }
   // Block Ctrl+Shift+C (DevTools inspector)
   if(input.control && input.shift && input.key.toLowerCase() === "c"){
    event.preventDefault();
   }
   // Detect Windows/Meta key press
   if(input.key.toLowerCase() === "meta"){
    event.preventDefault();
    mainWindow.webContents.send("windows-key-pressed");
   }
  }
 });

 mainWindow.loadFile("renderer/login.html");

}

app.whenReady().then(createWindow);

// START TEST - ENTER FULLSCREEN AND KIOSK MODE
ipcMain.on("start-fullscreen",()=>{

 isTestActive = true;
 mainWindow.setFullScreen(true);
 mainWindow.setKiosk(true);
 Menu.setApplicationMenu(null);

 // Block Alt+Tab and Alt+Shift+Tab globally
 globalShortcut.register("Alt+Tab", ()=>false);
 globalShortcut.register("Alt+Shift+Tab", ()=>false);

});

// END TEST - EXIT FULLSCREEN AND KIOSK MODE
ipcMain.on("end-test",()=>{

 isTestActive = false;
 mainWindow.setKiosk(false);
 mainWindow.setFullScreen(false);

 // Unblock Alt+Tab shortcuts
 globalShortcut.unregister("Alt+Tab");
 globalShortcut.unregister("Alt+Shift+Tab");

});

// CHECK IF TEST IS ACTIVE
ipcMain.handle("is-test-active",()=>{

 return isTestActive;

});