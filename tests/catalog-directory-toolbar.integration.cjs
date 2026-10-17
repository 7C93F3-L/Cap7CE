const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-directory-toolbar-'));app.setPath('userData',root+'-profile');
const fixture=String.raw`
import React,{useRef,useState} from 'react';import{createRoot}from'react-dom/client';
import Toolbar from './src/renderer/catalog-workspace/CatalogDirectoryToolbar';
import './src/renderer/styles.css';import './src/renderer/stable-ui/StableUiFoundation.css';import './src/renderer/catalog-workspace/CatalogWorkspace.css';import './src/renderer/catalog-workspace/CatalogDesign.css';
const noop=()=>{},calls=[],submits=[];function Fixture(){const[path,setPath]=useState('X:\\'+Array.from({length:15},(_,i)=>'Long folder '+i).join('\\')),[search,setSearch]=useState(false),[query,setQuery]=useState('existing draft'),inputRef=useRef(null);
window.probe={path,setPath,calls,submits};return <div className="app cap-stable-ui theme-dark"><div id="host" className="cap-catalog-design" style={{display:'block',width:900,margin:30,padding:0}}>
<Toolbar path={path} canBack canForward canUp onBack={noop} onForward={noop} onUp={noop} onRefresh={noop} refreshing={false} onOpen={value=>{calls.push(value);setPath(value)}} onHome={noop}
searchMode={search} onSearchMode={()=>setSearch(value=>!value)} query={query} onQuery={setQuery} onSubmit={()=>submits.push(query)} enabled inputRef={inputRef} gridMode="square" onGridMode={noop}
includeSubfolders showHidden onShowHidden={noop} onIncludeSubfolders={noop} sort="modified-descending" onSort={noop} gridSize={125} onGridSize={noop} onGridSizeCommit={noop}
random={{enabled:true,seed:123,batchNumber:2,toggle:noop,disable:noop,next:noop}}/></div></div>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
app.whenReady().then(async()=>{let win;try{
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),loader:{'.svg':'text'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}});
 fs.writeFileSync(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 win=new BrowserWindow({show:false,width:1100,height:600,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});await win.loadFile(path.join(root,'index.html'));
 const run=c=>win.webContents.executeJavaScript(c),wait=ms=>new Promise(r=>setTimeout(r,ms));const ready=async c=>{for(let n=0;n<150;n++){if(await run(c))return;await wait(20)}throw Error('Timeout '+c)};
 const frame=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
 const pointer=async(selector,offset)=>{const point=await run(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.${offset?'right':'left'}${offset?'-8':'+r.width/2'}),y:Math.round(r.top+r.height/2)}})()`);win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});await frame()};
 const input='.cap-catalog-directory-toolbar > input',edit='.cap-catalog-address-edit';
 const escape=async()=>{await run(`document.querySelector('${input}').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);await ready(`document.querySelector('${edit}')`)};
 const fill=async value=>run(`(()=>{const e=document.querySelector('${input}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 await ready(`document.querySelector('${edit}')`);await frame();
 assert.equal(await run("(()=>{const p=document.querySelector('.cap-catalog-breadcrumb-parts');return p.scrollWidth>p.clientWidth})()"),true,'fixture overflows the breadcrumb track');
 const reserve=await run(`(()=>{const r=document.querySelector('${edit}').getBoundingClientRect(),p=document.querySelector('.cap-catalog-breadcrumb').getBoundingClientRect();return {width:r.width,right:r.right,parentRight:p.right}})()`);
 assert.equal(reserve.width,28);assert.equal(reserve.right,reserve.parentRight,'edit reserve stays at the right edge outside scrolling content');
 await pointer(edit);await ready(`document.querySelector('${input}')===document.activeElement`);
 assert.equal(await run(`document.querySelector('${input}').value===probe.path`),true,'one click opens the complete path');await escape();
 await run("document.querySelector('.cap-catalog-breadcrumb-parts').scrollLeft=1000");await frame();await pointer(edit);await ready(`document.querySelector('${input}')`);await escape();
 await run("probe.setPath('X:\\Short')");await frame();await pointer('.cap-catalog-breadcrumb-parts',true);await ready(`document.querySelector('${input}')`);
 await fill('Y:\\New folder');await run("document.querySelector('.cap-catalog-directory-toolbar').requestSubmit()");await ready("probe.path==='Y:\\\\New folder'");
 assert.deepEqual(await run('probe.calls'),['Y:\\New folder']);
 await pointer('.cap-catalog-breadcrumb-parts > span > button');await ready("probe.path==='Y:\\\\'");
 assert.equal(await run(`!!document.querySelector('${input}')`),false,'breadcrumb names navigate without entering edit mode');
 await run("document.getElementById('host').style.width='220px'");await frame();
 assert.deepEqual(await run("[...document.querySelectorAll('.cap-catalog-directory-toolbar > button')].filter(e=>e.getClientRects().length).map(e=>e.className)"),['cap-catalog-address-toggle'],'narrow layout retains only the mode toggle outside the address area');
 assert.equal(await run("[...document.querySelectorAll('.cap-catalog-random-controls,.cap-catalog-view-controls')].every(e=>!e.getClientRects().length)"),true,'all grouped actions hide based on toolbar width even in a wide window');
 assert.equal(await run(`document.querySelector('${edit}').getBoundingClientRect().width`),28);
 assert.equal(await run("(()=>{const t=document.querySelector('.cap-catalog-directory-toolbar');return t.scrollWidth<=t.clientWidth})()"),true,'narrow breadcrumbs do not overflow the toolbar');
 await pointer(edit);await ready(`document.querySelector('${input}')`);await escape();await pointer('.cap-catalog-address-toggle');await ready(`document.querySelector('${input}')`);
 assert.ok(await run(`document.querySelector('${input}').getBoundingClientRect().width`)>150,'search gets the remaining narrow width');
 assert.equal(await run(`document.querySelector('${input}').value`),'existing draft');await fill('narrow search');await run("document.querySelector('.cap-catalog-directory-toolbar').requestSubmit()");assert.deepEqual(await run('probe.submits'),['narrow search']);
 await run("document.getElementById('host').style.width='900px'");await frame();
 assert.equal(await run("[...document.querySelectorAll('.cap-catalog-random-controls,.cap-catalog-view-controls')].every(e=>e.getClientRects().length>0)"),true);
 assert.equal(await run("document.querySelector('.cap-catalog-hidden-switch').getAttribute('aria-checked')"),'true');assert.equal(await run("document.querySelector('.cap-catalog-random-next').getClientRects().length>0"),true);
 assert.equal(await run(`document.querySelector('${input}').value`),'narrow search','restoring width preserves the search draft');
 console.log('Catalog toolbar single-click editing, reserved hit area, navigation, narrow container layout and state preservation passed.');
 }catch(error){console.error(error.stack);process.exitCode=1}finally{win?.destroy();if(path.dirname(root)!==os.tmpdir())throw Error('Unsafe fixture root');fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}
});
