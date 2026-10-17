const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-file-information-'));app.setPath('userData',root+'-profile');app.on('window-all-closed',()=>{});
const fixture=String.raw`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import CatalogDetails from './src/renderer/catalog-workspace/CatalogDetails';import PreviewInformationSidebar from './src/renderer/preview/PreviewInformationSidebar';
import './src/renderer/styles.css';import './src/renderer/stable-ui/StableUiFoundation.css';import './src/renderer/catalog-workspace/CatalogDesign.css';
const p=window.probe={reads:[],cancels:[],reveals:0,previews:0},pending=new Map();
window.cap7ce={computerSearch:{readFileDetails:r=>{p.reads.push(r);return new Promise(resolve=>pending.set(r.requestId,resolve))},cancelFileDetails:async r=>{p.cancels.push(r);return true},acquireThumbnail:async()=>null,releaseThumbnail:async()=>true}};
const item=name=>({id:name,authorizationId:name,name:name+'.png',path:'X:\\'+name+'.png',extension:'.png',isDirectory:false,canThumbnail:false,iconName:'format-png',sizeBytes:1024,modifiedUtcTicks:null});
function Fixture(){const [name,setName]=useState('A'),[foreground,setForeground]=useState(true),[theme,setTheme]=useState('dark'),[preview,setPreview]=useState(false),[width,setWidth]=useState(230);
p.width=v=>flushSync(()=>setWidth(v));
p.select=n=>flushSync(()=>setName(n));p.foreground=v=>flushSync(()=>setForeground(v));p.theme=v=>flushSync(()=>setTheme(v));p.preview=()=>flushSync(()=>setPreview(true));
p.finish=n=>{const r=p.reads.findLast(r=>r.authorizationId===n);pending.get(r.requestId)({info:{kind:'file',path:'X:\\'+n+'.png',name:n+'.png',extension:'.png',size:1024,modifiedAt:'2026-10-17T00:00:00Z',withinAddedDirectory:false},imageWidth:1200,imageHeight:800,embeddedMetadata:{items:[{kind:'software_family',text:n+' software'}],capturedAt:null}})};
return <div className={'app cap-stable-ui theme-'+theme} style={{height:'100vh',padding:8,boxSizing:'border-box'}}><div style={{height:'100%',width}}>
{preview?<PreviewInformationSidebar expanded data={{sessionId:'preview',fileName:'preview.png',filePath:'X:\\preview.png',fileSize:1024,modifiedAt:'2026-10-17T00:00:00Z',skimActive:true}} onToggleExpanded={()=>{}}/>:
<CatalogDetails selection={name?{taskId:'task',items:[item(name)],openPreview:()=>p.previews++,showInFolder:()=>p.reveals++}:null} path="X:\\" count={1} foreground={foreground}/>}
</div></div>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
app.whenReady().then(async()=>{let win;try{
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),loader:{'.svg':'text'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}});
 fs.writeFileSync(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 win=new BrowserWindow({show:false,width:800,height:650,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});await win.loadFile(path.join(root,'index.html'));
 const run=c=>win.webContents.executeJavaScript(c),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const ready=async c=>{for(let i=0;i<150;i++){if(await run(c))return;await wait(20)}throw Error('Timeout '+c)};
 await ready('probe.reads.length===1');assert.equal(await run('probe.previews'),0,'selection does not open a preview window');
 await run("probe.select('B')");assert.equal(await run('document.querySelector(".preview-sidebar-file-heading strong").innerText'),'B.png');
 await ready('probe.reads.length===2');await run("probe.finish('A')");await wait(40);
 assert.equal(await run('document.body.innerText.includes("A software")'),false,'late metadata cannot overwrite a new selection');
 await run("probe.finish('B')");await ready('document.body.innerText.includes("B software")');
 assert.equal(await run('document.body.innerText.includes("1200 × 800")'),true);
 const headings=await run('[...document.querySelectorAll(".preview-sidebar-section h2,.preview-embedded-metadata-details h2")].map(e=>e.innerText)');
 assert.deepEqual(headings,['文件信息','位置','手动关键词','当前匹配依据','嵌入信息']);
 assert.equal(await run('document.body.innerText.includes("当前匹配依据")'),true,'catalog shares preview evidence presentation');
 assert.equal(await run('!!document.querySelector(".preview-sidebar-actions")'),false);assert.equal(await run('document.body.innerText.includes("打开详细预览")'),false);
 await run('document.querySelector(".preview-sidebar-path").click()');assert.equal(await run('probe.reveals'),1,'location reuses the authorized result action');
 for(const theme of ['light','dark']){for(const width of [230]){await run(`probe.width(${width});probe.theme('${theme}');document.documentElement.style.setProperty('--cap-ui-font-base','16px')`);assert.equal(await run('(()=>{const e=document.querySelector(".preview-sidebar-scroll");return e.scrollWidth>e.clientWidth+1})()'),false,'cards fit each supported width at maximum font size');
 assert.ok(await run('document.querySelector(".cap-catalog-file-visual").getBoundingClientRect().height')<=280,'thumbnail height is bounded at wide sizes');}}
 const detailReadCount=await run('probe.reads.length');
 await run("probe.select('C');probe.foreground(false)");await wait(220);assert.equal(await run('probe.reads.length'),detailReadCount,'background sidebar does not start detail reads');
 await run("probe.foreground(true)");await ready('probe.reads.length==='+String(detailReadCount+1));await run('probe.select(null)');assert.ok(await run('probe.cancels.length')>=3,'clearing selection retires its read');
 await run('probe.preview()');await ready('document.querySelector(".preview-sidebar-actions")');assert.equal(await run('document.querySelectorAll(".preview-sidebar-actions button").length'),3,'standalone preview retains its file actions');
 assert.equal(await run('document.querySelector(".preview-sidebar-header").innerText'),'文件信息','standalone preview retains its original heading');
 assert.equal(await run('document.body.innerText.includes("当前匹配依据")'),true,'standalone preview preserves its existing evidence card');
 console.log('Catalog information: shared cards, metadata/dimensions, stale responses, cancellation, narrow themes and preview compatibility passed.');
}catch(e){console.error(e.stack);process.exitCode=1}finally{win?.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
