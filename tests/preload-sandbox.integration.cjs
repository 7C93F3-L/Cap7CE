const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs'),os=require('node:os'),crypto=require('node:crypto');
const {app,BrowserWindow,ipcMain}=require('electron');
const profile=path.join(os.tmpdir(),'Cap7CE-preload-sandbox-'+crypto.randomUUID());
fs.mkdirSync(profile);app.setPath('userData',profile);app.setPath('sessionData',profile);
app.whenReady().then(async()=>{
  let window;
  try {
    const errors=[];
    ipcMain.handle('metadataBuild:status',()=>({progress:{phase:'idle'},volumes:[]}));
    ipcMain.handle('favoriteDirectories:list',()=>[]);
    ipcMain.handle('window:getAlwaysOnTop',()=>false);
    window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,
      preload:path.resolve(__dirname,'../dist-electron/preload.js')}});
    window.webContents.on('preload-error',(_,__,error)=>errors.push(error.message));
    await window.loadURL('data:text/html,<html><body>Sandbox bridge fixture</body></html>');
    const result=await window.webContents.executeJavaScript(`(async()=>{
      const api=window.cap7ce;
      if(!api)return {available:false,nodeAccess:typeof require};
      return {available:true,nodeAccess:typeof require,
        phase:(await api.metadataBuild.status()).progress.phase,
        favorites:(await api.favoriteDirectories.list()).length,
        pinned:await api.window.getAlwaysOnTop(),
        shellAction:typeof api.window.setShellState,
        changeSubscription:typeof api.computerSearch.onCatalogChanged,trashAction:typeof api.computerSearch.moveToTrash};
    })()`);
    assert.deepEqual(errors,[],'production preload must load inside the sandbox');
    assert.deepEqual(result,{available:true,nodeAccess:'undefined',phase:'idle',favorites:0,pinned:false,
      shellAction:'function',changeSubscription:'function',trashAction:'function'});
    console.log('Production preload exposes domain and existing window bridges in a real isolated sandbox.');
    window.destroy();app.exit(0);
  } catch(error){console.error(error);window?.destroy();app.exit(1)}
});
