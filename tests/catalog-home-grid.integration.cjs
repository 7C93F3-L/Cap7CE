const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-home-grid-'));
app.setPath('userData',root+'-profile');
const fixture=`
import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import CatalogHome from './src/renderer/catalog-workspace/CatalogHome';
import CatalogVirtualGrid from './src/renderer/computer-search/CatalogVirtualGrid';
import CatalogResultTile from './src/renderer/computer-search/CatalogResultTile';
import './src/renderer/results/ResultGrid.css';import './src/renderer/computer-search/ComputerSearchResultGrid.css';
import './src/renderer/computer-search/ComputerSearch.css';
window.probe={opens:[],thumbnailRequests:0,driveNames:['X:','Y:','Z:','W:'],failRead:false};
window.cap7ce={skim:{listLocations:async()=>Array.from({length:24},(_,index)=>({id:'system'+index,kind:'desktop',name:'Location '+index,path:'X:\\\\Location'+index})),read:async r=>{if(window.probe.failRead)throw Error('simulated system enumeration failure');return {taskId:r.taskId,cancelled:false,entries:window.probe.driveNames.map(name=>({kind:'drive',path:name+'\\\\'}))}},cancel:async()=>true}};
const items=Array.from({length:4},(_,index)=>({id:'file'+index,authorizationId:'file-auth'+index,name:'sample.txt',path:'X:\\\\sample.txt',isDirectory:false,extension:'.txt',iconName:'format-txt'}));
window.cap7ce.metadataBuild={startDirectory:async request=>{window.probe.metadataRequest=request;return {progress:{phase:'preparing'},directoryTask:{path:request.path,pending:1}}}};
function Fixture(){const [mode,setMode]=useState('square'),[version,setVersion]=useState(0),fileRoot=useRef(null);window.probe.refresh=()=>setVersion(v=>v+1);return <>
<button id="toggle" onClick={()=>setMode(value=>value==='square'?'gallery':'square')}>toggle</button>
<div id="home" className="pane"><CatalogHome refreshVersion={version} gridMode={mode} onOpen={path=>window.probe.opens.push(path)}/></div>
<div id="files" className="pane"><section className="cap-computer-search-results" ref={fileRoot}>
<CatalogVirtualGrid items={items} mode={mode} rootRef={fileRoot} renderItem={(item,style,onRatio)=><CatalogResultTile key={item.id}
item={item} style={style} onRatio={onRatio} className="cap-computer-search-entry" selected active visual={{taskId:'fixture',scrollContainerRef:fileRoot,foreground:false,showName:true}}/>}/>
</section></div></>};createRoot(document.getElementById('root')).render(<Fixture/>);
`;
app.whenReady().then(async()=>{
 let win;
 try{
  esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},outfile:path.join(root,'fixture.js'),bundle:true,platform:'browser',
    loader:{'.svg':'text'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}});
  fs.writeFileSync(path.join(root,'index.html'),`<style>
  :root{--cap-stable-grid-page-padding:10px;--cap-stable-text:#eee;--panel-bg:#222;--cap-ui-font-secondary:11px;--cap-stable-section-font-size:12px}
  body{margin:0}#root{display:flex;gap:10px;padding-top:30px}.pane{position:relative;width:420px;height:min(270px,calc(100vh - 40px))}
  .cap-catalog-home{position:absolute;inset:0;overflow:auto;padding:10px;box-sizing:border-box}
  /* Equal usable viewport widths isolate shared card geometry from native scrollbar reservation. */
  .pane .cap-catalog-home,.pane .cap-computer-search-results{scrollbar-width:none}
  </style><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>`);
  win=new BrowserWindow({show:false,width:950,height:750,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const run=code=>win.webContents.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const ready=async code=>{for(let n=0;n<120;n++){if(await run(code))return;await wait(20)}throw Error('Timeout '+code)};
  await win.loadFile(path.join(root,'index.html'));
  await ready("document.querySelectorAll('#home .thumb').length>0&&document.querySelector('#files .thumb').getBoundingClientRect().width>100");
  const geometry=selector=>run(`(()=>{const element=document.querySelector(${JSON.stringify(selector)}),rect=element.getBoundingClientRect();return {width:rect.width,height:rect.height,icon:getComputedStyle(element.querySelector('.result-file-card-icon')).width,name:getComputedStyle(element.querySelector('.result-file-card-name')).fontSize}})()`);
  assert.deepEqual(await geometry('#home .thumb'),await geometry('#files .thumb'),'home and file square geometry and icon/caption styles match');
  await run("document.querySelector('#home .thumb').click()");
  assert.equal(await run("document.querySelector('#home .thumb').classList.contains('selected')"),true);
  await run("document.querySelector('#home .thumb').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  assert.equal(await run('probe.opens.length'),1);
  await ready("document.querySelector('#home .cap-custom-scrollbar-vertical:not(.is-hidden)')");
  assert.equal(await run("getComputedStyle(document.querySelector('#home .cap-catalog-home')).scrollbarWidth"),'none','home uses the shared painted scrollbar');
  const thumb=await run("(()=>{const r=document.querySelector('#home .cap-custom-scrollbar-vertical .cap-custom-scrollbar-thumb').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+8)}})()");
  win.webContents.sendInputEvent({type:'mouseMove',...thumb});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...thumb});
  win.webContents.sendInputEvent({type:'mouseMove',x:thumb.x,y:thumb.y+240});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:thumb.x,y:thumb.y+240});
  await ready("document.querySelector('#home .cap-catalog-home').scrollTop>0");
  await run("document.querySelector('#home .cap-catalog-home').scrollTop=0");await ready("document.querySelector('#home .thumb.selected')");
  assert.equal(await run('probe.opens.length'),1,'scrollbar dragging preserves selection without opening an entry');
  await run("document.querySelector('#home .cap-catalog-home').scrollTop=100000");
  await ready("document.querySelectorAll('#home .cap-skim-root-group:last-child .thumb').length===4");
  await run("document.querySelector('#home .cap-skim-root-group-header').click()");
  await ready("document.querySelectorAll('#home .cap-skim-root-group:first-child .thumb').length===0&&document.querySelectorAll('#home .cap-skim-root-group:last-child .thumb').length===4");
  await run("document.querySelector('#toggle').click()");
  await ready("document.querySelector('#home .is-gallery .thumb')?.getBoundingClientRect().height>200&&document.querySelector('#files .is-gallery .thumb')?.getBoundingClientRect().height>200");
  await wait(40);
  assert.deepEqual(await geometry('#home .thumb'),await geometry('#files .thumb'),'home and file gallery geometry and captions match');
  await run("document.querySelector('#home .thumb').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  assert.equal(await run('probe.opens.length'),2);
  win.setSize(950,330);
  await ready("getComputedStyle(document.querySelector('#home .cap-catalog-home')).overflowY==='hidden'&&document.querySelector('#home .thumb')?.getBoundingClientRect().height===138&&document.querySelector('#files .thumb')?.getBoundingClientRect().height===138");
  assert.deepEqual(await geometry('#home .thumb'),await geometry('#files .thumb'),'compact horizontal geometry matches');
  await run("probe.failRead=true;probe.refresh()");await ready("document.querySelector('#home .cap-catalog-home > button')");
  assert.equal(await run("document.querySelector('#home .cap-skim-root-group:last-child .cap-catalog-file-grid').dataset.totalCount"),'4','failed refresh preserves known system drives');
  await run("probe.failRead=false;probe.driveNames=['X:'];document.querySelector('#home .cap-catalog-home > button').click()");
  await ready("!document.querySelector('#home .cap-catalog-home > button')&&document.querySelector('#home .cap-skim-root-group:last-child .cap-catalog-file-grid').dataset.totalCount==='1'");
  win.setSize(950,750);await run("document.querySelector('#home .cap-catalog-home').scrollTop=0");
  await run("document.querySelector('#home .cap-skim-root-group-header').click()");
  await ready("document.querySelector('#home .cap-skim-root-group:first-child .cap-skim-root-entry')");
  await run("document.querySelector('#home .cap-skim-root-group:first-child .cap-skim-root-entry').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:120,clientY:80}))");
  await ready("document.querySelector('[role=menuitem]')");
  assert.equal(await run("document.querySelector('[role=menuitem] span').textContent"),'获取/刷新元数据');
  await run("document.querySelector('[role=menuitem]').click()");await ready('probe.metadataRequest');
  assert.equal(await run('probe.metadataRequest.path'),'X:\\Location0');assert.equal(await run('probe.metadataRequest.allowMetadataExtraction'),true);
  console.log('Home and file grids: shared geometry, selection/navigation, independent drives, retry and system-folder metadata action passed.');
 }catch(error){console.error(error.stack);if(win&&!win.isDestroyed())console.error(await win.webContents.executeJavaScript('({height:innerHeight,media:matchMedia("(max-height:359.98px)").matches,overflow:getComputedStyle(document.querySelector(".cap-catalog-home")).overflowY,tiles:[...document.querySelectorAll(".thumb")].map(x=>({parent:x.closest(".pane").id,width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height}))})').catch(()=>null));process.exitCode=1}
 finally{win?.destroy();if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir()))throw Error('Unsafe fixture root');fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}
});
