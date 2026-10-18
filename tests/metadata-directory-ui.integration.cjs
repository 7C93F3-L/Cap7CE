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
import BottomNoticeBar from './src/renderer/feedback/BottomNoticeBar';
import './src/renderer/stable-ui/StableUiFoundation.css';import './src/renderer/catalog-workspace/CatalogDesign.css';
import './src/renderer/catalog-workspace/CatalogActivity.css';
function Fixture(){const [open,setOpen]=useState(false),action=useDirectoryMetadataAction();return <div className="app cap-stable-ui theme-dark"><div className="cap-catalog-design" style={{display:'block',position:'relative',height:'100vh',width:'100%'}}>
<button id="request" onClick={()=>action.start(${JSON.stringify(folder)})}>folder metadata</button>
<div className="cap-catalog-activity-dock"><BottomNoticeBar className="probe-temporary-notice" message="临时提醒" progress={{label:'处理进度'}} actions={<button type="button">取消</button>}/>
<Slot enabled={false} foreground floating controlsOpen={open} onRequestControls={()=>{window.manageRequests=(window.manageRequests||0)+1}}/></div></div></div>}
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
 const bars=()=>run(`(()=>{const host=document.querySelector('.cap-catalog-design');host.style.setProperty('--cap-stable-surface','rgba(60,70,90,.18)');return [...document.querySelectorAll('.cap-bottom-notice-bar')].map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=s.backgroundColor;x.fillRect(0,0,1,1);return {alpha:x.getImageData(0,0,1,1).data[3],background:s.backgroundColor,padding:s.padding,radius:s.borderRadius,height:r.height,top:r.top,bottom:r.bottom,clipped:e.scrollWidth>e.clientWidth+1}})})()`);
 for(const theme of ['light','dark']){
  await run(`document.querySelector('.app').className='app cap-stable-ui theme-${theme}'`);
  const [temporary,metadata]=await bars();assert.equal(temporary.alpha,255,'temporary notices are opaque even with a translucent theme surface');assert.equal(metadata.alpha,255);
  for(const field of ['background','padding','radius','height'])assert.equal(temporary[field],metadata[field],`both bottom strips share ${field}`);
  assert.ok(temporary.height<=40);assert.ok(temporary.bottom<=metadata.top,'simultaneous strips do not overlap');assert.equal(metadata.clipped,false);
 }
 win.setContentSize(380,500);await new Promise(r=>setTimeout(r,50));assert.ok((await bars()).every(bar=>!bar.clipped),'both compact strips fit narrow windows');win.setContentSize(1000,750);
 await run("document.querySelector('.cap-catalog-design').style.removeProperty('--cap-stable-surface');document.querySelector('.app').className='app cap-stable-ui theme-dark'");
 await clickLabel('查看任务');assert.equal(await run('window.manageRequests'),1);
 assert.equal(await run('!!document.querySelector(".cap-metadata-build")'),false,'main view keeps only the compact notice');
 assert.ok(await run('!!document.querySelector(".cap-metadata-build-slot.is-compact")'));
 state={...state,progress:{...progress('completed'),processed:3,failed:1,total:3,progressFraction:1},directoryTask:{path:folder,pending:0}};
 await run('window.dispatchEvent(new Event("cap-metadata-build-changed"))');await ready('document.querySelector(".cap-metadata-build-slot")?.textContent.includes("1 项未能提取")');
 await clickLabel('×');await ready('!document.querySelector(".cap-metadata-build-slot")');
 await run('window.dispatchEvent(new Event("cap-metadata-build-changed"))');await new Promise(r=>setTimeout(r,50));assert.equal(await run('!!document.querySelector(".cap-metadata-build-slot")'),false,'dismissed completion does not return');
 assert.deepEqual(errors,[]);
 console.log('Directory metadata UI: dormant home, sandbox task wakeup, compact notice geometry, unified management entry and completion dismissal passed.');
}catch(error){console.error(error.stack);process.exitCode=1}finally{win?.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
