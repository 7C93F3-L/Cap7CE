const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-query-notice-'));app.setPath('userData',root+'-profile');app.on('window-all-closed',()=>{});
const fixture=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{createPortal,flushSync}from'react-dom';
import CatalogQueryNotice from './src/renderer/catalog-workspace/CatalogQueryNotice';import BottomNoticeBar from './src/renderer/feedback/BottomNoticeBar';import './src/renderer/catalog-workspace/CatalogActivity.css';
function Fixture(){const [state,setState]=useState({busy:false,invalid:false,visible:true}),[host,setHost]=useState(null);window.probe={set:patch=>flushSync(()=>setState(value=>({...value,...patch})))};
return <><div className="cap-catalog-activity-dock"><BottomNoticeBar className="other-job" message="正在生成关键词"/><div className="cap-catalog-query-notice-host" ref={setHost}/></div>
{state.visible&&host&&createPortal(<CatalogQueryNotice busy={state.busy} invalid={state.invalid}/>,host)}</>};createRoot(document.getElementById('root')).render(<Fixture/>);`;
app.whenReady().then(async()=>{let win;try{
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),define:{'process.env.NODE_ENV':'"production"'}});
 fs.writeFileSync(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 win=new BrowserWindow({show:false,width:900,height:600,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});await win.loadFile(path.join(root,'index.html'));
 const run=c=>win.webContents.executeJavaScript(c),wait=ms=>new Promise(r=>setTimeout(r,ms));const ready=async c=>{for(let n=0;n<120;n++){if(await run(c))return;await wait(20)}throw Error('Timeout '+c)};
 await ready('window.probe&&document.querySelector(".other-job")');const height=await run('document.querySelector(".cap-catalog-activity-dock").getBoundingClientRect().height');
 assert.equal(height,34,'empty query host reserves no space');
 await run('probe.set({busy:true})');await wait(80);assert.equal(await run('!!document.querySelector(".cap-catalog-query-notice")'),false);
 await run('probe.set({busy:false})');await wait(350);assert.equal(await run('!!document.querySelector(".cap-catalog-query-notice")'),false,'fast queries never flash a stale loading notice');
 await run('probe.set({busy:true})');await ready('document.querySelector(".cap-catalog-query-notice progress")');
 assert.equal(await run('document.querySelectorAll(".cap-bottom-notice-bar").length'),2,'query feedback coexists with other tasks');
 await run('document.querySelector(".cap-catalog-query-notice button").click()');await ready('!document.querySelector(".cap-catalog-query-notice")');await wait(350);assert.equal(await run('!!document.querySelector(".cap-catalog-query-notice")'),false,'dismissal lasts for the current loading state');
 await run('probe.set({busy:false});probe.set({busy:true})');await ready('document.querySelector(".cap-catalog-query-notice progress")');
 await run('probe.set({invalid:true})');await ready('document.querySelector(".cap-catalog-query-notice")?.innerText.includes("筛选条件无效")');assert.equal(await run('!!document.querySelector(".cap-catalog-query-notice progress")'),false);
 await wait(10100);assert.equal(await run('!!document.querySelector(".cap-catalog-query-notice")'),false,'invalid-filter notice expires');
 await run('probe.set({busy:false,invalid:false})');assert.equal(await run('document.querySelector(".cap-catalog-activity-dock").getBoundingClientRect().height'),height);
 await run('probe.set({busy:true});probe.set({visible:false})');await wait(350);assert.equal(await run('!!document.querySelector(".cap-catalog-query-notice")'),false,'retired pages clean up pending feedback');assert.equal(await run('document.querySelector(".other-job").innerText'),'正在生成关键词');
 console.log('Query notice: no idle space, loading delay/completion, dismiss/reset, error priority/expiry, task coexistence and retired-page cleanup passed.');
 }catch(error){console.error(error);process.exitCode=1}finally{win?.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
