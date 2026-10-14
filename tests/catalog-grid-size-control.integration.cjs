const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow,ipcMain}=require('electron'),esbuild=require('esbuild'),repo=path.resolve(__dirname,'..');
const {CatalogGridPreferenceStore}=require('../dist-electron/catalogGridPreferenceStore.js');
const {registerCatalogGridPreferenceIpc}=require('../dist-electron/catalogGridPreferenceIpc.js');
const {isCatalogGridSize,readCatalogGridSizes}=require('../dist-electron/catalogGridSizeRules.js');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-size-control-'));app.setPath('userData',root+'-profile');
app.on('window-all-closed',()=>{});
const modes=new CatalogGridPreferenceStore(()=>path.join(root,'modes.json'));
const sizes=new CatalogGridPreferenceStore(()=>path.join(root,'sizes.json'),{read:readCatalogGridSizes,valid:isCatalogGridSize});
let writes=0;registerCatalogGridPreferenceIpc(ipcMain,modes,{get:()=>sizes.get(),update:(scope,size)=>{writes++;return sizes.update(scope,size)}});
const fixture=`
import React,{useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import Toolbar from './src/renderer/catalog-workspace/CatalogDirectoryToolbar';
import {useCatalogGridPresentation} from './src/renderer/catalog-workspace/useCatalogGridPresentation';
import CatalogVirtualGrid from './src/renderer/computer-search/CatalogVirtualGrid';import CatalogTile from './src/renderer/computer-search/CatalogTile';
import './src/renderer/styles.css';import './src/renderer/stable-ui/StableUiFoundation.css';import './src/renderer/catalog-workspace/CatalogWorkspace.css';import './src/renderer/catalog-workspace/CatalogDesign.css';
const items=Array.from({length:5000},(_,i)=>({id:String(i)})),noop=()=>{};
function Fixture(){const [location,setLocation]=useState([null,'X:\\Folder']);const grid=useCatalogGridPresentation(...location),ref=useRef(null),inputRef=useRef(null);
window.probe={navigate:(favorite,path)=>setLocation([favorite,path]),size:grid.size,mode:grid.mode,ref};
return <div className="app cap-stable-ui theme-dark"><div className="cap-catalog-design" style={{display:'block',margin:'70px 20px 0',width:900,padding:0}}>
<Toolbar path={location[1]} canBack={false} canForward={false} canUp onBack={noop} onForward={noop} onUp={noop} onOpen={noop} onHome={noop} searchMode={false} onSearchMode={noop} query="" onQuery={noop} onSubmit={noop} enabled inputRef={inputRef}
gridMode={grid.mode} onGridMode={grid.toggle} gridSize={grid.size} onGridSize={grid.previewSize} onGridSizeCommit={grid.commitSize} onRefresh={noop} refreshing={false} sort="name-ascending" onSort={noop} showHidden={false} onShowHidden={noop}/>
<main style={{position:'relative',height:460}}><section className="cap-computer-search-results" ref={ref}><CatalogVirtualGrid items={items} mode={grid.mode} size={grid.size} rootRef={ref} renderItem={(item,style)=><CatalogTile key={item.id} style={style} data-index={item.id}><span className="cap-catalog-thumbnail-name">File {item.id}</span></CatalogTile>}/></section></main>
</div></div>};createRoot(document.getElementById('root')).render(<Fixture/>);
`;
app.whenReady().then(async()=>{let win;try{
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:repo,loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),loader:{'.svg':'text'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}});
 fs.writeFileSync(path.join(root,'index.html'),'<link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 const open=async()=>{win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(repo,'dist-electron/preload.js')}});await win.loadFile(path.join(root,'index.html'))};
 const run=code=>win.webContents.executeJavaScript(code).catch(error=>{console.error('Renderer action:',code);throw error});
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const ready=async code=>{for(let i=0;i<150;i++){if(await run(code))return;await wait(20)}throw Error('Timeout '+code)};
 const frame=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
 const menu=async()=>{await run('document.querySelector(".cap-catalog-size-toggle").click()');await ready('document.querySelector(".cap-catalog-size-flyout input")')};
 const preview=async value=>{await run('(()=>{const e=document.querySelector(".cap-catalog-size-flyout input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(e,'+JSON.stringify(String(value))+');e.dispatchEvent(new Event("input",{bubbles:true}))})()');await ready('probe.size==='+value)};
 const finish=()=>run('document.querySelector(".cap-catalog-size-flyout input").dispatchEvent(new PointerEvent("pointerup",{bubbles:true}))');
 await open();await ready('document.querySelectorAll(".thumb").length>5');await frame();
 const initial=await run('document.querySelector(".thumb").getBoundingClientRect().width');
 await menu();assert.equal(await run('document.querySelector(".cap-catalog-size-toggle").nextElementSibling.className'),'cap-catalog-grid-toggle','size control precedes grid toggle');
 const bounds=await run('(()=>{const r=document.querySelector(".cap-catalog-size-flyout").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,height:r.height}})()');
 assert.ok(bounds.left>=0&&bounds.right<=1200&&bounds.top>70&&bounds.height<=140);
 assert.equal(await run('(()=>{const f=document.querySelector(".cap-catalog-size-flyout"),r=f.getBoundingClientRect();return f.scrollWidth===f.clientWidth&&[...f.querySelectorAll("input,output,.cap-font-size-scale span")].every(e=>{const b=e.getBoundingClientRect();return b.left>=r.left+12&&b.right<=r.right-12})})()'),true,'slider and labels fit within popup padding without horizontal scrolling');
 const scale=await run('(()=>{const s=document.querySelector(".cap-catalog-size-flyout .cap-font-size-scale"),points=[...s.children].map(e=>e.getBoundingClientRect().left),track=getComputedStyle(document.querySelector(".cap-catalog-size-flyout input"));return {labels:[...s.children].map(e=>e.textContent),defaultPosition:(points[1]-points[0])/(points[2]-points[0]),inputHeight:track.height,appearance:track.appearance,buttons:document.querySelectorAll(".cap-catalog-size-flyout button").length}})()');
 assert.deepEqual(scale.labels,['小','默认','大']);assert.ok(Math.abs(scale.defaultPosition-1/3)<0.01,'default mark matches 100% within the 50–200% range');assert.equal(scale.inputHeight,'22px');assert.equal(scale.appearance,'none');assert.equal(scale.buttons,0,'no separate reset button');
 await preview(175);await frame();assert.equal(writes,0,'dragging only previews');assert.ok(await run('document.querySelector(".thumb").getBoundingClientRect().width')>initial);
 await finish();await ready('(async()=> (await window.cap7ce.preferences.getCatalogGridSize()).computer===175)()');assert.equal(writes,1);
 await run('probe.ref.current.scrollTop=probe.ref.current.scrollHeight/2;probe.ref.current.dispatchEvent(new Event("scroll"))');await frame();
 assert.equal(await run('!!document.querySelector(".cap-catalog-size-flyout")'),true,'scroll adjustment cannot close the slider');
 const anchor=await run('(()=>{const r=probe.ref.current.getBoundingClientRect();return [...document.querySelectorAll(".thumb")].find(e=>e.getBoundingClientRect().bottom>r.top).dataset.index})()');
 await preview(50);await frame();
 assert.equal(await run('(()=>{const r=probe.ref.current.getBoundingClientRect(),e=document.querySelector("[data-index=\\"'+anchor+'\\"]");return !!e&&e.getBoundingClientRect().bottom>r.top&&e.getBoundingClientRect().top<r.bottom})()'),true,'size change retains visible item');
 assert.ok(await run('document.querySelectorAll(".thumb").length')<250,'5000 files retain bounded DOM during scaling');await finish();await ready('(async()=> (await window.cap7ce.preferences.getCatalogGridSize()).computer===50)()');
 await preview(100);await finish();await ready('(async()=> (await window.cap7ce.preferences.getCatalogGridSize()).computer===100)()');
 await run('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');await ready('!document.querySelector(".cap-catalog-size-flyout")');
 assert.equal(await run('document.activeElement.className'),'cap-catalog-size-toggle','Escape restores trigger focus');
 await menu();await preview(125);await run('document.body.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');await ready('!document.querySelector(".cap-catalog-size-flyout")');
 await ready('(async()=> (await window.cap7ce.preferences.getCatalogGridSize()).computer===125)()');
 await run('probe.navigate("X:\\\\Favorite","X:\\\\Favorite")');await ready('probe.size===100&&probe.mode==="gallery"');await menu();await preview(150);await finish();
 await ready('(async()=> (await window.cap7ce.preferences.getCatalogGridSize())["favorite:x:\\\\favorite"]===150)()');
 await run('probe.navigate("X:\\\\Favorite","X:\\\\Favorite\\\\Child")');await ready('probe.size===150');
 win.destroy();await open();await ready('probe.size===125');await run('probe.navigate("X:\\\\Favorite","X:\\\\Favorite")');await ready('probe.size===150');
 console.log('View size control: shared slider style/default mark, real IPC, preview/commit, popup dismissal/focus, scroll anchoring, bounded DOM and independent restart scopes passed.');
}catch(error){console.error(error.stack);process.exitCode=1}finally{win?.destroy();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
