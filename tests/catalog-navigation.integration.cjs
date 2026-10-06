const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-navigation-'));
app.setPath('userData',root+'-profile');
const fixture=`
import React from 'react';import {createRoot} from 'react-dom/client';
import CatalogWorkspace from './src/renderer/catalog-workspace/CatalogWorkspace';
const noop=()=>{},probe=window.probe={requests:[],canceled:[]};
window.cap7ce={skim:{listLocations:async()=>[]},preview:{onNavigate:()=>noop,onClosed:()=>noop},
favoriteDirectories:{list:async()=>[{id:'fav',name:'Favorite',path:'X:\\\\Favorite'}]},
metadataBuild:{status:async()=>({volumes:[],scopeLabels:{},policy:{volumeOrder:[],includes:[],excludes:[]},progress:{phase:'idle',discovered:0,processed:0,failed:0,unsupported:0,total:null}})},
computerSearch:{status:async()=>({state:'ready',searchAvailable:true,catalogRevision:1,volumes:['X:','Y:'].map(displayName=>({displayName,volumeId:displayName,state:'ready',queryable:true,processed:2,total:2}))}),onCatalogChanged:()=>noop,
search:async request=>{probe.requests.push(request);const dir=request.scopePath?.length===3;return {items:[{id:request.scopePath,authorizationId:request.taskId,name:dir?'Folder':'file.txt',path:request.scopePath+(dir?'Folder':'\\\\file.txt'),isDirectory:dir,extension:dir?'':'.txt',iconName:dir?'folder':'format-txt',canThumbnail:false,canShellPreview:false}],nextCursor:null}},cancel:async task=>{probe.canceled.push(task);return true}}};
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
  await openDrive('X:');await ready(`${active}.querySelector('.cap-computer-search-entry')`);
  assert.equal(await run("document.querySelectorAll('[role=tab]').length"),1,'drive opens in current tab');
  assert.equal(await run(`${active}.id`),'catalog:all');
  assert.equal(await run("document.querySelector('.cap-catalog-rail button').getAttribute('aria-pressed')"),'false','ordinary browsing does not enter skim mode');
  assert.equal(await run("probe.requests.at(-1).scopeKind"),'direct-children');
  await run(`${active}.querySelector('.cap-computer-search-entry').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await ready("probe.requests.at(-1)?.scopePath==='X:\\\\Folder'");
  assert.equal(await run("document.querySelectorAll('[role=tab]').length"),1,'nested directory keeps tab owner');
  await run(`${active}.querySelector('.cap-catalog-directory-toolbar button').click()`);
  await ready("probe.requests.at(-1)?.scopePath==='X:\\\\'");
  await run(`${active}.querySelectorAll('.cap-catalog-directory-toolbar button')[2].click()`);
  await ready(`${active}.querySelector('.cap-catalog-home')`);
  await openDrive('Y:');
  assert.equal(await run("document.querySelectorAll('[role=tab]').length"),1,'another disk does not add a skim tab');
  await run(`${active}.querySelectorAll('.cap-catalog-directory-toolbar button')[3].click()`);
  await ready(`${active}.querySelector('.cap-catalog-home')`);
  console.log('Catalog navigation: drive, nested folder, back/up/home and second disk retain the current tab and normal mode.');
 }catch(error){console.error(error.stack);process.exitCode=1}
 finally{win?.destroy();if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir()))throw Error('Unsafe fixture root');fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}
});
