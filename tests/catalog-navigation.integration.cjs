const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-navigation-'));
app.setPath('userData',root+'-profile');
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';
import CatalogWorkspace from './src/renderer/catalog-workspace/CatalogWorkspace';import {useCatalogWindowCommands} from './src/renderer/catalog-workspace/useCatalogWindowCommands';
const noop=()=>{},probe=window.probe={requests:[],canceled:[],statusReads:0,locationReads:0,building:true,attributesAvailable:false,colorsAvailable:false,forceEmpty:false};
window.cap7ce={settingsWindow:{onMetadataBuildRequested:callback=>{probe.openMetadata=callback;return noop}},window:{onRefreshCurrentPageRequested:()=>noop,onFocusMainSearch:()=>noop,onActivateSkimRequested:()=>noop,onToggleSkimLocationPickerRequested:()=>noop,onActivateShellModeShortcut:()=>noop},skim:{listLocations:async()=>{probe.locationReads++;return []}},preview:{onNavigate:()=>noop,onClosed:()=>noop},
favoriteDirectories:{list:async()=>[{id:'fav',name:'Favorite',path:'X:\\\\Favorite'}]},
metadataBuild:{status:async()=>({volumes:[{volumeId:'X:',label:'X:'}],scopeLabels:{},policy:{volumeOrder:[],includes:[],excludes:[]},progress:{phase:'idle',discovered:0,processed:0,failed:0,unsupported:0,total:null}})},
computerSearch:{status:async()=>{probe.statusReads++;return ({state:probe.building?'building':'ready',searchAvailable:!probe.building,catalogRevision:1,volumes:['X:','Y:'].map(displayName=>({displayName,volumeId:displayName,state:probe.building?'building':'ready',queryable:!probe.building,processed:2,total:2}))})},onCatalogChanged:()=>noop,
search:async request=>{if(!/^[A-Za-z0-9_-]{1,128}$/.test(request.taskId))throw Error("invalid task identity");probe.requests.push(request);if(request.taskId.endsWith('_attribute')&&(!probe.attributesAvailable||(request.facts?.visualGroups&&!probe.colorsAvailable)))return {items:[],nextCursor:null};if(!request.taskId.endsWith('_attribute')&&probe.forceEmpty)return {items:[],nextCursor:null};const dir=request.scopePath?.length===3;return {items:[{id:request.scopePath,authorizationId:request.taskId,name:dir?'Folder':'file.txt',path:request.scopePath+(dir?'Folder':'\\\\file.txt'),isDirectory:dir,extension:dir?'':'.txt',iconName:dir?'folder':'format-txt',canThumbnail:false,canShellPreview:false,modifiedUtcTicks:(Date.UTC(2026,9,6)+11644473600000)*10000}],nextCursor:null}},cancel:async task=>{probe.canceled.push(task);return true}}};
function Harness(){const commands=useCatalogWindowCommands(null);return <CatalogWorkspace onActiveActions={commands.reportActions} theme="dark" appearanceColors={{}} windowMaterial="none" onOpenSettings={noop}/>};createRoot(document.getElementById('root')).render(<Harness/>);
`;
app.whenReady().then(async()=>{
 let win;
 try{
  const output=esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,platform:'browser',write:false,
    loader:{'.svg':'text','.css':'empty'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}}).outputFiles;
  const js=output.find(file=>file.path.endsWith('.js'))??output[0];fs.writeFileSync(path.join(root,'fixture.js'),js.text);
  fs.writeFileSync(path.join(root,'index.html'),'<div id="root"></div><script src="fixture.js"></script>');
  win=new BrowserWindow({show:false,width:1100,height:750,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const run=code=>win.webContents.executeJavaScript(code).catch(error=>{console.error("Failed renderer action:",code);throw error}),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const ready=async code=>{for(let n=0;n<150;n++){if(await run(code))return;await wait(20)}throw Error('Timeout '+code)};
  await win.loadFile(path.join(root,'index.html'));await ready("document.querySelectorAll('.cap-catalog-home .cap-skim-root-entry').length===2");
  const active="document.querySelector('[role=tabpanel]:not([hidden])')";
  const goHome=async()=>{await run(`if(${active}.querySelector('.cap-catalog-address-toggle').getAttribute('aria-pressed')==='true')${active}.querySelector('.cap-catalog-address-toggle').click()`);await ready(`${active}.querySelector('.cap-catalog-breadcrumb > button')`);await run(`${active}.querySelector('.cap-catalog-breadcrumb > button').click()`)};
  const openDrive=async name=>{await run(`(()=>{const b=[...document.querySelectorAll('.cap-catalog-home .cap-skim-root-entry')].find(b=>b.getAttribute('title').slice(0,2)==='${name}');b.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))})()`);await ready("probe.requests.at(-1)?.scopePath==="+JSON.stringify(name+'\\'));};

  assert.equal(await run("document.querySelectorAll('.cap-catalog-home .cap-skim-root-entry').length"),2,'home remains visible even when every volume is building');
  assert.equal(await run('probe.requests.length'),0,'home must not submit an unavailable global query');
  await run('probe.building=false');
  await ready("!document.querySelector('.cap-catalog-address-toggle').disabled");
  const reads=await run('probe.statusReads'), locations=await run('probe.locationReads');
  await run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'F5',bubbles:true,cancelable:true}))");
  await ready('probe.statusReads>'+reads+'&&probe.locationReads>'+locations);
  assert.equal(await run('probe.requests.length'),0,'F5 at home refreshes locations and status without a whole-disk query');
  await openDrive('X:');await ready(`${active}.querySelector('.cap-computer-search-entry')`);
  assert.equal(await run('probe.requests.at(-1).excludeHidden'),true,'hidden entries excluded initially');
  await run(`${active}.querySelector('.cap-catalog-hidden-switch').click()`);await ready('probe.requests.at(-1).excludeHidden===false');
  await run(`${active}.querySelector('.cap-catalog-view-controls button').click()`);await ready("document.querySelector('.cap-stable-sidebar-flyout')");
  await run("document.querySelectorAll('.cap-stable-sidebar-flyout button')[2].click()");await ready("probe.requests.at(-1).sort==='modified-descending'");
  const requestCount=await run('probe.requests.length');
  await run(`${active}.querySelector('[aria-label="刷新"]').click()`);await ready('probe.requests.length>'+requestCount);
  assert.deepEqual(await run('({scope:probe.requests.at(-1).scopePath,kind:probe.requests.at(-1).scopeKind,sort:probe.requests.at(-1).sort,hidden:probe.requests.at(-1).excludeHidden})'),{scope:'X:\\',kind:'direct-children',sort:'modified-descending',hidden:false},'refresh preserves browse range and display options');
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
  await goHome();
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
  await goHome();
  await ready(`${active}.querySelector('.cap-catalog-home')`);
  await run("document.querySelectorAll('.cap-catalog-layout-tools button')[0].click()");
  await run("document.querySelector('.cap-stable-file-type-options > button').click()");
  await ready(`${active}.querySelector('.cap-catalog-address-toggle').getAttribute('aria-pressed')==='true'`);
  await ready("document.querySelector('.cap-catalog-attribute-notice').textContent.includes('尚无')");
  assert.equal(await run("Boolean(document.querySelector('.cap-catalog-attribute-notice').closest('.cap-catalog-top-filters'))"),false,'attribute notice belongs to content overlay');
  await run("document.querySelector('.cap-catalog-attribute-notice button[aria-label]').click()");
  await ready("!document.querySelector('.cap-catalog-attribute-notice')");
  assert.equal(await run("document.querySelector('.cap-stable-metadata-filters').disabled"),true,'missing scoped attributes disable detailed conditions');
  assert.equal(await run("document.querySelector('.cap-catalog-details header').textContent"),'当前搜索');
  assert.equal(await run("document.querySelector('.cap-catalog-details').textContent.includes('搜索范围')"),true);
  await run("document.querySelector('.cap-catalog-filter-actions button').click()");
  await ready(`${active}.querySelector('.cap-catalog-home')`);
  assert.equal(await run(`${active}.querySelector('.cap-catalog-address-toggle').getAttribute('aria-pressed')`),'false','clearing filters restores home breadcrumb');
  await run("probe.attributesAvailable=true;document.querySelector('.cap-stable-file-type-options > button').click()");
  await ready("!document.querySelector('.cap-stable-metadata-filters').disabled");
  assert.equal(await run("document.querySelector('.cap-stable-metadata-colors').disabled"),true,'dimensions do not imply color availability');
  await run("probe.forceEmpty=true;document.querySelector('.cap-stable-ratio-options button').click()");
  await ready(`${active}.textContent.includes('没有符合当前条件的文件')`);
  assert.equal(await run(`${active}.textContent.includes('更短的关键词')`),false,'filter empty state must not suggest shortening an absent keyword');
  await goHome();
  await ready(`${active}.querySelector('.cap-catalog-home')`);
  assert.equal(await run("document.querySelector('.cap-catalog-filter-actions span').textContent"),'0 项条件','home action clears conditions');
  assert.equal(await run("document.querySelector('[aria-label=\"文件属性建库\"]')===null"),true,'sidebar no longer duplicates the indexing entry');
  await run('probe.openMetadata()');
  await ready("!!document.querySelector('.cap-metadata-build-slot.is-floating .cap-metadata-build')");
  await run('probe.openMetadata()');
  assert.equal(await run("document.querySelectorAll('.cap-metadata-build-slot.is-floating').length"),1,'repeated settings requests keep the original panel open');
  await run("document.querySelector('.cap-metadata-build-close').click()");
  await ready("!document.querySelector('.cap-metadata-build-slot.is-floating')");
  console.log('Catalog design: current-page navigation, independent panels, sidebar width, favorite defaults, selection details, two grids and no tab UI passed.');

 }catch(error){console.error(error.stack);process.exitCode=1}
 finally{win?.destroy();if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir()))throw Error('Unsafe fixture root');fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}
});
