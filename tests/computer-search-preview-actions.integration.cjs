const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { app, BrowserWindow } = require('electron'), esbuild = require('esbuild');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Cap7CE-preview-actions-'));
app.setPath('userData', root + '-profile');
const fixture = String.raw`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {useComputerSearchResultActions} from './src/renderer/computer-search/useComputerSearchResultActions';
const noop=()=>{},p=window.probe={opened:[],stats:[],held:[]};
window.cap7ce={computerSearch:{inspect:async r=>{if(p.hold)await new Promise(resolve=>p.held.push(resolve));return {path:'X:\\'+r.authorizationId,name:r.authorizationId,size:1,modifiedAt:'now'}},
readTextPreview:async()=>{if(p.failText)throw Error('unsupported');return {content:'fixture text'}}},
preview:{open:async data=>{p.opened.push(data);return true},onNavigate:()=>noop,onClosed:callback=>{p.close=callback;return noop}},
skim:{startFolderStats:async request=>{p.stats.push(request);return true}}};
function Fixture(){const [task,setTask]=useState('owner');p.task=setTask;
p.actions=useComputerSearchResultActions({items:[],taskId:task,theme:'dark',appearanceColors:{},onNativeDragStateChange:noop});
return <div>Preview actions fixture</div>}createRoot(document.getElementById('root')).render(<Fixture/>);
`;
app.whenReady().then(async () => {
  let win;
  try {
    const output = esbuild.buildSync({ stdin: { contents: fixture, resolveDir: path.resolve(__dirname, '..'), loader: 'tsx' },
      bundle: true, platform: 'browser', write: false, outdir: root, define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles;
    for (const file of output) fs.writeFileSync(file.path, file.contents);
    fs.writeFileSync(path.join(root, 'index.html'), '<div id="root"></div><script src="stdin.js"></script>');
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const run = code => win.webContents.executeJavaScript(code), wait = ms => new Promise(r => setTimeout(r, ms));
    const ready = async code => { for (let n = 0; n < 100; n++) { if (await run(code)) return; await wait(20); } throw Error('Timeout: ' + code); };
    await win.loadFile(path.join(root, 'index.html')); await ready('!!probe.actions');
    for (const provider of ['image','text','audio','video','pdf','office','archive','font','epub','mobi','fileInfo']) {
      await run(`probe.actions.openPreview({authorizationId:${JSON.stringify(provider)},previewKind:${JSON.stringify(provider)},isDirectory:false})`);
      assert.equal(await run('probe.opened.at(-1).provider'), provider);
      assert.equal(await run('probe.opened.at(-1).sourceAuthorization.taskId'), 'owner');
    }
    await run('probe.actions.openPreview({authorizationId:"folder",isDirectory:true})');
    assert.equal(await run('probe.opened.at(-1).provider'), 'folderInfo');
    assert.equal(await run('probe.stats.length'), 1, 'folder preview must start the existing cancellable statistics');
    await run('probe.failText=true;probe.actions.openPreview({authorizationId:"badtext",previewKind:"text"})');
    assert.equal(await run('probe.opened.at(-1).provider'), 'fileInfo');
    await run('probe.failText=false;probe.hold=true;void probe.actions.openPreview({authorizationId:"older",previewKind:"image"});void probe.actions.openPreview({authorizationId:"newer",previewKind:"image"})');
    await ready('probe.held.length===2'); await run('probe.held[1]()'); await ready('probe.opened.at(-1).itemId==="newer"');
    const count = await run('probe.opened.length'); await run('probe.held[0]()'); await wait(50);
    assert.equal(await run('probe.opened.length'), count, 'late inspection cannot replace the newer preview');
    await run('probe.held=[];void probe.actions.openPreview({authorizationId:"closed",previewKind:"image"})');
    await ready('probe.held.length===1'); await run('probe.close();probe.held[0]()'); await wait(50);
    assert.equal(await run('probe.opened.length'), count, 'closing invalidates pending inspection');
    await run('probe.held=[];void probe.actions.openPreview({authorizationId:"oldowner",previewKind:"image"});probe.task("next")');
    await ready('probe.held.length===1'); await wait(50); await run('probe.held[0]()'); await wait(50);
    assert.equal(await run('probe.opened.length'), count, 'query owner replacement invalidates pending inspection');
    console.log('Catalog preview actions: every provider, text fallback, folder statistics and late request guards passed.');
  } catch (error) { console.error(error.stack); process.exitCode = 1; }
  finally { win?.destroy(); fs.rmSync(root, { recursive: true, force: true }); app.exit(process.exitCode ?? 0); }
});
