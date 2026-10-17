const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { app, BrowserWindow } = require('electron'), esbuild = require('esbuild');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Cap7CE-search-lifecycle-'));
app.setPath('userData', root + '-profile');
const fixture = String.raw`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {useComputerSearchController} from './src/renderer/computer-search/useComputerSearchController';
import {useComputerSearchMetadataRefresh} from './src/renderer/computer-search/useComputerSearchMetadataRefresh';
const p=window.probe={requests:[],canceled:[],hold:false,fail:false,preparing:false};
window.cap7ce={computerSearch:{status:async()=>({state:'ready',searchAvailable:true,volumes:[],catalogRevision:1}),
 onCatalogChanged:cb=>{p.publish=cb;cb(1);return ()=>{p.publish=null}},
 search:async request=>{p.requests.push(request);if(p.preparing)throw Error('scope-preparing');if(p.hold){p.hold=false;await new Promise(r=>p.resume=r)}
 if(p.fail){p.fail=false;throw Error('search failed')}
 return {taskId:request.taskId,items:[{id:request.scopePath,name:'Folder',path:request.scopePath+'Folder',isDirectory:true}],nextCursor:null}},
 cancel:async id=>{p.canceled.push(id);return true}}};
function makeFixture(){return function Fixture(){const [scope,setScope]=useState(null);
 p.scope=setScope;p.controller=useComputerSearchController(scope,true,undefined,undefined,true,true,scope===null);
 useComputerSearchMetadataRefresh(p.controller.active,true,p.controller.busy||!p.controller.hasSubmitted,p.controller.refreshResults,false);
 return <div>{p.controller.busy?'searching':p.controller.items.map(x=>x.id).join(',')}</div>}}
const root=createRoot(document.getElementById('root'));let Fixture=makeFixture();
window.RefreshRuntime.register(Fixture,'SearchFixture');root.render(<Fixture/>);
p.refresh=()=>{Fixture=makeFixture();window.RefreshRuntime.register(Fixture,'SearchFixture');window.RefreshRuntime.performReactRefresh()};
p.unmount=()=>root.unmount();
`;
app.whenReady().then(async () => {
 let win;
 try {
  const build = contents => esbuild.buildSync({stdin:{contents,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},
   bundle:true,platform:'browser',write:false,define:{'process.env.NODE_ENV':'"development"'}}).outputFiles[0].text;
  fs.writeFileSync(path.join(root,'refresh.js'),build("import RefreshRuntime from 'react-refresh/runtime';window.RefreshRuntime=RefreshRuntime;RefreshRuntime.injectIntoGlobalHook(window);"));
  fs.writeFileSync(path.join(root,'fixture.js'),build(fixture));
  fs.writeFileSync(path.join(root,'index.html'),'<div id="root"></div><script src="refresh.js"></script><script src="fixture.js"></script>');
  win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const run=code=>win.webContents.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const ready=async code=>{for(let n=0;n<150;n++){if(await run(code))return;await wait(20)}
   console.log(await run('({active:probe.controller.active,busy:probe.controller.busy,items:probe.controller.items,requests:probe.requests,canceled:probe.canceled})'));
   throw Error('Timeout: '+code)};
  await win.loadFile(path.join(root,'index.html'));
  await ready('probe.controller.active&&probe.controller.status?.searchAvailable');
  assert.equal(await run('probe.requests.length'),0,'home remains idle');
  await run('probe.refresh()');await wait(80);
  assert.equal(await run('probe.controller.active'),true,'Fast Refresh preserves enabled search state');
  await run('probe.scope("F:\\\\")');
  await ready('probe.controller.items.length===1&&!probe.controller.busy');
  assert.equal(await run('probe.requests.at(-1).scopeKind'),'direct-children');
  await run('probe.hold=true;probe.scope("D:\\\\")');await ready('typeof probe.resume==="function"');
  const old=await run('probe.requests.at(-1).taskId');
  await run('probe.refresh()');
  await ready('probe.controller.items.length===1&&!probe.controller.busy');
  assert.equal(await run(`probe.canceled.includes(${JSON.stringify(old)})`),true,'refresh cancels previous owner');
  const owner=await run('probe.controller.taskId');await run('probe.resume()');await wait(50);
  assert.equal(await run('probe.controller.taskId'),owner,'late response cannot replace refreshed owner');
  await run('probe.fail=true;probe.scope("E:\\\\")');await ready('probe.controller.error==="failed"&&!probe.controller.busy');
  await run('probe.scope("F:\\\\")');await ready('probe.controller.items.length===1&&!probe.controller.busy&&!probe.controller.error');
  await run('probe.preparing=true;probe.scope("C:/")');await ready('probe.controller.error==="scope-preparing"&&!probe.controller.busy');
  const waitingRequests=await run('probe.requests.length');await wait(150);
  assert.equal(await run('probe.requests.length'),waitingRequests,'preparing scope does not add a retry poll');
  await run('probe.preparing=false;probe.publish(2)');
  await ready('probe.controller.items.length===1&&!probe.controller.error');
  assert.equal(await run('probe.requests.length'),waitingRequests+1,'Catalog publication recovers the waiting location without a click');
  const last=await run('probe.controller.taskId');await run('probe.unmount()');
  assert.equal(await run(`probe.canceled.includes(${JSON.stringify(last)})`),true,'unmount still cancels search');
  console.log('Search lifecycle: Fast Refresh, pending cancellation, late replies, failure recovery and unmount passed.');
 } catch(error){console.error(error.stack);process.exitCode=1}
 finally{win?.destroy();if(path.dirname(root)!==os.tmpdir())throw Error('Unsafe fixture root');fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}
});
