const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,BrowserWindow,ipcMain}=require('electron'),esbuild=require('esbuild');
const {registerMetadataBuildIpc}=require('../dist-electron/metadataExtraction/metadataBuildIpc.js');
const repo=path.resolve(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-directory-ui-'));app.setPath('userData',root+'-profile');
const volumeId='A'.repeat(32),folder='X:\\Assets\\A very long folder name for checking compact task layout';
const progress=phase=>({phase,volumeId,discovered:3,processed:1,failed:0,unsupported:0,total:3,progressFraction:1/3,remainingSeconds:null,errorCode:null});
let state={progress:progress('idle'),policy:null,volumes:[{volumeId,label:'X:'}],scopeLabels:{}},reads=0,starts=0,win;
const api={status:async()=>{reads++;return structuredClone(state)},resolveScope:async()=>({volumeId,rootFileReference:'1'.repeat(16),label:folder}),
 start:async()=>{throw Error('directory controls must not start a full sweep')},
 startDirectory:async request=>{assert.equal(request.path,folder);assert.equal(request.allowMetadataExtraction,true);starts++;state={...state,progress:progress('waiting'),directoryTask:{path:request.path,pending:1}};return state},
 pause:async()=>{state.progress=progress('paused');return state},resume:async()=>{state.progress=progress('extracting');return state},
 cancelDirectories:async()=>{delete state.directoryTask;state.progress=progress('idle');return state}};
registerMetadataBuildIpc(ipcMain,event=>event.sender===win?.webContents,api);
const fixture=`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import Slot from './src/renderer/metadata-build/MetadataBuildSlot';import {useDirectoryMetadataAction} from './src/renderer/metadata-build/useDirectoryMetadataAction';
import './src/renderer/stable-ui/StableUiFoundation.css';import './src/renderer/catalog-workspace/CatalogDesign.css';
function Fixture(){const [open,setOpen]=useState(false),action=useDirectoryMetadataAction();return <div className="app cap-stable-ui theme-dark">
<button id="request" onClick={()=>action.start(${JSON.stringify(folder)})}>folder metadata</button>
<Slot enabled={false} foreground floating controlsOpen={open} onRequestControls={()=>setOpen(v=>!v)}/></div>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
app.whenReady().then(async()=>{try{
 esbuild.buildSync({stdin:{contents:fixture,loader:'tsx',resolveDir:repo},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),define:{'process.env.NODE_ENV':'"production"'}});
 fs.writeFileSync(path.join(root,'index.html'),'<link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 win=new BrowserWindow({show:false,width:1000,height:750,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(repo,'dist-electron/preload.js')}});
 const errors=[];win.webContents.on('preload-error',(_,__,error)=>errors.push(error.message));
 const run=code=>win.webContents.executeJavaScript(code),ready=async code=>{for(let n=0;n<150;n++){if(await run(code))return;await new Promise(r=>setTimeout(r,20))}throw Error('Timeout '+code)};
 const clickLabel=label=>run(`([...document.querySelectorAll('button')].find(e=>e.innerText===${JSON.stringify(label)})).click()`);
 await win.loadFile(path.join(root,'index.html'));await ready('document.querySelector("#request")');assert.equal(reads,0,'idle home does not wake Core to read metadata status');
 await run('document.querySelector("#request").click()');await ready('document.querySelector(".cap-metadata-build-slot.is-compact")');assert.equal(starts,1);
 assert.equal(await run('document.querySelector(".cap-metadata-build-slot > span").title'),folder);
 await clickLabel('查看任务');await ready('document.querySelector(".cap-metadata-build")');
 assert.equal(await run('document.querySelector(".cap-metadata-build-heading strong").innerText'),'正在等待磁盘或任务恢复');
 assert.ok(await run('document.querySelector(".cap-metadata-build-footer").innerText.includes("包含子文件夹")'));
 assert.equal(await run('[...document.querySelectorAll("button")].some(e=>e.innerText==="范围与顺序")'),false,'directory run does not edit the global policy');
 await clickLabel('暂停');await ready('document.querySelector(".cap-metadata-build-heading strong").innerText==="已暂停"');
 const pausedReads=reads;await new Promise(r=>setTimeout(r,1100));assert.equal(reads,pausedReads,'paused UI does not poll');
 await clickLabel('继续');await ready('document.querySelector(".cap-metadata-build-heading strong").innerText==="正在提取文件属性"');
 await clickLabel('取消目录任务');await ready('!document.querySelector(".cap-metadata-build-footer").innerText.includes("包含子文件夹")');
 assert.equal(state.policy,null);assert.equal(state.directoryTask,undefined);assert.deepEqual(errors,[]);
 console.log('Directory metadata UI: real sandbox IPC, dormant home, task wakeup/scope, waiting, pause without polling, resume and cancel passed.');
}catch(error){console.error(error.stack);process.exitCode=1}finally{win?.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
