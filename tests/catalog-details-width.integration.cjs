const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const repo=path.resolve(__dirname,'..'),storageKey='cap7ce.catalog.details-width.v1';
if(!process.versions.electron){
 const {spawnSync}=require('node:child_process'),root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-details-width-'));
 try{for(const phase of ['write','restart']){const result=spawnSync(require('electron'),[__filename,root,phase],{cwd:repo,encoding:'utf8',timeout:30000});
  if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);assert.equal(result.status,0,result.error?.message??'sidebar width '+phase);}
  console.log('Right sidebar width: real process restart, drag commit, keyboard/reset, invalid/blocked storage and viewport preference retention passed.');
 }finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});}
}else{
 const {app,BrowserWindow,session}=require('electron'),esbuild=require('esbuild'),root=process.argv[2],phase=process.argv[3];
 app.setPath('userData',path.join(root,'profile'));app.on('window-all-closed',()=>{});
 const fixture=String.raw`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {useCatalogDetailsWidth} from './src/renderer/catalog-workspace/useCatalogDetailsWidth';import Resizer from './src/renderer/catalog-workspace/CatalogDetailsResizer';
import './src/renderer/catalog-workspace/CatalogDesign.css';
const p=window.probe={};function Panel({sidebar}){const layout=useCatalogDetailsWidth(sidebar,true);return <aside style={{position:'absolute',right:0,top:0,bottom:0,width:layout.width}}><Resizer layout={layout}/></aside>}
function Fixture(){const [mounted,setMounted]=useState(true),[sidebar,setSidebar]=useState(156);p.mount=v=>flushSync(()=>setMounted(v));p.sidebar=v=>flushSync(()=>setSidebar(v));return mounted?<Panel sidebar={sidebar}/>:null}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
 app.whenReady().then(async()=>{let win;try{
  esbuild.buildSync({stdin:{contents:fixture,resolveDir:repo,loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),define:{'process.env.NODE_ENV':'"production"'}});
  fs.writeFileSync(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
  win=new BrowserWindow({show:false,width:1250,height:650,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  await win.loadFile(path.join(root,'index.html'));
  const run=c=>win.webContents.executeJavaScript(c),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const ready=async c=>{for(let i=0;i<150;i++){if(await run(c))return;await wait(20)}throw Error('Timeout '+c)};
  const width=()=>run('Number(document.querySelector("[role=separator]").getAttribute("aria-valuenow"))');
  const stored=()=>run(`localStorage.getItem('${storageKey}')`);
  const key=arrow=>run(`document.querySelector('[role=separator]').dispatchEvent(new KeyboardEvent('keydown',{key:'${arrow}',bubbles:true}))`);
  await ready('document.querySelector("[role=separator]")');
  if(phase==='restart'){assert.equal(await width(),340,'last completed drag survives a real Electron process restart');assert.equal(await stored(),'340');}
  else{
   assert.equal(await width(),280);await key('ArrowLeft');assert.equal(await width(),296);assert.equal(await stored(),'296');
   await run(`probe.mount(false);localStorage.setItem('${storageKey}','not-a-width');probe.mount(true)`);assert.equal(await width(),280,'invalid settings use the default');
   await run('probe.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error("blocked")};true');await key('ArrowLeft');assert.equal(await width(),296,'blocked storage does not stop resizing');
   await run('Storage.prototype.setItem=probe.originalSet;document.querySelector("[role=separator]").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))');assert.equal(await stored(),'280');
   await run('for(let i=0;i<10;i++)document.querySelector("[role=separator]").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true}))');assert.equal(await width(),420);assert.equal(await stored(),'420');
   await run('probe.sidebar(320)');win.setContentSize(1050,650);await ready('Number(document.querySelector("[role=separator]").getAttribute("aria-valuenow"))===398');assert.equal(await stored(),'420','viewport limits never overwrite the preferred width');
   await run('probe.sidebar(156)');win.setContentSize(1250,650);await ready('Number(document.querySelector("[role=separator]").getAttribute("aria-valuenow"))===420');
   await run('document.querySelector("[role=separator]").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))');
   const point=await run('(()=>{const r=document.querySelector("[role=separator]").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:60}})()');
   win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
   win.webContents.sendInputEvent({type:'mouseMove',x:point.x-60,y:point.y});await ready('Number(document.querySelector("[role=separator]").getAttribute("aria-valuenow"))===340');
   assert.equal(await stored(),'280','drag movement is a preview until pointer release');
   win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:point.x-60,y:point.y});await ready(`localStorage.getItem('${storageKey}')==='340'`);
  }
  session.defaultSession.flushStorageData();
 }catch(error){console.error(error.stack);process.exitCode=1}finally{win?.destroy();if(process.exitCode)app.exit(process.exitCode);else app.quit()}});
}
