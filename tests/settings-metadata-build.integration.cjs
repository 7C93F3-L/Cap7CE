const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,BrowserWindow,ipcMain}=require('electron'),esbuild=require('esbuild');
const {registerMetadataBuildIpc}=require('../dist-electron/metadataExtraction/metadataBuildIpc.js');
const {registerSettingsWindowIpc}=require('../dist-electron/settingsWindowIpc.js');
const repo=path.resolve(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-settings-build-'));app.setPath('userData',root+'-profile');
const ids=['A','B','C','D'].map(v=>v.repeat(32)),letters=['X:','Y:','Z:','W:'];
const progress=phase=>({phase,volumeId:ids[0],discovered:10,processed:4,failed:0,unsupported:0,total:10,progressFraction:.4,remainingSeconds:null,errorCode:null});
let state={progress:progress('idle'),policy:null,volumes:ids.map((volumeId,i)=>({volumeId,label:letters[i]})),scopeLabels:{}},win,starts=0,saves=0,failSave=false,failResolve=false;
const api={status:async()=>structuredClone(state),
 resolveScope:async value=>{if(failResolve)throw Error('unavailable');const scope={volumeId:ids[0],rootFileReference:'1'.repeat(16),label:value};state.scopeLabels[`${ids[0]}:${scope.rootFileReference}`]=value;return scope},
 savePolicy:async policy=>{saves++;if(failSave)throw Error('disk-full');state={...state,policy:structuredClone(policy)};return structuredClone(state)},
 start:async request=>{starts++;assert.equal(request.allowMetadataExtraction,true);state={...state,policy:structuredClone(request.policy),progress:progress('extracting')};return structuredClone(state)},
 pause:async()=>{state.progress=progress('paused');return structuredClone(state)},resume:async()=>{state.progress=progress('extracting');return structuredClone(state)},
 startDirectory:async()=>{throw Error('not part of Settings')},cancelDirectories:async()=>{delete state.directoryTask;state.progress=progress('idle');return structuredClone(state)}};
registerMetadataBuildIpc(ipcMain,event=>event.sender===win?.webContents,api,{onChanged:()=>win?.webContents.send('metadataBuild:changed')});
const navigation=new Map(),mainSender={};
registerSettingsWindowIpc({registrar:{handle:(key,fn)=>{navigation.set(key,fn);ipcMain.handle(key,fn)},on(){}},isMainSenderAllowed:event=>event.sender===mainSender,
 isSettingsSenderAllowed:event=>event.sender===win?.webContents,openSettings:async()=>true,notifyMetadataBuild:()=>win?.webContents.send('settingsWindow:metadataBuildRequested')});
const fixture=String.raw`
import React,{useRef,useState}from'react';import{createRoot}from'react-dom/client';
import Frame from './src/renderer/settings-window/SettingsContentFrame';import Index from './src/renderer/settings-window/SettingsIndexSection';
import{useSettingsIndexNavigation}from'./src/renderer/settings-window/useSettingsIndexNavigation';import{setActiveLanguage}from'./electron/localization';
import'./src/renderer/styles.css';import'./src/renderer/CustomScrollbar.css';import'./src/renderer/settings-window/SettingsWindowApp.css';import'./src/renderer/settings-window/StableSettingsActions.css';
function Fixture(){const ref=useRef(null),[other,setOther]=useState(false),nav=useSettingsIndexNavigation(()=>setOther(false));window.changeLanguage=language=>{setActiveLanguage(language);setOther(v=>!v)};
return <div className="cap-settings-window-foundation theme-dark" style={{'--cap-accent-gradient':'linear-gradient(110deg,#7c93f3,#68c3c0)','--dialog-action-hover-text':'#fff'}}>
<div className="cap-stable-settings-shell"><aside><button id="other" onClick={()=>nav.navigate(()=>setOther(true))}>Other category</button></aside>
<Frame navigation={nav} scrollRef={ref}>{other?<p>Other category</p>:<Index query="" onManage={nav.show}/>}</Frame></div></div>}createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`;
app.whenReady().then(async()=>{try{
 esbuild.buildSync({stdin:{contents:fixture,loader:'tsx',resolveDir:repo},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),define:{'process.env.NODE_ENV':'"development"'}});
 fs.writeFileSync(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 await navigation.get('settingsWindow:openMetadataBuild')({sender:mainSender});
 win=new BrowserWindow({show:false,width:1100,height:840,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,preload:path.join(repo,'dist-electron/preload.js')}});
 const errors=[];win.webContents.on('preload-error',(_event,_file,error)=>errors.push(error.message));
 const run=code=>win.webContents.executeJavaScript(code),frame=()=>run('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(true))))');
 const ready=async code=>{for(let n=0;n<160;n++){if(await run(code))return;await new Promise(r=>setTimeout(r,20))}throw Error('Timeout '+code)};
 const click=async selector=>{await run(`document.querySelector(${JSON.stringify(selector)}).click()`);await frame()};
 const button=async text=>{await run(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);await frame()};
 const fill=async value=>{await run(`(()=>{const e=document.querySelector('#metadata-folder-path');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await frame()};
 await win.loadFile(path.join(root,'index.html'));await ready('document.querySelectorAll(".drive-row").length===4');
 assert.equal(starts,0);assert.equal(saves,0,'loading management is read-only');
 assert.equal(await run("typeof window.cap7ce.embeddedMetadata"),'undefined','retired API is absent from the real preload');
 assert.equal(await run("getComputedStyle(document.querySelector('.drive-row input')).borderRadius"),'50%');
 assert.equal(await run("getComputedStyle(document.querySelector('.drive-row input'),'::after').content"),'none');
 assert.ok(await run("getComputedStyle(document.querySelector('[data-action=task]')).backgroundImage.includes('linear-gradient')"),'primary action keeps the shared gradient after Settings styles load');
 await click(`[data-drive="${ids[3]}"] label`);assert.equal(await run("document.querySelector('[data-action=save]').disabled"),false);
 const before=await run(`[...document.querySelectorAll('.drive-row input')].map(e=>e.checked)`);
 await click(`[data-drive="${ids[0]}"] .order-buttons button:last-child`);
 assert.deepEqual((await run(`[...document.querySelectorAll('.drive-row input')].map(e=>e.checked)`)).sort(),before.sort(),'order buttons do not change inclusion');
 await click('[data-action=save]');await ready('document.querySelector("[data-action=save]").disabled');assert.equal(starts,0);assert.equal(saves,1);
 assert.deepEqual(state.policy.volumeOrder,[ids[1],ids[0],ids[2]]);
 await click('[data-action=task]');await ready('document.querySelector(".drive-list").disabled');assert.equal(starts,1);
 await click('[data-action=task]');await ready('!document.querySelector(".drive-list").disabled');
 await click(`[data-drive="${ids[3]}"] label`);failSave=true;await click('[data-action=save]');await ready('document.querySelector(".build-footer [role=alert]")');
 assert.equal(await run("document.querySelector('[data-action=save]').disabled"),false,'failed saves retain editable drafts');
 await click('#other');await ready('document.querySelector("dialog")?.open');
 await button('保存并返回');await ready('document.querySelector("dialog")?.open&&!document.querySelector("dialog button").disabled');
 assert.ok(await run('document.querySelector(".cap-settings-build")'),'failed save cannot navigate away');
 await button('继续编辑');failSave=false;await button('还原修改');
 await click('.folder-toggle');await button('＋ 添加文件夹');
 failResolve=true;await fill('X:\\Assets');await button('添加');await ready('document.querySelector(".build-footer").textContent.includes("无法添加")');
 assert.equal(await run("document.querySelector('#metadata-folder-path').value"),'X:\\Assets','failed resolution keeps the path');
 failResolve=false;const longPath='X:\\'+Array.from({length:15},()=> '中文目录与素材').join('\\');await fill(longPath);await button('添加');await ready('document.querySelectorAll(".scope-paths li").length===1');
 assert.equal(await run("document.querySelector('.drive-scope').textContent.includes('整盘')"),true);
 await click('[data-action=save]');await ready('document.querySelector("[data-action=save]").disabled');
 assert.equal(state.policy.includes.some(s=>s.rootFileReference==='1'.repeat(16)),true);
 const layout=async()=>{assert.equal(await run("[...document.querySelectorAll('.build-card,.drive-row,.build-footer,.cap-stable-settings-content')].every(e=>e.scrollWidth<=e.clientWidth+1)"),true);assert.equal(await run("document.querySelector('.build-footer').getBoundingClientRect().bottom<=innerHeight"),true)};
 await layout();for(const width of [600,480]){win.setContentSize(width,560);await frame();await layout()}
 await run("document.querySelector('.cap-settings-window-foundation').classList.replace('theme-dark','theme-light')");await layout();
 state={...state,progress:progress('paused'),directoryTask:{path:longPath,pending:2}};win.webContents.send('metadataBuild:changed');await ready('document.querySelector(".drive-list").disabled');
 assert.ok(await run('document.body.textContent.includes("取消目录任务")'));
 await button('继续提取');await ready('document.querySelector("[data-action=task]").textContent==="暂停提取"');await button('暂停提取');
 await button('取消目录任务');await ready('!document.querySelector(".drive-list").disabled');assert.equal(state.directoryTask,undefined);
 const stored=structuredClone(state.policy);await win.reload();await ready('document.body.textContent.includes("管理建库")');await button('管理建库');await ready('document.querySelectorAll(".drive-row").length===4');assert.deepEqual(state.policy,stored);
 assert.equal(await run('document.body.textContent.includes("嵌入信息")'),false);
 const available=structuredClone(state);state={...state,policy:null,volumes:[]};win.webContents.send('metadataBuild:changed');await ready('document.body.textContent.includes("暂无可管理的磁盘")');
 assert.equal(await run("document.querySelector('[data-action=task]').disabled"),true);
 state=available;await button('刷新');await ready('document.querySelectorAll(".drive-row").length===4');assert.equal(starts,1,'retrying available drives remains read-only');
 assert.deepEqual(errors,[]);
 if(process.env.CAP_METADATA_CAPTURE)fs.writeFileSync(process.env.CAP_METADATA_CAPTURE,(await win.webContents.capturePage()).toPNG());
 console.log('Settings metadata: real sandbox bridge, cold navigation, circular multiple selection, independent save, failures/drafts, folder scope, directory controls and responsive layout passed.');
}catch(error){console.error(error.stack);process.exitCode=1}finally{win?.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
