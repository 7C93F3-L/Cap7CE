const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {app,BrowserWindow,ipcMain}=require('electron'),esbuild=require('esbuild');
app.on('window-all-closed',()=>{}); // Cleanup must finish before reporting the assertion exit code.
const repo=path.resolve(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-catalog-commands-'));app.setPath('userData',root+'-profile');
let win,queries=[],themes=[],clears=0,tokens=0,failTheme=false,failView=false,holdClear,releaseClear;
let preferences={commandEnabled:true},viewPreferences={};
const handle=(channel,fn)=>ipcMain.handle(channel,(_event,...args)=>fn(...args));
handle('preferences:get',()=>preferences);handle('preferences:getCatalogView',()=>viewPreferences);
handle('preferences:updateCatalogView',(_scope,patch)=>{if(failView)throw Error('save-failed');viewPreferences={computer:{...viewPreferences.computer,...patch}};return viewPreferences});
handle('preferences:updateCommandEnabled',enabled=>(preferences={...preferences,commandEnabled:enabled}));
handle('preferences:updateTheme',theme=>{if(failTheme)throw Error('save-failed');themes.push(theme);return preferences});
handle('cache:authorizeClear',()=>{tokens++;return 'single-use-test-token'});
handle('cache:clearAll',async token=>{assert.equal(token,'single-use-test-token');clears++;if(holdClear)await holdClear;return {cacheCount:0,totalBytes:0}});
handle('computerSearch:status',()=>({state:'ready',searchAvailable:true,catalogRevision:1,volumes:[]}));
handle('computerSearch:search',request=>{queries.push(request.query);return {taskId:request.taskId,items:[{id:'one',name:request.query||'initial',isDirectory:true,path:'X:\\Assets\\item'}],nextCursor:null}});
handle('computerSearch:cancel',()=>true);
const fixture=String.raw`
import React,{useState,useRef}from'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';
import Toolbar from'./src/renderer/catalog-workspace/CatalogDirectoryToolbar';import{CatalogCommandProvider,CatalogCommandNotice}from'./src/renderer/quick-commands/CatalogCommandProvider';
import{useComputerSearchController}from'./src/renderer/computer-search/useComputerSearchController';import{useCatalogViewOptions}from'./src/renderer/catalog-workspace/useCatalogViewOptions';
import{CatalogQuickCommandSettingsRows}from'./src/renderer/quick-commands/CatalogQuickCommandSettingsRows';
import'./src/renderer/styles.css';import'./src/renderer/stable-ui/StableUiFoundation.css';import'./src/renderer/catalog-workspace/CatalogDesign.css';import'./src/renderer/catalog-workspace/CatalogActivity.css';
const noop=()=>{},favorites={directories:[],add:async()=>true,remove:async()=>true,rename:async()=>true,reload:async()=>true};
function Fixture(){const[path,setPath]=useState('X:\\Assets'),[searchMode,setSearchMode]=useState(false),[active,setActive]=useState(true),[help,setHelp]=useState(false),ref=useRef(null);
const controller=useComputerSearchController(path,true,undefined,undefined,true),view=useCatalogViewOptions(null,path);
window.probe={query:controller.query,items:controller.items.map(i=>i.name),path,setPath:value=>flushSync(()=>setPath(value)),active:value=>flushSync(()=>setActive(value)),help:()=>setHelp(true)};
return <div className="app cap-stable-ui theme-dark"><CatalogCommandProvider favorites={favorites} open={noop}><div className="cap-catalog-design" style={{display:'block',height:'100vh',width:'100%'}}>
<Toolbar path={path} active={active} canBack canForward canUp onBack={()=>setPath('X:\\Back')} onForward={noop} onUp={noop} onRefresh={noop} refreshing={false} onOpen={setPath} onHome={()=>setPath(null)}
searchMode={searchMode} onSearchMode={()=>setSearchMode(v=>!v)} query={controller.query} onQuery={controller.setQuery} onSubmit={value=>controller.submit(value)} enabled={controller.canSubmit} inputRef={ref}
commandPage={{...view,home:()=>setPath(null),refresh:async()=>true}} gridMode="square" onGridMode={noop} includeSubfolders={view.includeSubfolders} onIncludeSubfolders={view.toggleSubfolders} showHidden={view.showHidden} onShowHidden={view.toggleHidden} sort={view.sort} onSort={view.setSort}
random={{enabled:false,seed:1,batchNumber:1,toggle:noop,disable:noop,next:noop}}/>
<div className="cap-catalog-activity-dock"><CatalogCommandNotice/></div>{help&&<CatalogQuickCommandSettingsRows/>}</div></CatalogCommandProvider></div>}
createRoot(document.getElementById('root')).render(<React.StrictMode><Fixture/></React.StrictMode>);`;
app.whenReady().then(async()=>{try{
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:repo,loader:'tsx'},bundle:true,platform:'browser',loader:{'.svg':'text'},banner:{js:'var __icons=()=>({});'},outfile:path.join(root,'fixture.js'),define:{'process.env.NODE_ENV':'"development"','import.meta.glob':'__icons'}});
 fs.writeFileSync(path.join(root,'index.html'),'<link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 win=new BrowserWindow({show:false,width:1100,height:700,webPreferences:{preload:path.join(repo,'dist-electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const errors=[];win.webContents.on('preload-error',(_,__,e)=>errors.push(e.message));
 const run=code=>win.webContents.executeJavaScript(code),sleep=ms=>new Promise(r=>setTimeout(r,ms)),input='.cap-catalog-directory-toolbar > input';
 const ready=async code=>{for(let n=0;n<200;n++){if(await run(code))return;await sleep(20)}throw Error('Timeout '+code)};
 const fill=async value=>{await run(`(()=>{const e=document.querySelector('${input}');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await ready(`document.querySelector('${input}').value===${JSON.stringify(value)}`)};
 const submit=()=>run('document.querySelector(".cap-catalog-directory-toolbar").requestSubmit()');
 const escape=()=>run(`document.querySelector('${input}').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
 const edit=async()=>{await run('document.querySelector(".cap-catalog-address-edit").click()');await ready(`document.querySelector('${input}')`)};
 const waitCommandEnabled=async value=>{for(let n=0;n<200;n++){if(preferences.commandEnabled===value)return;await sleep(20)}throw Error('Command preference was not persisted')};
 const notice=message=>ready(`document.querySelector('.cap-catalog-command-notice')?.textContent.includes(${JSON.stringify(message)})`);
 await win.loadFile(path.join(root,'index.html'));await ready('probe.items.length===1');await sleep(100);const initialCount=queries.length;
 await edit();await fill('ui:dark');assert.equal(queries.length,initialCount);assert.equal(themes.length,0);
 await submit();await ready('document.querySelector(".cap-catalog-breadcrumb")');assert.deepEqual(themes,['dark']);assert.equal(queries.length,initialCount,'commands never enter the file query');await notice('指令已执行');
 await run('document.querySelector(".cap-catalog-address-toggle").click()');await fill('ordinary');assert.equal(queries.length,initialCount,'search drafts wait for submission too');
 await submit();await ready('probe.query==="ordinary"&&probe.items[0]==="ordinary"');const preservedCount=queries.length;
 await fill('ui:light');await run(`document.querySelector('${input}').focus()`);await submit();await ready(`document.querySelector('${input}').value==='ordinary'`);assert.deepEqual(themes,['dark','light']);assert.equal(queries.length,preservedCount);assert.equal(await run(`document.activeElement===document.querySelector('${input}')`),true,'execution keeps search focus for keyboard-only use');
 await fill('cache:clear');await submit();await notice('输入 y / n');assert.equal(tokens+clears,0,'confirmation does not authorize or clear anything');assert.equal(await run('probe.query'),'ordinary');
 await fill('maybe');await submit();await notice('请输入 y 或 n');assert.equal(queries.length,preservedCount);assert.equal(clears,0);
 await fill('N');await submit();await notice('已取消');assert.equal(await run(`document.querySelector('${input}').value`),'ordinary');
 await fill('cache:clear');await submit();await notice('输入 y / n');await escape();await notice('已取消');assert.equal(clears,0);assert.equal(await run(`document.querySelector('${input}').value`),'ordinary');
 await fill('cache:clear');await submit();await notice('输入 y / n');await fill('Y');await submit();await notice('已清理');assert.equal(clears,1);assert.equal(tokens,1);
 await fill('cache:clear');await submit();await notice('输入 y / n');await run('document.querySelector(".cap-catalog-address-toggle").click()');await ready('document.querySelector(".cap-catalog-breadcrumb")');
 await edit();await fill('y');await submit();assert.equal(clears,1,'mode switching cancels the old confirmation');
 await run('probe.setPath("X:\\\\Assets")');await edit();await fill('cache:clear');await submit();await notice('输入 y / n');await run('probe.setPath("X:\\\\Other")');await ready('document.querySelector(".cap-catalog-breadcrumb")');
 await edit();await fill('cache:clear');await submit();await notice('输入 y / n');await run('probe.active(false)');await sleep(50);await run('probe.active(true)');await ready('document.querySelector(".cap-catalog-breadcrumb")');await edit();
 await fill('y');await submit();assert.equal(clears,1,'leaving an active page cancels its confirmation');
 await run('probe.setPath("X:\\\\Assets")');await edit();failTheme=true;await fill('ui:dark');await submit();await notice('执行失败');assert.equal(await run(`document.querySelector('${input}').value`),'ui:dark');failTheme=false;
 await fill('edge:on');await submit();await notice('已停用');assert.equal(themes.length,2);await escape();await ready('document.querySelector(".cap-catalog-breadcrumb")');
 await edit();await fill('see:sort time');await submit();await ready('document.querySelector(".cap-catalog-breadcrumb")');assert.equal(viewPreferences.computer.sort,'modified-ascending');
 await edit();failView=true;await fill('see:hidden on');await submit();await notice('执行失败');assert.equal(await run(`document.querySelector('${input}').value`),'see:hidden on');failView=false;
 await escape();await edit();await fill('cache:clear');await submit();await notice('输入 y / n');holdClear=new Promise(resolve=>{releaseClear=resolve});await fill('y');await submit();await ready(`document.querySelector('${input}').readOnly`);
 await submit();assert.equal(clears,2);releaseClear();holdClear=null;await ready('document.querySelector(".cap-catalog-breadcrumb")');assert.equal(tokens,2,'repeated Enter cannot duplicate a running command');
 await run('document.querySelector(".cap-catalog-address-toggle").click()');await fill('cmd:off');await submit();await notice('指令已执行');await waitCommandEnabled(false);assert.equal(preferences.commandEnabled,false);
 await fill('ui:dark');await submit();await ready('probe.query==="ui:dark"');assert.equal(themes.length,2,'disabled parser leaves command-looking text as ordinary search');
 await fill('cmd:on');await submit();await notice('指令已执行');await waitCommandEnabled(true);assert.equal(preferences.commandEnabled,true);
 await fill('y');await submit();await ready('probe.query==="y"');assert.equal(clears,2,'y is a search outside confirmation');
 await fill('see:root');await submit();await ready('probe.path===null');await notice('指令已执行');
 await run('probe.help()');await ready('document.querySelector(".cap-settings-quick-commands-panel")');
 const commands=await run('[...document.querySelectorAll(".cap-settings-command-pill")].map(e=>e.textContent)');
 for(const retired of ['edge:on','cache:thumb','cache:skim','ai:on','skim:','see:scope custom'])assert.ok(!commands.includes(retired));
 assert.ok(commands.includes('see:hidden on'));assert.ok(commands.some(c=>c.startsWith('dir:remove')));assert.deepEqual(errors,[]);
 console.log('Catalog commands: isolated sandbox IPC, both input modes, staged queries, y/n/Escape, mode/page cancellation, failures and retry text, durable view writes, duplicate guards, parser switch and current help passed.');
 }catch(error){console.error(error.stack);process.exitCode=1}finally{win?.destroy();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));try{await fs.promises.rm(root,{recursive:true,force:true,maxRetries:3})}catch(error){console.error(error.stack);process.exitCode=1}finally{app.exit(process.exitCode??0)}}});
