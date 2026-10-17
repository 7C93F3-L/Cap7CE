const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-keyword-batch-ui-'));app.setPath('userData',root+'-profile');app.on('window-all-closed',()=>{});
const fixture=String.raw`
import React from 'react';import {createRoot} from 'react-dom/client';
import './src/renderer/styles.css';import './src/renderer/stable-ui/StableUiFoundation.css';import CatalogWorkspace from './src/renderer/catalog-workspace/CatalogWorkspace';
const noop=()=>{},p=window.probe={tags:{A:['共同','甲独有'],B:['共同','乙独有']},writes:[],batches:[],previews:0};let batchProgress,finish;
const items=['A','B','Folder'].map(name=>({id:name,authorizationId:name,name:name==='Folder'?name:name+'.png',path:'X:\\Assets\\'+name,isDirectory:name==='Folder',extension:name==='Folder'?'':'.png',volumeId:'V',fileReference:name,createdFileTimeMilliseconds:'1',sizeBytes:10,iconName:'folder',previewKind:'fileInfo',canThumbnail:false}));
window.cap7ce={settingsWindow:{onMetadataBuildRequested:()=>noop},skim:{listLocations:async()=>[],read:async()=>({entries:[]})},favoriteDirectories:{list:async()=>[{id:'fav',name:'Assets',path:'X:\\Assets'}]},preview:{onNavigate:()=>noop,onClosed:()=>noop,open:async()=>{p.previews++;return true}},computerSearch:{
status:async()=>({state:'ready',searchAvailable:true,volumes:[]}),onCatalogChanged:()=>noop,cancel:async()=>true,
search:async r=>({items:r.taskId.endsWith('_attribute')?[]:items,nextCursor:null}),
readKeywords:async r=>({keywords:p.tags[r.authorizationId],revision:'1'}),saveKeywords:async r=>{p.writes.push(r);if(p.fail===r.authorizationId)throw Error('failed');if(p.conflict&&r.authorizationId==='B'){p.conflict=false;p.tags.B.push('其他改动');return {saved:false,current:{keywords:p.tags.B,revision:'2'}}}p.tags[r.authorizationId]=r.keywords;return {saved:true,current:{keywords:r.keywords,revision:'3'}}},
inspect:async()=>({path:'X:\\Assets\\A.png',name:'A.png',size:10}),showInFolder:async()=>true,
onAutoKeywordProgress:()=>noop,onKeywordBatchProgress:cb=>{batchProgress=cb;return noop},generateKeywordBatch:r=>{p.batches.push(r);return new Promise(resolve=>finish=resolve)},cancelGeneratedKeywords:async()=>{finish({status:'cancelled',total:3,processed:1,succeeded:1,failed:0,skipped:0});return true}}};
p.progress=value=>batchProgress({...value,requestId:p.batches.at(-1).requestId});p.finish=value=>finish(value);
createRoot(document.getElementById('root')).render(<CatalogWorkspace foreground onOpenSettings={noop} theme="dark" appearanceColors={{}} windowMaterial="none"/>);`;
app.whenReady().then(async()=>{let win;try{
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),loader:{'.svg':'text'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}});
 fs.writeFileSync(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 win=new BrowserWindow({show:false,width:1150,height:850,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await win.loadFile(path.join(root,'index.html'));
 const run=c=>win.webContents.executeJavaScript(c),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const ready=async c=>{for(let n=0;n<180;n++){if(await run(c))return;await wait(20)}throw Error('Timeout '+c)};
 const tile=name=>`[...document.querySelectorAll('.cap-computer-search-entry')].find(e=>e.getAttribute('aria-label')===${JSON.stringify(name)})`;
 const choose=async(names)=>{for(let n=0;n<names.length;n++)await run(`${tile(names[n])}.dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:${n>0}}))`)};
 const context=async(name)=>{await run(`${tile(name)}.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:260}))`);await ready('document.querySelector("[role=menu]")')};
 const menu=async label=>{await run(`[...document.querySelectorAll('[role=menuitem]')].find(e=>e.innerText===${JSON.stringify(label)}).click()`)};
 const input=async text=>run(`(()=>{const e=document.querySelector('.keyword-tag-editor input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 const save=()=>run(`document.querySelector('.keyword-tag-editor-actions .is-primary').click()`);
 await ready('document.querySelector(".cap-favorite-row button")');await run('document.querySelector(".cap-favorite-row button").click()');await ready('document.querySelectorAll(".cap-computer-search-entry").length===3');
 await run('document.querySelector(".cap-catalog-layout-tools button:last-child").click()');
 await choose(['A.png','B.png']);await ready('!document.querySelector(".cap-catalog-details-host").hidden');await ready('document.querySelector(".cap-catalog-details .cap-catalog-keyword-actions")');await ready('document.querySelector(".preview-sidebar-keywords")?.innerText==="共同"');
 await run('document.querySelector(".cap-catalog-layout-tools button:last-child").click()');assert.equal(await run('document.querySelector(".cap-catalog-details-host").hidden'),true);
 await context('A.png');await menu('编辑关键词');await ready('!document.querySelector(".cap-catalog-details-host").hidden&&document.querySelector(".keyword-tag-editor")');
 assert.equal(await run('document.querySelectorAll(".cap-computer-search-entry[aria-pressed=true]").length'),2,'right-click preserves selected files');assert.equal(await run('!!document.querySelector(".keyword-editor-card")'),false,'no center modal');
 await run('document.querySelector(".keyword-tag-editor-tag button").click()');await input('新增');await run('probe.conflict=true');await save();
 await ready('!document.querySelector(".keyword-tag-editor")&&probe.tags.A.includes("新增")');
 assert.deepEqual(await run('probe.tags.A'),['甲独有','新增']);assert.deepEqual(await run('probe.tags.B'),['乙独有','其他改动','新增'],'shared removal/addition preserves unique tags and concurrent edits');
 await ready('document.querySelector(".cap-catalog-activity-bar").innerText.includes("成功 2")');
 await context('A.png');await menu('编辑关键词');await ready('document.querySelector(".keyword-tag-editor")');await input('重试词');await run('probe.fail="B"');await save();
 await ready('document.querySelector(".keyword-tag-editor-status.is-error")');assert.ok(await run('document.querySelector(".keyword-tag-editor-list").innerText.includes("重试词")'),'partial failure retains draft');
 await run('probe.fail=null');await save();await ready('!document.querySelector(".keyword-tag-editor")&&probe.tags.B.includes("重试词")');assert.equal(await run('probe.tags.A.filter(w=>w==="重试词").length'),1,'retry does not duplicate already saved tags');
 await context('A.png');await menu('自动添加关键词');await ready('probe.batches.length===1');assert.deepEqual(await run('probe.batches[0].authorizationIds'),['A','B']);
 await run('probe.progress({phase:"generating",name:"B.png",processed:1,total:2,succeeded:1,failed:0,skipped:0})');await ready('document.querySelector(".cap-catalog-activity-bar").innerText.includes("1/2")');
 await choose(['Folder']);await run('probe.finish({status:"completed",total:2,processed:2,succeeded:1,failed:1,skipped:0,message:"一张图片无法读取"})');await ready('document.querySelector(".cap-catalog-activity-bar").innerText.includes("失败 1")');
 await context('Folder');assert.equal(await run('[...document.querySelectorAll("[role=menuitem]")].find(e=>e.innerText==="编辑关键词").disabled'),true);await menu('自动添加关键词');await ready('probe.batches.length===2');assert.deepEqual(await run('probe.batches[1].authorizationIds'),['Folder']);
 await run('document.querySelector(".cap-catalog-activity-bar button").click()');await ready('document.querySelector(".cap-catalog-activity-bar").innerText.includes("未处理 2")');
 await run('document.querySelector(".cap-favorite-row button").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true}))');await ready('document.querySelector("[role=menu]")');await menu('自动添加关键词');await ready('probe.batches.length===3');assert.equal(await run('probe.batches[2].favoriteId'),'fav');assert.equal(await run('"path" in probe.batches[2]'),false);
 await run('probe.finish({status:"completed",total:0,processed:0,succeeded:0,failed:0,skipped:0})');await choose(['A.png']);await context('A.png');await menu('编辑关键词');await ready('document.querySelector(".keyword-tag-editor")');
 await run('document.querySelector(".keyword-tag-editor-actions button").click()');await ready('!document.querySelector(".keyword-tag-editor")');
 await run('document.activeElement.blur();window.dispatchEvent(new KeyboardEvent("keydown",{code:"Space",key:" ",bubbles:true,cancelable:true}))');await wait(450);await ready('probe.previews===1');assert.equal(await run('!!document.querySelector(".keyword-tag-editor")'),false,'holding Space only opens preview');
 await choose(['A.png','B.png']);await context('A.png');await menu('编辑关键词');await ready('document.querySelector(".keyword-tag-editor")');await input('未保存草稿');
 await context('A.png');await menu('自动添加关键词');await ready('probe.batches.length===4');await run('probe.finish({status:"completed",total:2,processed:2,succeeded:2,failed:0,skipped:0})');await ready('document.querySelector(".cap-catalog-activity-bar").innerText.includes("成功 2")');
 assert.equal(await run('document.querySelector(".keyword-tag-editor input").value'),'未保存草稿','background completion never discards an open manual draft');
 console.log('Keyword batch UI: multi-selection, shared delta/conflict/retry, unified sidebar editing, hidden-sidebar reveal, folder/favorite actions, progress/cancel summaries and Space preview passed.');
 }catch(error){console.error(error);process.exitCode=1}finally{win?.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
