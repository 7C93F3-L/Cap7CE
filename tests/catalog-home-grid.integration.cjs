const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-home-grid-'));
app.setPath('userData',root+'-profile');
const fixture=`
import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import CatalogHome from './src/renderer/catalog-workspace/CatalogHome';
import CatalogVirtualGrid from './src/renderer/computer-search/CatalogVirtualGrid';
import CatalogResultTile from './src/renderer/computer-search/CatalogResultTile';
import CatalogGridScrollbars from './src/renderer/catalog-workspace/CatalogGridScrollbars';
import './src/renderer/results/ResultGrid.css';import './src/renderer/computer-search/ComputerSearchResultGrid.css';
import './src/renderer/computer-search/ComputerSearch.css';
import './src/renderer/catalog-workspace/CatalogWorkspace.css';
window.probe={opens:[],thumbnailRequests:0,locationCount:24,driveNames:['X:','Y:','Z:','W:'],failRead:false};
window.cap7ce={skim:{listLocations:async()=>Array.from({length:window.probe.locationCount},(_,index)=>({id:'system'+index,kind:'desktop',name:'Location '+index,path:'X:\\\\Location'+index})),read:async r=>{if(window.probe.failRead)throw Error('simulated system enumeration failure');return {taskId:r.taskId,cancelled:false,entries:window.probe.driveNames.map(name=>({kind:'drive',path:name+'\\\\'}))}},cancel:async()=>true}};
const items=Array.from({length:24},(_,index)=>({id:'file'+index,authorizationId:'file-auth'+index,name:'sample.txt',path:'X:\\\\sample.txt',isDirectory:false,extension:'.txt',iconName:'format-txt'}));
window.cap7ce.metadataBuild={startDirectory:async request=>{window.probe.metadataRequest=request;return {progress:{phase:'preparing'},directoryTask:{path:request.path,pending:1}}}};
function Fixture(){const [mode,setMode]=useState('square'),[version,setVersion]=useState(0),fileRoot=useRef(null);window.probe.refresh=()=>setVersion(v=>v+1);return <>
<button id="toggle" onClick={()=>setMode(value=>value==='square'?'gallery':'square')}>toggle</button>
<div id="home" className="pane"><CatalogHome refreshVersion={version} gridMode={mode} onOpen={path=>window.probe.opens.push(path)}/></div>
<div id="files" className="pane"><section className="cap-computer-search-results" ref={fileRoot}>
<CatalogVirtualGrid items={items} mode={mode} rootRef={fileRoot} renderItem={(item,style,onRatio)=><CatalogResultTile key={item.id}
item={item} style={style} onRatio={onRatio} className="cap-computer-search-entry" selected active visual={{taskId:'fixture',scrollContainerRef:fileRoot,foreground:false,showName:true}}/>}/>
</section><CatalogGridScrollbars scrollContainerRef={fileRoot}/></div></>};createRoot(document.getElementById('root')).render(<Fixture/>);
`;
app.whenReady().then(async()=>{
 let win;
 try{
  esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},outfile:path.join(root,'fixture.js'),bundle:true,platform:'browser',
    loader:{'.svg':'text'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}});
  fs.writeFileSync(path.join(root,'index.html'),`<style>
  :root{--cap-stable-grid-page-padding:10px;--cap-stable-text:#eee;--panel-bg:#222;--cap-ui-font-secondary:11px;--cap-stable-section-font-size:12px}
  body{margin:0}#root{display:flex;gap:10px;padding-top:30px}.pane{position:relative;width:420px;height:min(270px,calc(100vh - 40px))}
  /* Equal usable viewport widths isolate shared card geometry from native scrollbar reservation. */
  .pane .cap-catalog-home,.pane .cap-computer-search-results{scrollbar-width:none}
  </style><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>`);
  win=new BrowserWindow({show:false,width:950,height:750,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const run=code=>win.webContents.executeJavaScript(code),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const ready=async code=>{for(let n=0;n<120;n++){if(await run(code))return;await wait(20)}throw Error('Timeout '+code)};
  await win.loadFile(path.join(root,'index.html'));
  await ready("document.querySelectorAll('#home .thumb').length>0&&document.querySelector('#files .thumb').getBoundingClientRect().width>100");
  const geometry=selector=>run(`(()=>{const element=document.querySelector(${JSON.stringify(selector)}),rect=element.getBoundingClientRect();return {width:rect.width,height:rect.height,icon:getComputedStyle(element.querySelector('.result-file-card-icon')).width,name:getComputedStyle(element.querySelector('.result-file-card-name')).fontSize}})()`);
  assert.deepEqual(await geometry('#home .thumb'),await geometry('#files .thumb'),'home and file square geometry and icon/caption styles match');
  const roots=['#home .cap-catalog-home','#files .cap-computer-search-results'];
  const wheel=(selector,options)=>run(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),event=new WheelEvent('wheel',{bubbles:true,cancelable:true,...${JSON.stringify(options)}});node.dispatchEvent(event);return {left:node.scrollLeft,prevented:event.defaultPrevented}})()`);
  for(const selector of roots)assert.deepEqual(await wheel(selector,{deltaY:45}),{left:0,prevented:false},'normal-height grids retain native vertical wheel behavior');
  await run("document.querySelectorAll('.pane').forEach(node=>node.style.width='236px')");
  await ready("document.querySelector('#home .thumb')?.getBoundingClientRect().width===105.5&&document.querySelector('#files .thumb')?.getBoundingClientRect().width===105.5");
  for(const selector of roots){
    const tiles=await run(`(()=>{const grid=document.querySelector(${JSON.stringify(selector)}).querySelector('.cap-catalog-file-grid'),r=grid.getBoundingClientRect();return [...grid.children].slice(0,3).map(node=>{const t=node.getBoundingClientRect();return {left:t.left-r.left,top:t.top-r.top,width:t.width,height:t.height}})})()`);
    assert.equal(tiles[0].top,tiles[1].top,'narrow home and file grids retain two columns');
    assert.equal(tiles[2].left,tiles[0].left);assert.ok(tiles[2].top>tiles[0].top,'the third item starts the next row');
    assert.equal(tiles[1].left+tiles[1].width,216,'both cards fit the available width');
    assert.equal(tiles[0].height,tiles[0].width,'narrow cards remain square');
  }
  await run("document.querySelectorAll('.pane').forEach(node=>node.style.width='420px')");
  await ready("document.querySelector('#home .thumb')?.getBoundingClientRect().width>190&&document.querySelector('#files .thumb')?.getBoundingClientRect().width>190");
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
  assert.equal(await run("document.querySelectorAll('#home h3.cap-catalog-home-group-title').length"),2,'both groups retain semantic static headings');
  assert.equal(await run("document.querySelectorAll('#home .cap-skim-root-group-header,#home .cap-skim-root-group-chevron').length"),0,'home no longer uses interactive collapse headers');
  await run("document.querySelector('#home .cap-catalog-home-group-title').click();document.querySelector('#home .cap-catalog-home').scrollTop=0");
  await ready("document.querySelector('#home .cap-skim-root-group:first-child .thumb')");
  await run("document.querySelector('#toggle').click()");
  await ready("document.querySelector('#home .is-gallery .thumb')?.getBoundingClientRect().height>200&&document.querySelector('#files .is-gallery .thumb')?.getBoundingClientRect().height>200");
  await wait(40);
  assert.deepEqual(await geometry('#home .thumb'),await geometry('#files .thumb'),'home and file gallery geometry and captions match');
  await run("document.querySelector('#home .thumb').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  assert.equal(await run('probe.opens.length'),2);
  win.setSize(950,330);
  await ready("getComputedStyle(document.querySelector('#home .cap-catalog-home')).overflowY==='hidden'&&document.querySelector('#home .thumb')?.getBoundingClientRect().height===138&&document.querySelector('#files .thumb')?.getBoundingClientRect().height===138");
  assert.deepEqual(await geometry('#home .thumb'),await geometry('#files .thumb'),'compact horizontal geometry matches');
  await ready("document.querySelector('#home .cap-skim-root-group:first-child .cap-catalog-file-grid')?.dataset.totalCount==='24'");
  win.setContentSize(950,127);
  for(let mode=0;mode<2;mode++){
    await run("document.querySelector('#toggle').click()");
    await ready("document.querySelector('#home .thumb')?.getBoundingClientRect().height===67&&document.querySelector('#files .thumb')?.getBoundingClientRect().height===67");
    assert.deepEqual(await geometry('#home .thumb'),await geometry('#files .thumb'),'both grid modes shrink equally at very low heights');
  }
  for(const selector of roots){
    await run(`document.querySelector(${JSON.stringify(selector)}).scrollLeft=0`);
    assert.deepEqual(await wheel(selector,{deltaY:45}),{left:45,prevented:true},'vertical wheel moves the horizontal grid');
    assert.deepEqual(await wheel(selector,{deltaY:-20}),{left:25,prevented:true},'reverse wheel moves back');
    assert.deepEqual(await wheel(selector,{deltaX:30}),{left:25,prevented:false},'native horizontal input is not converted or doubled');
    assert.deepEqual(await wheel(selector,{deltaY:100,ctrlKey:true}),{left:25,prevented:false},'Ctrl wheel is not captured');
    assert.ok((await wheel(selector,{deltaY:1,deltaMode:1})).left>26,'line deltas use pixel conversion');
    const before=(await wheel(selector,{deltaY:1,deltaMode:2})).left;
    assert.ok(before>=445,'page deltas use viewport width');
    await run(`{const node=document.querySelector(${JSON.stringify(selector)});node.scrollLeft=node.scrollWidth}`);
    assert.equal((await wheel(selector,{deltaY:100})).prevented,false,'wheel at the end is not trapped');
    await run(`document.querySelector(${JSON.stringify(selector)}).scrollLeft=0`);
    assert.equal((await wheel(selector,{deltaY:-100})).prevented,false,'wheel at the start is not trapped');
    const point=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+50),y:Math.round(r.y+35)}})()`);
    win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaX:0,deltaY:-40});
    await ready(`document.querySelector(${JSON.stringify(selector)}).scrollLeft>0`);
    await run(`document.querySelector(${JSON.stringify(selector)}).scrollLeft=0`);
  }
  await run("probe.locationCount=0;probe.refresh()");
  await ready("document.querySelector('#home .cap-catalog-home').scrollWidth<=document.querySelector('#home .cap-catalog-home').clientWidth");
  assert.deepEqual(await wheel(roots[0],{deltaY:100}),{left:0,prevented:false},'a short row without horizontal overflow does not capture the wheel');
  win.setSize(950,330);
  await run("probe.locationCount=24;probe.failRead=true;probe.refresh()");await ready("document.querySelector('#home .cap-catalog-home > button')");
  assert.equal(await run("document.querySelector('#home .cap-skim-root-group:last-child .cap-catalog-file-grid').dataset.totalCount"),'4','failed refresh preserves known system drives');
  await run("probe.failRead=false;probe.driveNames=['X:'];document.querySelector('#home .cap-catalog-home > button').click()");
  await ready("!document.querySelector('#home .cap-catalog-home > button')&&document.querySelector('#home .cap-skim-root-group:last-child .cap-catalog-file-grid').dataset.totalCount==='1'");
  win.setSize(950,750);await run("document.querySelector('#home .cap-catalog-home').scrollTop=0");
  await ready("innerHeight>359&&document.querySelector('#home .thumb')?.getBoundingClientRect().height>200&&document.querySelector('#files .thumb')?.getBoundingClientRect().height>200");
  await ready("document.querySelector('#home .cap-skim-root-group:first-child .cap-skim-root-entry')");
  await run("document.querySelector('#home .cap-skim-root-group:first-child .cap-skim-root-entry').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:120,clientY:80}))");
  await ready("document.querySelector('[role=menuitem]')");
  await run("[...document.querySelectorAll('[role=menuitem]')].find(item=>item.textContent.includes('获取/刷新元数据')).click()");await ready('probe.metadataRequest');
  assert.equal(await run('probe.metadataRequest.path'),'X:\\Location0');assert.equal(await run('probe.metadataRequest.allowMetadataExtraction'),true);
  console.log('Home and file grids: shared geometry, selection/navigation, independent drives, retry and system-folder metadata action passed.');
 }catch(error){console.error(error.stack);if(win&&!win.isDestroyed())console.error(await win.webContents.executeJavaScript('({height:innerHeight,media:matchMedia("(max-height:359.98px)").matches,overflow:getComputedStyle(document.querySelector(".cap-catalog-home")).overflowY,tiles:[...document.querySelectorAll(".thumb")].map(x=>({parent:x.closest(".pane").id,width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height}))})').catch(()=>null));process.exitCode=1}
 finally{win?.destroy();if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir()))throw Error('Unsafe fixture root');fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}
});
