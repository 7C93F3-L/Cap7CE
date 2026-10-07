const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-navigation-'));
app.setPath('userData',root+'-profile');
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';
import CatalogWorkspace from './src/renderer/catalog-workspace/CatalogWorkspace';
const noop=()=>{},probe=window.probe={requests:[],canceled:[],building:true};
window.cap7ce={skim:{listLocations:async()=>[]},preview:{onNavigate:()=>noop,onClosed:()=>noop},
favoriteDirectories:{list:async()=>[{id:'fav',name:'Favorite',path:'X:\\\\Favorite'}]},
metadataBuild:{status:async()=>({volumes:[],scopeLabels:{},policy:{volumeOrder:[],includes:[],excludes:[]},progress:{phase:'idle',discovered:0,processed:0,failed:0,unsupported:0,total:null}})},
computerSearch:{status:async()=>({state:probe.building?'building':'ready',searchAvailable:!probe.building,catalogRevision:1,volumes:['X:','Y:'].map(displayName=>({displayName,volumeId:displayName,state:probe.building?'building':'ready',queryable:!probe.building,processed:2,total:2}))}),onCatalogChanged:()=>noop,
search:async request=>{probe.requests.push(request);const dir=request.scopePath?.length===3;return {items:[{id:request.scopePath,authorizationId:request.taskId,name:dir?'Folder':'file.txt',path:request.scopePath+(dir?'Folder':'\\\\file.txt'),isDirectory:dir,extension:dir?'':'.txt',iconName:dir?'folder':'format-txt',canThumbnail:false,canShellPreview:false,modifiedUtcTicks:(Date.UTC(2026,9,6)+11644473600000)*10000}],nextCursor:null}},cancel:async task=>{probe.canceled.push(task);return true}}};
createRoot(document.getElementById('root')).render(<CatalogWorkspace theme="dark" appearanceColors={{}} windowMaterial="none" onOpenSettings={noop}/>);
`;
app.whenReady().then(async()=>{
 let win;
 try{
  const output=esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,platform:'browser',write:false,
    loader:{'.svg':'text','.css':'empty'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}}).outputFiles;
  const js=output.find(file=>file.path.endsWith('.js'))??output[0];fs.writeFileSync(path.join(root,'fixture.js'),js.text);
  fs.writeFileSync(path.join(root,'index.html'),'<div id="root"></div><script src="fixture.js"></script>');
  win=new BrowserWindow({show:false,width:1100,height:750,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const run=code=>win.webContents.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const ready=async code=>{for(let n=0;n<150;n++){if(await run(code))return;await wait(20)}throw Error('Timeout '+code)};
  await win.loadFile(path.join(root,'index.html'));await ready("document.querySelectorAll('.cap-catalog-home .cap-skim-root-entry').length===2");
  const active="document.querySelector('[role=tabpanel]:not([hidden])')";
  const openDrive=async name=>{await run(`(()=>{const b=[...document.querySelectorAll('.cap-catalog-home .cap-skim-root-entry')].find(b=>b.textContent.includes('${name}'));b.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))})()`);await ready("probe.requests.at(-1)?.scopePath==="+JSON.stringify(name+'\\'));};

  assert.equal(await run("document.querySelectorAll('.cap-catalog-home .cap-skim-root-entry').length"),2,'home remains visible even when every volume is building');
  assert.equal(await run('probe.requests.length'),0,'home must not submit an unavailable global query');
  await run('probe.building=false');
  await ready("!document.querySelector('.cap-catalog-address-toggle').disabled");
  await openDrive('X:');await ready(`${active}.querySelector('.cap-computer-search-entry')`);
  assert.equal(await run("document.querySelectorAll('[role=tabpanel]').length"),1,'drive opens in current page');
  assert.equal(await run("document.querySelectorAll('[role=tab]').length"),0,'single page does not display redundant tabs');
  assert.equal(await run(`${active}.id`),'catalog:all');
  assert.equal(await run("probe.requests.at(-1).scopeKind"),'direct-children');
  await run(`${active}.querySelector('.cap-computer-search-entry').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await ready("probe.requests.at(-1)?.scopePath==='X:\\\\Folder'");
  await run(`${active}.querySelector('.cap-catalog-directory-toolbar button').click()`);
  await ready("probe.requests.at(-1)?.scopePath==='X:\\\\'");
  await run(`${active}.querySelectorAll('.cap-catalog-directory-toolbar button')[2].click()`);
  await ready(`${active}.querySelector('.cap-catalog-home')`);
  await openDrive('Y:');
  await run(`${active}.querySelectorAll('.cap-catalog-directory-toolbar button')[3].click()`);
  await ready(`${active}.querySelector('.cap-catalog-home')`);
  const before=await run('probe.requests.length');
  await run("document.querySelectorAll('.cap-catalog-layout-tools button')[0].click()");
  await ready("document.querySelector('.cap-catalog-filter-host').hidden");
  await run("document.querySelectorAll('.cap-catalog-layout-tools button')[1].click()");
  assert.equal(await run("document.querySelector('.cap-catalog-details-host').hidden"),true);
  await run("document.querySelector('.cap-catalog-brand').click()");
  await ready("document.querySelector('.cap-catalog-sidebar').classList.contains('is-collapsed')");
  await run("document.querySelector('.cap-catalog-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  assert.equal(await run("document.querySelector('.cap-catalog-resizer').getAttribute('aria-valuenow')"),'68');
  assert.equal(await run('probe.requests.length'),before,'layout controls never change query scope');
  await run("document.querySelector('.cap-favorite-row .cap-favorite-open').click()");
  await ready("probe.requests.at(-1)?.scopePath==='X:\\\\Favorite'");
  assert.equal(await run("document.querySelectorAll('[role=tabpanel]').length"),1,'ordinary favorite replaces current page');
  assert.equal(await run(`${active}.querySelector('.cap-catalog-address-toggle').getAttribute('aria-pressed')`),'true','favorite defaults to search');
  assert.equal(await run(`${active}.querySelector('.cap-computer-search-grid').classList.contains('is-gallery')`),true);
  await run("document.querySelectorAll('.cap-catalog-layout-tools button')[1].click()");
  await run(`${active}.querySelector('.cap-computer-search-entry').click()`);
  await ready("document.querySelector('.cap-catalog-details-host').textContent.includes('file.txt')");
  assert.equal(await run("document.querySelector('.cap-catalog-details-host').textContent.includes('2026')"),true,'Catalog FILETIME dates use the NTFS epoch');
  const oldRequests=await run('probe.requests.length');
  await run(`${active}.querySelector('.cap-catalog-address-toggle').click();${active}.querySelector('.cap-catalog-grid-toggle').click()`);
  assert.equal(await run(`${active}.querySelector('.cap-computer-search-grid').classList.contains('is-square')`),true);
  assert.equal(await run('probe.requests.length'),oldRequests,'address and grid modes are presentation only');
  assert.equal(await run("document.querySelectorAll('.cap-catalog-layout-tools button').length"),2,'only panel controls remain');
  assert.equal(await run("document.querySelectorAll('[role=tab],.cap-catalog-header').length"),0,'tab UI is removed');
  await run("document.querySelector('.cap-favorite-row .cap-favorite-open').dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}))");
  await ready("document.querySelectorAll('[role=tabpanel]').length===1");
  assert.equal(await run("document.querySelectorAll('[role=tabpanel]').length"),1,'modified favorite click retains a single current page');
  console.log('Catalog design: current-page navigation, independent panels, sidebar width, favorite defaults, selection details, two grids and no tab UI passed.');

 }catch(error){console.error(error.stack);process.exitCode=1}
 finally{win?.destroy();if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir()))throw Error('Unsafe fixture root');fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}
});
