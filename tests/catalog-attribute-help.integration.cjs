const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,BrowserWindow,ipcMain}=require('electron'),esbuild=require('esbuild');
const {registerMetadataBuildIpc}=require('../dist-electron/metadataExtraction/metadataBuildIpc.js');
const repo=path.resolve(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-attribute-help-'));app.setPath('userData',root+'-profile');
const volumeId='A'.repeat(32),folder='X:\\Assets';let win,current=0,all=0,fail=false;
const progress=phase=>({phase,volumeId,discovered:1,processed:0,failed:0,unsupported:0,total:1,progressFraction:0,remainingSeconds:null,errorCode:null});
let status={progress:progress('idle'),policy:null,scopeLabels:{},volumes:[{volumeId,label:'X:'}]};
const api={status:async()=>structuredClone(status),startDirectory:async r=>{if(fail)throw Error('blocked');assert.equal(r.path,folder);assert.equal(r.allowMetadataExtraction,true);current++;status={...status,progress:progress('extracting'),directoryTask:{path:folder,pending:1}};return status},
 startAllVolumes:async r=>{all++;assert.equal(r.allowMetadataExtraction,true);status={...status,progress:progress('waiting'),directoryTask:{path:'X:\\',pending:2}};return status}};
registerMetadataBuildIpc(ipcMain,event=>event.sender===win?.webContents,api,{onChanged:()=>win?.webContents.send('metadataBuild:changed')});
const fixture=String.raw`
import React,{useState}from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
import Filters from'./src/renderer/catalog-workspace/CatalogTopFilters';import Slot from'./src/renderer/metadata-build/MetadataBuildSlot';
import{setActiveLanguage}from'./electron/localization';import'./src/renderer/styles.css';import'./src/renderer/stable-ui/StableUiFoundation.css';import'./src/renderer/catalog-workspace/CatalogDesign.css';import'./src/renderer/catalog-workspace/CatalogActivity.css';
function Fixture(){const[search,setSearch]=useState({query:'',fileFormat:'all',timePreset:'all',selectedExtensions:['.png']}),[host,setHost]=useState(null),[path,setPath]=useState('X:\\Assets'),[attributes,setAttributes]=useState({state:'missing',disabled:true,colorsDisabled:true}),[progress,setProgress]=useState(null),[language,setLanguage]=useState('zh-CN');
setActiveLanguage(language);window.probe={search,path:value=>flushSync(()=>setPath(value)),attributes:value=>flushSync(()=>setAttributes(value)),progress:value=>flushSync(()=>setProgress({phase:value})),language:value=>flushSync(()=>setLanguage(value)),opens:window.probe?.opens??0};
return <div className="app cap-stable-ui theme-dark"><div className="cap-catalog-design" style={{display:'block',width:'100%',height:'100vh'}}><Filters search={search} availableFormats={['.png']} detailDomains={['visual']} onChange={setSearch} onClear={()=>{}} count={0} attributes={attributes} path={path} noticeHost={host} metadataProgress={progress} onMetadata={()=>window.probe.opens++}/>
<div className="cap-catalog-activity-dock"><div ref={setHost}/><Slot enabled foreground floating onProgress={setProgress} onRequestControls={()=>window.probe.opens++}/></div></div></div>}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`;
app.whenReady().then(async()=>{try{
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:repo,loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),define:{'process.env.NODE_ENV':'"development"'}});
 fs.writeFileSync(path.join(root,'index.html'),'<link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 win=new BrowserWindow({show:false,width:1100,height:700,webPreferences:{preload:path.join(repo,'dist-electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const errors=[];win.webContents.on('preload-error',(_,__,e)=>errors.push(e.message));
 const run=code=>win.webContents.executeJavaScript(code),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const ready=async code=>{for(let n=0;n<200;n++){if(await run(code))return;await sleep(20)}throw Error('Timeout '+code)};
 const click=selector=>run(`document.querySelector(${JSON.stringify(selector)}).click()`),prompt='.cap-catalog-attribute-prompt';
 const action=label=>run(`([...document.querySelectorAll('${prompt} button')].find(b=>b.textContent===${JSON.stringify(label)})).click()`);
 const notify=()=>win.webContents.send('metadataBuild:changed');
 await win.loadFile(path.join(root,'index.html'));await ready('document.querySelector(".cap-stable-ratio-options button")');
 assert.equal(await run(`!!document.querySelector('${prompt}')`),false,'loading/browsing cannot display the prompt');assert.equal(current+all,0);
 await click('.cap-stable-ratio-options button');await ready(`document.querySelector('${prompt}')`);
 assert.deepEqual(await run(`Array.from(document.querySelectorAll('${prompt} button'),b=>b.textContent)`),['提取当前目录','全盘提取','自定义提取','×']);
 assert.equal(await run('probe.search.imageAspectRatios'),undefined);assert.equal(await run('!!document.querySelector(".cap-stable-sidebar-flyout")'),false);
 await click('.cap-stable-ratio-options button');assert.equal(await run(`document.querySelectorAll('${prompt}').length`),1,'repeated requests replace the same strip');
 await click(`${prompt} [aria-label="关闭"]`);assert.equal(await run(`!!document.querySelector('${prompt}')`),false);
 await run('document.querySelector(".cap-stable-ratio-options button").focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
 await ready(`document.querySelector('${prompt}')`);assert.equal(await run('probe.search.imageAspectRatios'),undefined,'keyboard activation is blocked as well');
 await action('自定义提取');assert.equal(await run('probe.opens'),1);assert.equal(current+all,0,'custom only opens Settings');
 await click('.cap-stable-ratio-options button');fail=true;await action('提取当前目录');await ready(`document.querySelector('${prompt}')?.textContent.includes('未能开始')`);fail=false;
 await action('提取当前目录');await ready('document.querySelector(".cap-metadata-build-slot.is-compact")');assert.equal(current,1);assert.equal(await run(`!!document.querySelector('${prompt}')`),false);
 await click('.cap-stable-ratio-options button');await ready(`document.querySelector('${prompt}')?.textContent.includes('正在提取')`);
 assert.deepEqual(await run(`Array.from(document.querySelectorAll('${prompt} button'),b=>b.textContent)`),['查看任务','×']);await action('查看任务');assert.equal(await run('probe.opens'),2);
 status={...status,progress:progress('idle')};delete status.directoryTask;notify();await ready('!document.querySelector(".cap-metadata-build-slot")');
 await click('.cap-stable-ratio-options button');await action('全盘提取');await ready('document.querySelector(".cap-metadata-build-slot")');assert.equal(all,1);assert.equal(current,1);
 status={...status,progress:progress('idle')};delete status.directoryTask;notify();await ready('!document.querySelector(".cap-metadata-build-slot")');
 await run('probe.path(null)');await click('.cap-stable-ratio-options button');
 assert.deepEqual(await run(`Array.from(document.querySelectorAll('${prompt} button'),b=>b.textContent)`),['全盘提取','自定义提取','×'],'global scope has no current folder');
 await run(`probe.path(${JSON.stringify(folder)})`);assert.equal(await run(`!!document.querySelector('${prompt}')`),false,'navigation drops the old prompt');
 await run('probe.attributes({state:"available",disabled:false,colorsDisabled:true})');await click('.cap-stable-color-options button');await ready(`document.querySelector('${prompt}')`);
 assert.equal(await run('probe.search.visualColors'),undefined,'missing colors remain independently gated');
 await run('probe.attributes({state:"available",disabled:false,colorsDisabled:false})');await ready(`!document.querySelector('${prompt}')`);
 await click('.cap-stable-ratio-options button');assert.ok(await run('probe.search.imageAspectRatios?.length'),'available filters still operate');
 await run('probe.attributes({state:"missing",disabled:true,colorsDisabled:true})');assert.equal(await run(`!!document.querySelector('${prompt}')`),false,'availability changes alone cannot redisplay help');
 await run('probe.progress("paused")');await click('.cap-stable-ratio-options button');assert.ok(await run(`document.querySelector('${prompt}').textContent.includes('已暂停')`));await action('查看任务');
 await run('probe.progress("idle");probe.attributes({state:"checking",disabled:true,colorsDisabled:true})');await click('.cap-stable-ratio-options button');
 assert.deepEqual(await run(`Array.from(document.querySelectorAll('${prompt} button'),b=>b.textContent)`),['×'],'checking never invites premature extraction');
 await run('probe.attributes({state:"unknown",disabled:true,colorsDisabled:true})');assert.ok(await run(`document.querySelector('${prompt}').textContent.includes('无法确认')`));
 for(const language of ['zh-CN','en-US']){await run(`probe.language(${JSON.stringify(language)})`);win.setContentSize(300,500);await sleep(80);
  assert.equal(await run(`(()=>{const e=document.querySelector('${prompt}');return e.scrollWidth>e.clientWidth+1||[...e.querySelectorAll('button')].some(b=>b.getBoundingClientRect().right>e.getBoundingClientRect().right+1)})()`),false,'all actions fit the minimum width in both languages');}
 await run('probe.language("zh-CN")');await click('.cap-stable-ratio-options button');await sleep(10500);assert.equal(await run(`!!document.querySelector('${prompt}')`),false,'unattended help expires');
 assert.deepEqual(errors,[]);assert.equal(current+all,2);console.log('Attribute filter help: passive browsing, pointer/keyboard gates, directory/all/custom sandbox actions, failures, task states, scope reset, independent colors, narrow layouts and expiry passed.');
 }catch(error){console.error(error.stack);process.exitCode=1}finally{win?.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
