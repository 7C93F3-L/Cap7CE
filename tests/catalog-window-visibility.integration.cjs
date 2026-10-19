const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow,protocol,nativeImage}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-window-visibility-'));app.setPath('userData',root+'-profile');app.on('window-all-closed',()=>{});
protocol.registerSchemesAsPrivileged([{scheme:'cap7ce',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const fixture=String.raw`
import React from 'react';import{createRoot}from'react-dom/client';import './src/renderer/styles.css';import './src/renderer/stable-ui/StableUiFoundation.css';
import CatalogWorkspace from './src/renderer/catalog-workspace/CatalogWorkspace';
import{useContentViewActivity}from'./src/renderer/controllers/useContentViewActivity';
import{useCatalogWindowVisibility}from'./src/renderer/catalog-workspace/useCatalogWindowVisibility';
const noop=()=>{},p=window.probe={focused:false,hidden:false,base:10,metadata:10,baseReads:0,metadataReads:0,acquisitions:0,cacheAccepted:true,phase:'extracting',state:'syncing'};
Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>p.hidden?'hidden':'visible'});document.hasFocus=()=>p.focused;
p.focus=value=>{p.focused=value;window.dispatchEvent(new Event(value?'focus':'blur'))};
p.visibility=value=>{p.hidden=!value;document.dispatchEvent(new Event('visibilitychange'))};
const shellListeners=new Set();p.shell=state=>shellListeners.forEach(callback=>callback(state));
window.cap7ce={cache:{setContentViewActive:async value=>p.cacheAccepted&&value},
 window:{onShellStateChanged:cb=>{shellListeners.add(cb);return()=>shellListeners.delete(cb)},onRefreshCurrentPageRequested:()=>noop},
 preferences:{getCatalogView:async()=>({}),getCatalogGrid:async()=>({}),getCatalogGridSizes:async()=>({})},
 favoriteDirectories:{list:async()=>[{id:'assets',name:'Assets',path:'X:\\Assets'}]},
 skim:{listLocations:async()=>[],read:async r=>({taskId:r.taskId,cancelled:false,entries:[]}),cancel:async()=>true},preview:{onNavigate:()=>noop,onClosed:()=>noop},
 computerSearch:{status:async()=>{p.baseReads++;return{state:p.state,searchAvailable:true,catalogRevision:1,volumes:[{volumeId:'volume',displayName:'X:',state:'catchingUp',queryable:true}],preparation:{volumeId:'volume',drive:'X:',stage:'syncing',processed:p.base,fraction:p.base/100,remainingSeconds:60}}},
 search:async r=>({taskId:r.taskId,items:Array.from({length:100},(_,i)=>({id:String(i),authorizationId:r.taskId+'_'+i,name:'image'+i+'.png',path:'X:\\Assets\\image'+i+'.png',isDirectory:false,extension:'.png',canThumbnail:true,iconName:'format-png'})),nextCursor:null,isComplete:true}),
 acquireThumbnail:async()=>{p.acquisitions++;return 'lease-'+p.acquisitions},releaseThumbnail:async()=>true,cancel:async()=>true},
 metadataBuild:{onChanged:cb=>{p.changed=cb;return()=>{p.changed=null}},status:async()=>{p.metadataReads++;return{volumes:[{volumeId:'volume',label:'X:'}],policy:null,scopeLabels:{},progress:{phase:p.phase,volumeId:'volume',discovered:100,processed:p.metadata,failed:0,unsupported:0,total:100,progressFraction:p.metadata/100,remainingSeconds:60,errorCode:null}}}}};
function Fixture(){const visible=useCatalogWindowVisibility(),foreground=useContentViewActivity(noop,visible);p.foreground=foreground;p.visible=visible;return <div className="app cap-stable-ui theme-dark"><CatalogWorkspace foreground={visible&&foreground} visible={visible} theme="dark" appearanceColors={{}} windowMaterial="none" onOpenSettings={noop}/></div>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
app.whenReady().then(async()=>{let win;try{
 const png=nativeImage.createFromBitmap(Buffer.from([0,0,255,255,0,255,0,255]),{width:2,height:1}).toPNG();protocol.handle('cap7ce',()=>new Response(png,{headers:{'content-type':'image/png'}}));
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},loader:{'.svg':'text'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}});
 fs.writeFileSync(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><style>.cap-computer-search-entry:hover{--probe-hover:yes}</style><div id="root"></div><script src="fixture.js"></script>');
 win=new BrowserWindow({show:false,width:1100,height:750,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});await win.loadFile(path.join(root,'index.html'));
 const run=code=>win.webContents.executeJavaScript(code),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const ready=async code=>{for(let i=0;i<250;i++){if(await run(code))return;await wait(20)}console.log(await run('(()=>{const tile=document.querySelector(".cap-computer-search-entry"),r=tile?.getBoundingClientRect();return{visible:probe.visible,foreground:probe.foreground,rect:r?.toJSON(),target:r&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,250),inert:document.querySelector(".cap-catalog-workspace")?.inert,hover:getComputedStyle(tile).getPropertyValue("--probe-hover")}})()'));throw Error('Timeout '+code)};
 await ready('document.querySelector(".cap-favorite-row .cap-favorite-open")&&!document.querySelector(".cap-catalog-workspace").inert');
 await run('document.querySelector(".cap-favorite-row .cap-favorite-open").click()');
 await ready('document.querySelector(".cap-computer-search-entry")&&document.querySelector(".cap-catalog-preparation-notice")&&document.querySelector(".cap-metadata-build-slot.is-compact")');
 await ready('probe.foreground&&document.querySelector(".cap-computer-search-entry canvas")');assert.equal(await run('probe.visible'),true);assert.equal(await run('document.querySelector("[role=tabpanel]:not([hidden])").inert'),false);
 assert.equal(await run('probe.focused'),false,'visible unfocused UI loads thumbnails');
 win.showInactive();await wait(100);
 const point=await run('(()=>{const r=document.querySelector(".cap-computer-search-entry").getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
 win.webContents.sendInputEvent({type:'mouseMove',...point});await ready('getComputedStyle(document.querySelector(".cap-computer-search-entry")).getPropertyValue("--probe-hover")==="yes"');
 win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaY:-240,deltaX:0,canScroll:true});await ready('document.querySelector(".cap-computer-search-results").scrollTop>0');
 assert.equal(win.isFocused(),false,'hover and wheel do not need native focus');
 await run('document.querySelector(".cap-computer-search-results").scrollTop=0');await ready('document.querySelector(".cap-computer-search-entry canvas")');
 await run('probe.firstPicture=document.querySelector(".cap-computer-search-entry canvas");document.querySelector(".cap-computer-search-results").scrollTop=2000');await ready('!probe.firstPicture.isConnected');
 const offscreen=await run('probe.acquisitions');await run('document.querySelector(".cap-computer-search-results").scrollTop=0');await ready('document.querySelector(".cap-computer-search-entry canvas")&&probe.acquisitions>'+offscreen);
 assert.equal(await run('probe.focused'),false,'offscreen thumbnails reload on return without focus');
 await run('probe.base=20;probe.metadata=30;probe.changed()');
 await ready('document.querySelector(".cap-catalog-preparation-notice").textContent.includes("20")&&document.querySelector(".cap-metadata-build-slot.is-compact").textContent.includes("30")');
 await run('probe.focus(true)');await ready('probe.foreground');await run('probe.focus(false)');await ready('probe.foreground');
 assert.equal(await run('document.querySelectorAll(".cap-bottom-notice-bar").length'),2,'blur keeps both running task notices');
 await wait(100);const acquisitions=await run('probe.acquisitions');await run('probe.cacheAccepted=false;probe.focus(true)');await ready('!probe.foreground');
 assert.equal(await run('document.querySelector(".cap-catalog-workspace").inert'),false,'denied cache admission cannot disable UI');
 assert.equal(await run('probe.acquisitions'),acquisitions);
 await run('probe.focus(false);probe.visibility(false)');await ready('document.querySelector(".cap-catalog-workspace").inert');await wait(100);
 const reads=await run('[probe.baseReads,probe.metadataReads,probe.acquisitions]');await wait(1700);assert.deepEqual(await run('[probe.baseReads,probe.metadataReads,probe.acquisitions]'),reads,'hidden UI pauses status reads and thumbnail work');
 await run('probe.cacheAccepted=true;probe.base=40;probe.metadata=50;probe.visibility(true)');
 await ready('!document.querySelector(".cap-catalog-workspace").inert&&document.querySelector(".cap-catalog-preparation-notice")?.textContent.includes("40")&&document.querySelector(".cap-metadata-build-slot.is-compact")?.textContent.includes("50")');
 for(const state of ['micro','mini','standby']){await run('probe.shell('+JSON.stringify(state)+')');await ready('document.querySelector(".cap-catalog-workspace").inert');await run('probe.shell("normal")');await ready('!document.querySelector(".cap-catalog-workspace").inert')}
 await run('probe.state="ready";probe.phase="completed";probe.changed()');await ready('!document.querySelector(".cap-catalog-preparation-notice")&&document.querySelector(".cap-metadata-build-slot").textContent.includes("已完成")');
 assert.equal(await run('probe.focused'),false,'completion feedback updates without focusing');
 console.log('Window visibility: unfocused native hover/wheel, viewport thumbnail loading/reentry, both progress notices, denied admission, hidden work suspension/resume, shell states and completion passed.');
 }catch(error){console.error(error);process.exitCode=1}finally{win?.destroy();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('Cap7CE-window-visibility-'));fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
