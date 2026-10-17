const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow,ipcMain}=require('electron'),esbuild=require('esbuild');
const {CatalogViewPreferenceStore}=require('../dist-electron/catalogViewPreferenceStore.js'),{registerCatalogGridPreferenceIpc}=require('../dist-electron/catalogGridPreferenceIpc.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-view-ui-')),file=path.join(root,'catalog-view.json');app.setPath('userData',root+'-profile');app.on('window-all-closed',()=>{});
const store=new CatalogViewPreferenceStore(()=>file),empty={get:async()=>({}),update:async()=>({})};let delayed=null,failWrite=false,reads=0;
registerCatalogGridPreferenceIpc(ipcMain,empty,empty,{get:()=>{reads++;return delayed??store.get()},update:(scope,patch)=>failWrite?Promise.reject(Error('save-failed')):store.update(scope,patch)});
const fixture=String.raw`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{useCatalogViewOptions}from'./src/renderer/catalog-workspace/useCatalogViewOptions';
import{useCatalogRandomBrowse}from'./src/renderer/catalog-workspace/useCatalogRandomBrowse';import CatalogDirectoryToolbar from './src/renderer/catalog-workspace/CatalogDirectoryToolbar';
const noop=()=>{};function Fixture(){const [scope,setScope]=useState([null,'X:\\']),view=useCatalogViewOptions(...scope),random=useCatalogRandomBrowse();window.probe={view,random,navigate:(...args)=>setScope(args)};
return <div className="cap-catalog-design"><CatalogDirectoryToolbar path={scope[1]} canBack={false} canForward={false} canUp={false} onBack={noop} onForward={noop} onUp={noop} onOpen={noop} onHome={noop}
searchMode={false} onSearchMode={noop} query="" onQuery={noop} onSubmit={noop} enabled inputRef={{current:null}} gridMode="square" onGridMode={noop} gridSize={100} onGridSize={noop} onGridSizeCommit={noop}
onRefresh={noop} refreshing={false} random={random} sort={view.sort} onSort={value=>{random.disable();view.setSort(value)}} showHidden={view.showHidden} onShowHidden={view.toggleHidden} includeSubfolders={view.includeSubfolders} onIncludeSubfolders={view.toggleSubfolders}/></div>};
createRoot(document.getElementById('root')).render(<Fixture/>);`;
app.whenReady().then(async()=>{let win;try{
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),loader:{'.svg':'text'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}});
 fs.writeFileSync(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 const open=async()=>{win=new BrowserWindow({show:false,width:1100,height:650,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.resolve(__dirname,'../dist-electron/preload.js')}});await win.loadFile(path.join(root,'index.html'))};
 const run=c=>win.webContents.executeJavaScript(c),wait=ms=>new Promise(r=>setTimeout(r,ms));const ready=async c=>{for(let n=0;n<180;n++){if(await run(c))return;await wait(20)}throw Error('Timeout '+c)};
 await open();await ready('!!window.probe');await run('window.cap7ce.preferences.getCatalogView()');assert.equal(fs.existsSync(file),false,'opening the toolbar does not write default preferences');assert.equal(reads,2,'three fields share one initial IPC read');
 assert.deepEqual(await run('[...document.querySelectorAll(".cap-catalog-random-toggle,.cap-catalog-size-toggle,.cap-catalog-grid-toggle,.cap-catalog-sort-toggle,.cap-catalog-subfolders-toggle,.cap-catalog-hidden-switch")].map(e=>e.className)'),['cap-catalog-random-toggle','cap-catalog-size-toggle','cap-catalog-grid-toggle','cap-catalog-sort-toggle','cap-catalog-subfolders-toggle','cap-catalog-hidden-switch']);
 assert.equal(await run('getComputedStyle(document.querySelector(".cap-catalog-random-controls")).borderRightWidth'),'1px');
 await run('probe.view.setSort("modified-descending");probe.view.toggleHidden();probe.view.toggleSubfolders()');
 await ready('(async()=>{const p=(await window.cap7ce.preferences.getCatalogView()).computer;return p?.sort==="modified-descending"&&p.showHidden&&p.includeSubfolders})()');
 await run(String.raw`probe.navigate(null,"Y:\\Other")`);await ready('probe.view.sort==="modified-descending"&&probe.view.showHidden&&probe.view.includeSubfolders');
 await run(String.raw`probe.navigate("X:\\Favorite A","X:\\Favorite A")`);await ready('probe.view.sort==="name-ascending"&&!probe.view.showHidden&&!probe.view.includeSubfolders');
 await run('probe.view.setSort("name-descending");probe.view.toggleSubfolders();probe.view.toggleHidden();probe.view.toggleHidden()');
 await ready('(async()=>{const p=(await window.cap7ce.preferences.getCatalogView())["favorite:x:\\\\favorite a"];return p?.sort==="name-descending"&&p.includeSubfolders&&p.showHidden===false})()');
 await run(String.raw`probe.navigate("X:\\Favorite A","X:\\Favorite A\\Child")`);await ready('probe.view.sort==="name-descending"&&probe.view.includeSubfolders&&!probe.view.showHidden');
 await run(String.raw`probe.navigate("X:\\Favorite B","X:\\Favorite B")`);await ready('probe.view.sort==="name-ascending"&&!probe.view.includeSubfolders&&!probe.view.showHidden');
 await run(String.raw`probe.navigate("X:\\Favorite A","X:\\Outside")`);await ready('probe.view.sort==="modified-descending"&&probe.view.includeSubfolders&&probe.view.showHidden');
 await run('probe.random.toggle()');await ready('probe.random.enabled&&document.querySelector(".cap-catalog-random-next")');const saved=fs.readFileSync(file,'utf8');win.destroy();await open();await ready('probe.view.sort==="modified-descending"&&probe.view.showHidden&&probe.view.includeSubfolders');assert.equal(await run('probe.random.enabled'),false,'random browsing is not persisted');assert.equal(fs.readFileSync(file,'utf8'),saved);
 failWrite=true;await run('probe.view.toggleHidden()');await ready('probe.view.error&&probe.view.showHidden');failWrite=false;assert.equal(fs.readFileSync(file,'utf8'),saved,'failed save rolls back its field only');
 win.destroy();await store.update(null,{sort:'modified-ascending',showHidden:false,includeSubfolders:true});let release;const snapshot=await store.get();delayed=new Promise(r=>release=r);await open();await ready('!!window.probe');await run('probe.view.toggleHidden()');release(snapshot);delayed=null;
 await ready('probe.view.sort==="modified-ascending"&&probe.view.includeSubfolders&&probe.view.showHidden');assert.equal((await store.get()).computer.sort,'modified-ascending','early toggles cannot overwrite unread fields');
 console.log('View toolbar: real sandbox IPC, shared reads, scoped restart, rapid changes, stale initial reads, field rollback, random exclusion, icon order and separator passed.');
 }catch(error){console.error(error);process.exitCode=1}finally{win?.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
