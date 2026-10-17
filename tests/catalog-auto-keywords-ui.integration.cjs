const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-auto-keywords-ui-'));app.setPath('userData',root+'-profile');app.on('window-all-closed',()=>{});
const fixture=String.raw`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import CatalogKeywords from './src/renderer/catalog-workspace/CatalogKeywords';import {CatalogActivityProvider,CatalogActivityBar} from './src/renderer/catalog-workspace/CatalogActivity';
import './src/renderer/preview/StablePreviewSidebar.css';
const p=window.probe={requests:[],tags:{A:['手工'],B:['B标签']},cancelled:0,listeners:0},pending=new Map();let progress;
window.cap7ce={computerSearch:{readKeywords:async r=>({keywords:p.tags[r.authorizationId]??[],revision:'1'}),saveKeywords:async r=>({saved:true,current:{keywords:r.keywords,revision:'2'}}),
onAutoKeywordProgress:callback=>{progress=callback;p.listeners++;return()=>p.listeners--},cancelGeneratedKeywords:async r=>{p.cancelled++;pending.get(r.requestId)({status:'cancelled'});return true},
generateKeywords:r=>{p.requests.push(r);return new Promise(resolve=>pending.set(r.requestId,resolve))}}};
p.progress=(id,phase)=>progress({requestId:id,phase});p.finish=(id,result)=>{if(result.status==='saved')p.tags[p.requests.find(r=>r.requestId===id).authorizationId]=result.current.keywords;pending.get(id)(result)};
function Fixture(){const [name,setName]=useState('A'),[width,setWidth]=useState(280);p.select=n=>flushSync(()=>setName(n));p.width=n=>flushSync(()=>setWidth(n));
const item={path:'X:\\'+name+'.png',name:name+'.png',extension:name==='video'?'.mp4':'.png',authorizationId:name,isDirectory:false};
return <CatalogActivityProvider><div className="cap-catalog-design" style={{position:'relative',height:'100vh',display:'block',width:'100%',background:'#30323c',color:'#eee'}}>
<div className="preview-information-sidebar" style={{width,height:'80vh'}}><CatalogKeywords item={item} taskId="task" foreground/></div><div className="cap-catalog-activity-dock"><CatalogActivityBar/></div></div></CatalogActivityProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
app.whenReady().then(async()=>{let win;try{
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),loader:{'.svg':'text'},define:{'process.env.NODE_ENV':'"production"'}});
 fs.writeFileSync(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 win=new BrowserWindow({show:false,width:800,height:600,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});await win.loadFile(path.join(root,'index.html'));
 win.webContents.on('console-message',event=>{if(event.level>=3)console.log('renderer:',event.message)});
 const run=async c=>{try{return await win.webContents.executeJavaScript(c)}catch(error){throw Error(c+'\n'+error)}},wait=ms=>new Promise(r=>setTimeout(r,ms));
 const ready=async c=>{for(let i=0;i<180;i++){if(await run(c))return;await wait(20)}throw Error('Timeout '+c)};
 const click='[...document.querySelectorAll(".cap-catalog-keyword-actions button")].find(e=>e.innerText==="自动添加").click()';
 await ready('document.querySelector(".preview-sidebar-keywords")');assert.equal(await run('document.querySelector("h2").innerText'),'添加关键词');
 await run(click);await ready('probe.requests.length===1');const id=await run('probe.requests[0].requestId');
 assert.ok(await run('document.querySelector(".cap-catalog-activity-bar").innerText.includes("正在准备图片")'));
 await run('probe.progress("stale","generating")');assert.ok(await run('document.querySelector(".cap-catalog-activity-bar").innerText.includes("正在准备图片")'));
 await run(`probe.progress('${id}','starting')`);await ready('document.querySelector(".cap-catalog-activity-bar").innerText.includes("正在启动模型")');
 await run(`probe.progress('${id}','generating');probe.select('B')`);await ready('document.querySelector(".preview-sidebar-keywords")?.innerText.includes("B标签")');
 assert.ok(await run('document.querySelector(".cap-catalog-activity-bar").innerText.includes("A.png")'),'task feedback survives selection changes');
 await run(`probe.finish('${id}',{status:'saved',current:{keywords:['手工','山景'],revision:'2'},added:1})`);
 await ready('document.querySelector(".cap-catalog-activity-bar").innerText.includes("已添加 1")');
 assert.equal(await run('document.querySelector(".preview-sidebar-keywords").innerText.includes("山景")'),false,'A generation cannot overwrite B');
 await run('probe.select("A")');await ready('document.querySelector(".preview-sidebar-keywords")?.innerText.includes("山景")');
 for(const width of [220,280,420]){await run(`probe.width(${width})`);assert.equal(await run('(()=>{const e=document.querySelector(".preview-sidebar-section");return e.scrollWidth>e.clientWidth+1})()'),false);}
 assert.ok(await run('document.querySelector(".cap-catalog-activity-bar").getBoundingClientRect().height')<=40,'temporary feedback is a narrow strip');
 await run('document.querySelector(".cap-catalog-activity-bar button").click()');await ready('!document.querySelector(".cap-catalog-activity-bar")');
 await run(click);await ready('probe.requests.length===2');await run('document.querySelector(".cap-catalog-activity-bar button").click()');await ready('document.querySelector(".cap-catalog-activity-bar").innerText.includes("已取消")');assert.equal(await run('probe.cancelled'),1);
 await run(click);await ready('probe.requests.length===3');await run('probe.finish(probe.requests[2].requestId,{status:"failed",message:"模型未配置，请检查设置"})');await ready('document.querySelector(".cap-catalog-activity-bar").innerText.includes("模型未配置")');
 assert.deepEqual(await run('probe.tags.A'),['手工','山景'],'failure and cancellation preserve saved tags');
 await run(click);await ready('probe.requests.length===4');await run('probe.progress(probe.requests[3].requestId,"saving")');await ready('document.querySelector(".cap-catalog-activity-bar button").disabled');
 await run('probe.finish(probe.requests[3].requestId,{status:"saved",current:{keywords:["手工","山景"],revision:"3"},added:0});probe.select("video")');
 await ready('!!document.querySelector(".cap-catalog-keyword-actions button:last-child")');assert.equal(await run('document.querySelector(".cap-catalog-keyword-actions button:last-child").disabled'),true,'unsupported files keep manual editing only');
 assert.equal(await run('probe.listeners'),1,'one workspace progress subscription');
 console.log('Automatic keyword UI: footer actions, bounded strip, phases, selection isolation, saved refresh, cancellation, failure retry and unsupported formats passed.');
}catch(error){console.error(error);process.exitCode=1}finally{win?.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
