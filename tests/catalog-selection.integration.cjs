const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-selection-'));
app.setPath('userData',root+'-profile');
const fixture=String.raw`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import CatalogWorkspace from './src/renderer/catalog-workspace/CatalogWorkspace';
const noop=()=>{},p=window.probe={opened:[],copied:[]};
window.cap7ce={settingsWindow:{onMetadataBuildRequested:()=>noop},skim:{listLocations:async()=>[],read:async r=>({taskId:r.taskId,cancelled:false,entries:[{kind:'drive',path:'X:\\'}]}),cancel:async()=>true},
 preview:{onNavigate:()=>noop,onClosed:()=>noop,open:async data=>{p.opened.push(data);return true}},favoriteDirectories:{list:async()=>[]},
 metadataBuild:{status:async()=>({volumes:[],scopeLabels:{},policy:{volumeOrder:[],includes:[],excludes:[]},progress:{phase:'idle',discovered:0,processed:0,failed:0,unsupported:0,total:null}})},
 computerSearch:{status:async()=>({state:'ready',searchAvailable:true,catalogRevision:1,volumes:[{displayName:'X:',volumeId:'X:',state:'ready',queryable:true,processed:4,total:4}]}),onCatalogChanged:()=>noop,
 search:async r=>({taskId:r.taskId,items:Array.from({length:4},(_,i)=>({id:'file'+i,authorizationId:r.taskId+'_'+i,name:'sample'+i+'.txt',path:'X:\\sample'+i+'.txt',extension:'.txt',isDirectory:false,canThumbnail:false,iconName:'format-txt',sizeBytes:1,modifiedUtcTicks:null,previewKind:'fileInfo'})),nextCursor:null}),
 inspect:async r=>({path:'X:\\sample.txt',name:'sample.txt',size:1,modifiedAt:null}),copyPaths:async r=>{p.copied.push(r);return r.authorizationIds.length},cancel:async()=>true}};
function Fixture(){const [foreground,setForeground]=useState(true);p.foreground=setForeground;return <>
 <header data-window-controls="true"><button id="window-control">Window control</button></header>
 <CatalogWorkspace foreground={foreground} theme="dark" appearanceColors={{}} windowMaterial="none" onOpenSettings={noop}/>
 <div data-settings-view="true"><button id="settings-control">Settings control</button></div>
 </>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
app.whenReady().then(async()=>{
 let win;
 try{
  const output=esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,platform:'browser',write:false,
   loader:{'.svg':'text','.css':'empty'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}}).outputFiles[0].text;
  fs.writeFileSync(path.join(root,'fixture.js'),output);fs.writeFileSync(path.join(root,'index.html'),'<div id="root"></div><script src="fixture.js"></script>');
  win=new BrowserWindow({show:false,width:1000,height:750,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const run=code=>win.webContents.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const ready=async code=>{for(let i=0;i<150;i++){if(await run(code))return;await wait(20)}throw Error('Timeout '+code)};
  const click=async(selector,options={})=>{await run(`(()=>{const target=document.querySelector(${JSON.stringify(selector)}),options=${JSON.stringify(options)};target.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,...options}));if(target.isConnected){target.focus?.();target.dispatchEvent(new MouseEvent('click',{bubbles:true,...options}))}})()`);await wait(50)};
  const escape=async selector=>{await run(`(()=>{const target=document.querySelector(${JSON.stringify(selector)});target.focus();target.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}))})()`);await wait(50)};
  const count=()=>run("document.querySelectorAll('.thumb.selected').length");
  const tile=i=>`.cap-computer-search-entry[aria-label="sample${i}.txt"]`;
  await win.loadFile(path.join(root,'index.html'));await ready("document.querySelector('.cap-skim-root-entry')");
  await click('.cap-skim-root-entry');assert.equal(await count(),1);
  await escape('.cap-skim-root-entry');assert.equal(await count(),0,'home Escape clears');
  assert.equal(await run("document.activeElement.closest('[data-result-tile]')===null"),true,'cleared tile loses keyboard focus');
  await click('.cap-skim-root-entry');await click('.cap-catalog-brand');assert.equal(await count(),0,'sidebar clears home selection');
  await click('.cap-skim-root-entry');await click('#window-control');await click('#settings-control');assert.equal(await count(),1,'window and settings controls retain home selection');
  await click('.cap-catalog-home');assert.equal(await count(),0,'home blank clears');
  await run("document.querySelector('.cap-skim-root-entry').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await ready("document.querySelectorAll('.cap-computer-search-entry').length===4");
  await click(tile(0));await click(tile(1),{ctrlKey:true});assert.equal(await count(),2,'Ctrl multi-selection survives tile pointer capture');
  await escape(tile(1));assert.equal(await count(),0,'file Escape clears all selection');
  await click(tile(3),{shiftKey:true});assert.equal(await count(),1,'clearing also resets range anchor');
  await click('.cap-catalog-brand');assert.equal(await count(),0,'sidebar clears files');
  await click(tile(0));await click('.cap-catalog-details-name');assert.equal(await count(),1,'details content preserves selection');
  await click('.cap-catalog-details button');await ready('probe.opened.length===1');assert.equal(await count(),1,'details preview button works without clearing');
  await run(`document.querySelector(${JSON.stringify(tile(0))}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:40,clientY:70}))`);
  await ready("document.querySelector('[data-context-menu]')");
  await run("document.querySelector('[data-context-menu]').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}))");assert.equal(await count(),1,'menu pointer preserves selection');
  await escape('[data-context-menu]');assert.equal(await run("!!document.querySelector('[data-context-menu]')"),false);assert.equal(await count(),1,'first Escape closes menu only');
  await escape(tile(0));assert.equal(await count(),0,'next Escape clears selection');
  await click('.cap-catalog-address-toggle');await click(tile(0));
  await escape('.cap-catalog-directory-toolbar input');assert.equal(await count(),1,'input consumes Escape before selection');
  await run('probe.foreground(false)');await wait(50);await click('.cap-catalog-brand');assert.equal(await count(),1,'background selection listeners retired');
  await run('probe.foreground(true)');await wait(50);await click('.cap-computer-search-results');assert.equal(await count(),0,'foreground blank clears');
  await run("document.body.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'C',code:'KeyC',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))");await wait(50);
  assert.equal(await run('probe.opened.length'),1,'cleared active item cannot preview via Space');assert.equal(await run('probe.copied.length'),0,'cleared items are not copied');
  await click(tile(0));await click('.cap-catalog-grid-toggle');assert.equal(await count(),0,'other toolbar areas clear files');
  console.log('Catalog selection: home/files, outside/blank, multi-select anchor, details preview, menu/input Escape priority, controls and foreground guards passed.');
 }catch(error){console.error(error.stack);process.exitCode=1}
 finally{win?.destroy();if(path.dirname(root)!==os.tmpdir())throw Error('Unsafe fixture root');fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}
});
