const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { app, BrowserWindow, ipcMain } = require('electron'), esbuild = require('esbuild');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Cap7CE-home-actions-'));
// Chromium keeps its profile databases open until process exit; keep them outside the removable fixture files.
const profile = root + '-profile'; fs.mkdirSync(profile);
app.on('window-all-closed', () => {});
app.setPath('userData', profile); app.setPath('sessionData', profile);
const fixture = String.raw`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import Home from './src/renderer/catalog-workspace/CatalogHome';
import {CatalogActivityProvider,CatalogActivityBar} from './src/renderer/catalog-workspace/CatalogActivity';
import './src/renderer/styles.css';import './src/renderer/stable-ui/StableUiFoundation.css';import './src/renderer/catalog-workspace/CatalogWorkspace.css';import './src/renderer/catalog-workspace/CatalogDetails.css';
const probe=window.probe={opens:[],drags:[]};
function Fixture(){const[active,setActive]=useState(true),[foreground,setForeground]=useState(true),[shown,setShown]=useState(true),[details,setDetails]=useState(null),[directories,setDirectories]=useState([]),[mode,setMode]=useState('square');
Object.assign(probe,{setActive,setForeground,setShown,setMode});
const favorites={directories,busy:false,add:async path=>{setDirectories(values=>[...values,{id:'saved',name:'saved',path}]);return true},remove:async id=>{setDirectories(values=>values.filter(item=>item.id!==id));return true}};
return <CatalogActivityProvider><input id="input"/><div className="cap-catalog-directory-toolbar" data-selection-preserve="true"><button id="control">control</button></div>
<div style={{display:'flex'}}><div id="home" style={{position:'relative',width:650,height:520}}>{shown&&<Home active={active} foreground={foreground} detailsHost={details} favorites={favorites} gridMode={mode}
theme="dark" windowMaterial="acrylic" appearanceColors={{themeColor:'#7894f8',accentColor:'#67bec1'}} onNativeDragStateChange={value=>probe.drags.push(value)} onOpen={value=>probe.opens.push(value)}/>}</div><div id="details" style={{width:260}} ref={setDetails}/></div><CatalogActivityBar/></CatalogActivityProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
app.whenReady().then(async () => {
  let win;
  const inspectWaiters = [];
  try {
    let holdInspect = false, failCopy = false, failPreview = false;
    const paths = ['X:\\Desktop', 'X:\\Downloads', 'X:\\Documents', 'X:\\', 'Y:\\'];
    const calls = { previews: [], stats: [], copies: [], reveals: [], opens: [], drags: [], metadata: [] };
    ipcMain.handle('skim:listLocations', () => ['desktop', 'downloads', 'documents'].map((kind, index) => ({ id: kind, kind, name: ['Desktop', 'Downloads', 'Documents'][index], path: paths[index] })));
    ipcMain.handle('skim:read', (_event, request) => ({ taskId: request.taskId, cancelled: false, entries: paths.slice(3).map((path, index) => ({ kind: 'drive', path, label: ['System', 'Assets'][index] })) }));
    ipcMain.handle('skim:cancel', () => true);
    ipcMain.handle('skim:inspect', async (_event, request) => {
      assert.ok(paths.includes(request.path)); assert.equal(request.kind, 'folder');
      if (holdInspect) await new Promise(resolve => inspectWaiters.push(resolve));
      return { path: request.path, kind: 'folder', name: request.path, extension: '', size: 0, modifiedAt: '2026-10-18T00:00:00Z', withinAddedDirectory: false };
    });
    ipcMain.handle('preview:open', (_event, data) => { calls.previews.push(data); return !failPreview; });
    ipcMain.handle('skim:startFolderStats', (_event, request) => { calls.stats.push(request); return true; });
    ipcMain.handle('file:open', (_event, value) => { calls.opens.push(value); return ''; });
    ipcMain.handle('file:showInFolder', (_event, value) => { calls.reveals.push(value); });
    ipcMain.handle('file:copyPaths', (_event, value) => { calls.copies.push(value); if (failCopy) throw Error('copy-failed'); return value.length; });
    ipcMain.on('file:startDrag', (_event, value) => calls.drags.push(value));
    ipcMain.handle('metadataBuild:startDirectory', (_event, request) => { calls.metadata.push(request); return { progress: { phase: 'preparing' }, directoryTask: { path: request.path, pending: 1 } }; });
    esbuild.buildSync({ stdin: { contents: fixture, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' }, bundle: true, platform: 'browser',
      outfile: path.join(root, 'fixture.js'), loader: { '.svg': 'text' }, banner: { js: 'var __icons=()=>({});' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.glob': '__icons' } });
    fs.writeFileSync(path.join(root, 'index.html'), '<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
    win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: { partition: "home-actions-fixture", sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      preload: path.resolve(__dirname, '../dist-electron/preload.js') } });
    const errors = []; win.webContents.on('preload-error', (_event, _file, error) => errors.push(error.message));
    win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    const run = code => win.webContents.executeJavaScript(code), wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const ready = async code => { for (let i = 0; i < 150; i++) { if (await run(code)) return; await wait(20); } throw Error('Timeout ' + code); };
    const tile = index => `#home .cap-skim-root-entry[aria-label="${['Desktop', 'Downloads', 'Documents', 'System (X:)', 'Assets (Y:)'][index]}"]`;
    const click = async (index, options = {}) => { await run(`(()=>{const node=document.querySelector(${JSON.stringify(tile(index))});node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));node.focus();node.dispatchEvent(new MouseEvent('click',{bubbles:true,...${JSON.stringify(options)}}))})()`); await wait(40); };
    const key = async (selector, code, options = {}) => { const prevented = await run(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.focus();const event=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:${JSON.stringify(code === 'Space' ? ' ' : code)},code:${JSON.stringify(code)},...${JSON.stringify(options)}});node.dispatchEvent(event);return event.defaultPrevented})()`); await wait(40); return prevented; };
    const menu = async index => { await run(`document.querySelector(${JSON.stringify(tile(index))}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:300,clientY:160}))`); await ready('document.querySelector("[data-context-menu]")'); };
    const labels = () => run('[...document.querySelectorAll("[data-context-menu] button")].map(node=>node.textContent.trim())');
    const action = async label => { await run(`(()=>{const node=[...document.querySelectorAll('[data-context-menu] button')].find(node=>node.textContent.trim().startsWith(${JSON.stringify(label)}));if(!node)throw Error('Missing menu action');node.click()})()`); await wait(50); };
    const selected = () => run('document.querySelectorAll("#home .thumb.selected").length');
    await win.loadFile(path.join(root, 'index.html')); await ready('document.querySelectorAll("#home .thumb").length===5');
    assert.equal(calls.previews.length, 0); assert.equal(calls.stats.length, 0, 'passive home browsing does not start preview/statistics');
    await click(0); assert.equal(await key(tile(0), 'Space'), true); assert.equal(calls.previews.length, 1, 'Space has one owner');
    assert.equal(calls.previews[0].provider, 'folderInfo'); assert.equal(calls.previews[0].filePath, paths[0]); assert.equal(calls.stats.length, 1);
    await key(tile(0), 'Space', { repeat: true }); assert.equal(calls.previews.length, 1);
    win.webContents.send('preview:navigate', 1); await wait(60); assert.equal(calls.previews.at(-1).filePath, paths[1]);
    assert.equal(await run(`document.querySelector(${JSON.stringify(tile(1))}).getAttribute('aria-pressed')`), 'true');
    await click(3); await key(tile(3), 'Space'); assert.equal(calls.previews.at(-1).provider, 'fileInfo');
    assert.equal(calls.stats.length, 2, 'drive preview never launches a recursive full-drive count');
    await ready('document.querySelector("#details header strong").textContent==="磁盘"');
    await click(0); await click(2, { shiftKey: true }); assert.equal(await selected(), 3);
    await click(3, { ctrlKey: true }); assert.equal(await selected(), 4);
    await key(tile(3), 'KeyC', { ctrlKey: true, shiftKey: true }); assert.deepEqual(calls.copies.at(-1), paths.slice(0, 4));
    await ready('document.querySelector("#details .cap-catalog-details-name").textContent==="已选择 4 项"');
    await menu(1); assert.equal(await selected(), 4, 'right-click preserves an existing multi-selection');
    let list = await labels(); assert.ok(list.some(value => value.includes('预览') && value.includes('Space')));
    assert.ok(!list.some(value => /删除|获取.*元数据|自动添加关键词|添加收藏/.test(value)), 'single-target actions and deletion are absent from a root multi-selection');
    await action('复制'); assert.deepEqual(calls.copies.at(-1), paths.slice(0, 4));
    await menu(4); assert.equal(await selected(), 1, 'right-clicking another entry replaces selection');
    list = await labels(); assert.ok(list.some(value => value.includes('预览'))); assert.ok(list.at(-1).includes('元数据')); assert.ok(!list.some(value => value.includes('删除')));
    await action('预览'); assert.equal(calls.previews.at(-1).filePath, paths[4]);
    await menu(0); await action('添加收藏'); await menu(0); assert.ok((await labels()).some(value => value.includes('移除收藏'))); await action('移除收藏');
    await click(0); await key(tile(0), 'Enter', { ctrlKey: true }); assert.equal(calls.reveals.at(-1), paths[0]);
    await click(3); await key(tile(3), 'Enter', { ctrlKey: true }); assert.equal(calls.opens.at(-1), paths[3]);
    await key(tile(3), 'Enter'); assert.equal((await run('probe.opens')).at(-1), paths[3]);
    await click(0); await run(`document.querySelector(${JSON.stringify(tile(0))}).dispatchEvent(new Event('dragstart',{bubbles:true,cancelable:true}))`); await wait(40); assert.deepEqual(calls.drags.at(-1), [paths[0]]);
    assert.equal(await run(`document.querySelector(${JSON.stringify(tile(3))}).draggable`), false);
    await run(`document.querySelector(${JSON.stringify(tile(0))}).dispatchEvent(new Event('dragend',{bubbles:true}))`);
    assert.deepEqual(await run('probe.drags'), [true, false]);
    let before = calls.previews.length, copies = calls.copies.length;
    await key('#input', 'Space'); await key('#input', 'KeyC', { ctrlKey: true, shiftKey: true }); await key('#control', 'Space');
    assert.equal(calls.previews.length, before); assert.equal(calls.copies.length, copies, 'inputs and toolbar controls do not dispatch selected-item shortcuts');
    await run('probe.setForeground(false)'); await key(tile(0), 'Space'); assert.equal(calls.previews.length, before); await run('probe.setForeground(true)');
    failCopy = true; await key(tile(0), 'KeyC', { ctrlKey: true, shiftKey: true }); await ready('document.querySelector(".cap-catalog-activity-bar")?.textContent.includes("操作未完成")'); failCopy = false;
    failPreview = true; await key(tile(0), 'Space'); await ready('document.querySelector(".cap-catalog-activity-bar")?.textContent.includes("操作未完成")'); failPreview = false;
    holdInspect = true; before = calls.previews.length; await key(tile(0), 'Space'); await run('probe.setActive(false)');
    holdInspect = false; inspectWaiters.splice(0).forEach(resolve => resolve()); await wait(80); assert.equal(calls.previews.length, before, 'late inspection cannot open a preview after leaving the scene');
    win.webContents.send('preview:navigate', 1); await wait(40); assert.equal(calls.previews.length, before);
    await run('probe.setActive(true);probe.setMode("gallery")'); await wait(60); await click(1); await key(tile(1), 'Space'); assert.equal(calls.previews.at(-1).filePath, paths[1]);
    before = calls.previews.length; win.webContents.send('preview:closed'); await wait(30); win.webContents.send('preview:navigate', 1); await wait(40); assert.equal(calls.previews.length, before);
    await key(tile(1), 'Escape'); assert.equal(await selected(), 0);
    assert.deepEqual(errors, []);
    console.log('Home actions: isolated sandbox preview/menu parity, folder/drive policy, owned navigation, multi-selection, clipboard, reveal, favorites, dragging, details, input/foreground guards and stale preview rejection passed.');
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
  finally {
    inspectWaiters.splice(0).forEach(resolve => resolve()); win?.destroy();
    try { assert.equal(path.dirname(root), os.tmpdir()); await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
    catch (error) { console.error(error); process.exitCode = 1; }
    app.exit(process.exitCode ?? 0);
  }
});
