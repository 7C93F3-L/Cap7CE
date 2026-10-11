const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { app, BrowserWindow } = require('electron'), esbuild = require('esbuild');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Cap7CE-paging-'));
app.setPath('userData', root + '-profile');
const fixture = String.raw`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import ComputerSearchView from './src/renderer/computer-search/ComputerSearchView';
import {useComputerSearchController} from './src/renderer/computer-search/useComputerSearchController';
import './src/renderer/computer-search/ComputerSearch.css';
const noop=()=>{},p=window.probe={requests:[],pages:[],canceled:[],expire:false,fail:false,hold:false,short:false};
const owners=new Map();
const page=(taskId,offset)=>{const scope=owners.get(taskId),total=scope==='X:\\Other'?1:p.short?5:350;
 const size=p.short?2:100,end=Math.min(total,offset+size);
 return {taskId,items:Array.from({length:end-offset},(_,n)=>({id:scope+':'+(offset+n),authorizationId:taskId+':'+(offset+n),
 name:'file-'+String(offset+n).padStart(3,'0')+'.txt',path:scope+'\\file-'+(offset+n)+'.txt',extension:'.txt',
 iconName:'format-txt',isDirectory:false,canThumbnail:false})),nextCursor:end<total?String(end):null,isComplete:end>=total,catalogRevision:1};};
window.cap7ce={preview:{onNavigate:()=>noop,onClosed:()=>noop},computerSearch:{
 status:async()=>({state:'ready',searchAvailable:true,volumes:[],catalogRevision:1}),
 search:async request=>{p.requests.push(request);owners.set(request.taskId,request.scopePath);return page(request.taskId,0)},
 nextPage:async request=>{p.pages.push(request);if(p.expire){p.expire=false;throw Error('CoreRemoteError: invalid-cursor')}
 if(p.fail){p.fail=false;throw Error('timeout')}if(p.hold){p.hold=false;await new Promise(r=>p.resume=r)}return page(request.taskId,Number(request.cursor))},
 cancel:async id=>{p.canceled.push(id);return true}}};
function Fixture(){const [scope,setScope]=useState('X:\\Folder'),[fg,setFg]=useState(true);
 p.scope=setScope;p.foreground=setFg;
 const controller=useComputerSearchController(scope,fg,{fileConditions:{extensions:['.txt']}},undefined,true,true);
 p.controller=controller;
 return <div className="host"><ComputerSearchView controller={controller} foreground={fg} theme="dark" appearanceColors={{}}
 windowMaterial="none" onNativeDragStateChange={noop}/></div>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
app.whenReady().then(async () => {
 let win;
 try {
  const output = esbuild.buildSync({ stdin: { contents: fixture, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
   bundle: true, platform: 'browser', write: false, outdir: root, loader: { '.svg': 'text' },
   banner: { js: 'var __icons=()=>({});' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.glob': '__icons' } }).outputFiles;
  for (const file of output) fs.writeFileSync(file.path, file.contents);
  fs.writeFileSync(path.join(root, 'index.html'), '<link rel="stylesheet" href="stdin.css"><style>html,body,#root,.host{height:100%;margin:0}.host{position:relative}</style><div id="root"></div><script src="stdin.js"></script>');
  win = new BrowserWindow({ show: false, width: 900, height: 600, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const run = code => win.webContents.executeJavaScript(code), wait = ms => new Promise(r => setTimeout(r, ms));
  const ready = async code => { for (let n = 0; n < 200; n++) { if (await run(code)) return; await wait(20); } throw Error('Timeout: ' + code); };
  const count = () => run("document.querySelectorAll('.cap-computer-search-entry').length");
  const scroll = () => run("(()=>{const r=document.querySelector('.cap-computer-search-results');r.scrollTop=r.scrollHeight})()");
  await win.loadFile(path.join(root, 'index.html'));
  await ready('probe.controller.items.length===100&&!probe.controller.busy');
  assert.equal(await run('probe.pages.length'), 0, 'offscreen pages are not enumerated eagerly');
  assert.equal(await run("!!document.querySelector('.cap-computer-search-more')"), false, 'manual load-more button removed');
  const firstOwner = await run('probe.controller.taskId');
  await run('probe.expire=true'); await scroll();
  await ready('probe.controller.items.length===200&&!probe.controller.busy');
  assert.notEqual(await run('probe.controller.taskId'), firstOwner, 'stale cursor replaced under fresh owner');
  assert.equal(await run(`probe.canceled.includes(${JSON.stringify(firstOwner)})`), true);
  assert.equal(await run('probe.requests.every(r=>r.scopePath==="X:\\\\Folder"&&r.scopeKind==="direct-children"&&r.fileConditions.extensions[0]===".txt")'), true, 'recovery retains scope and filters');
  await run('probe.fail=true'); await scroll();
  await ready('!!probe.controller.pageError&&!probe.controller.busy');
  assert.equal(await count(), 200, 'continuation failure preserves displayed grid');
  assert.equal(await run("!!document.querySelector('.cap-computer-search-empty.is-error')"), false);
  const failedCalls = await run('probe.pages.length'); await wait(150);
  assert.equal(await run('probe.pages.length'), failedCalls, 'failure does not cause an automatic retry loop');
  await run("document.querySelector('.cap-computer-search-page-status button').click()");
  await ready('probe.controller.items.length===300&&!probe.controller.busy');
  await scroll(); await ready('probe.controller.items.length===350&&!probe.controller.busy');
  assert.equal(await run("new Set([...document.querySelectorAll('.cap-computer-search-entry')].map(x=>x.getAttribute('aria-label'))).size"), 350);
  const finishedCalls = await run('probe.pages.length'); await scroll(); await wait(100);
  assert.equal(await run('probe.pages.length'), finishedCalls, 'exhausted directory stops paging');
  await run('probe.scope("X:\\\\Folder2")'); await ready('probe.controller.items.length===100&&!probe.controller.busy');
  await run('probe.foreground(false)'); await scroll(); await wait(100);
  assert.equal(await count(), 100, 'background scroll does not request pages');
  await run('probe.hold=true;probe.foreground(true)'); await ready('typeof probe.resume==="function"');
  await run('probe.scope("X:\\\\Other")'); await ready('probe.controller.items.length===1&&!probe.controller.busy');
  await run('probe.resume()'); await wait(100);
  assert.equal(await count(), 1, 'late page cannot enter the next directory');
  await run('probe.short=true;probe.scope("X:\\\\Short")');
  await ready('probe.controller.items.length===5&&!probe.controller.busy');
  assert.equal(await run('probe.controller.nextCursor'), null, 'short pages fill the viewport without a scroll gesture');
  win.setContentSize(900, 250);
  await run('probe.short=false;probe.scope("X:\\\\Compact")');
  await ready('probe.controller.items.length===100&&!probe.controller.busy');
  await run("(()=>{const r=document.querySelector('.cap-computer-search-results');r.scrollLeft=r.scrollWidth})()");
  await ready('probe.controller.items.length===200&&!probe.controller.busy');
  assert.equal(await run("document.querySelector('.cap-computer-search-results').scrollLeft>0"), true, 'compact horizontal browsing also continues naturally');
  console.log('Automatic paging: stale recovery, unchanged scope, preserved errors, bounded retries, exhaustion, background and late-page guards passed.');
 } catch (error) { console.error(error.stack); process.exitCode = 1; }
 finally { win?.destroy(); if (path.dirname(root) !== os.tmpdir()) throw Error('Unsafe fixture root'); fs.rmSync(root, { recursive: true, force: true }); app.exit(process.exitCode ?? 0); }
});
