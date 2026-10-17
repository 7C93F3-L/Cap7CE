const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-home-menu-'));app.setPath('userData',root+'-profile');app.on('window-all-closed',()=>{});
const fixture=String.raw`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import CatalogHome from './src/renderer/catalog-workspace/CatalogHome';
import {CatalogActivityProvider,CatalogActivityBar} from './src/renderer/catalog-workspace/CatalogActivity';
import './src/renderer/styles.css';import './src/renderer/stable-ui/StableUiFoundation.css';
const noop=()=>{},p=window.probe={opened:[],entered:[],copies:[],metadata:[],batches:[],cancelled:0};let finish;
window.cap7ce={skim:{listLocations:async()=>[{id:'desktop',kind:'desktop',path:'X:\\Desktop'}],read:async()=>({entries:[{kind:'drive',path:'X:\\',label:'System'}]})},
files:{open:async path=>{p.opened.push(path);return ''},copyPaths:async paths=>{p.copies.push(paths);return paths.length}},
metadataBuild:{startDirectory:async r=>{p.metadata.push(r);return {};}},computerSearch:{onAutoKeywordProgress:()=>noop,onKeywordBatchProgress:()=>noop,
generateKeywordBatch:async r=>{p.batches.push(r);if(p.hold)return new Promise(resolve=>finish=resolve);return {status:'completed',total:0,processed:0,succeeded:0,failed:0,skipped:0}},
cancelGeneratedKeywords:async()=>{p.cancelled++;finish({status:'cancelled',total:0,processed:0,succeeded:0,failed:0,skipped:0});return true}}};
function Fixture(){const [directories,setDirectories]=useState([]),[foreground,setForeground]=useState(true);p.foreground=setForeground;return <CatalogActivityProvider><div style={{height:'100vh',position:'relative'}}>
<CatalogHome foreground={foreground} gridMode="square" onOpen={path=>p.entered.push(path)} theme="dark" appearanceColors={{}} windowMaterial="none" favorites={{directories,busy:false,
add:async path=>{setDirectories([{id:'fav',path}]);return true},remove:async()=>{setDirectories([]);return true}}}/><CatalogActivityBar/></div></CatalogActivityProvider>}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
app.whenReady().then(async()=>{let win;try{
 esbuild.buildSync({stdin:{contents:fixture,resolveDir:path.resolve(__dirname,'..'),loader:'tsx'},bundle:true,platform:'browser',outfile:path.join(root,'fixture.js'),loader:{'.svg':'text'},banner:{js:'var __icons=()=>({});'},define:{'process.env.NODE_ENV':'"production"','import.meta.glob':'__icons'}});
 fs.writeFileSync(path.join(root,'index.html'),'<meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
 win=new BrowserWindow({show:false,width:1000,height:650,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await win.loadFile(path.join(root,'index.html'));
 const run=c=>win.webContents.executeJavaScript(c),wait=ms=>new Promise(r=>setTimeout(r,ms));const ready=async c=>{for(let n=0;n<150;n++){if(await run(c))return;await wait(20)}throw Error('Timeout '+c)};
 const open=async system=>{await run(`[...document.querySelectorAll('.cap-skim-root-entry')].find(e=>e.title.includes('Desktop')===${system}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:260,clientY:200}))`);await ready('document.querySelector("[role=menu]")')};
 const click=label=>run(`[...document.querySelectorAll('[role=menuitem]')].find(e=>e.innerText===${JSON.stringify(label)}).click()`);
 await ready('document.querySelectorAll(".cap-skim-root-entry").length===2');await open(false);
 assert.deepEqual(await run('[...document.querySelectorAll("[role=menuitem]")].map(e=>e.innerText)'),['打开','在资源管理器中打开','复制路径','添加收藏','自动添加关键词','获取/刷新元数据']);
 assert.deepEqual(await run('[probe.metadata.length,probe.batches.length]'),[0,0],'opening a drive menu starts no extraction or AI work');
 await click('复制路径');await ready('probe.copies.length===1');assert.deepEqual(await run('probe.copies[0]'),['X:\\']);
 await open(false);await click('在资源管理器中打开');await ready('probe.opened.length===1');assert.equal(await run('probe.opened[0]'),'X:\\');
 await open(false);await click('打开');assert.equal(await run('probe.entered[0]'),'X:\\');
 await open(false);await click('添加收藏');await open(false);await ready('[...document.querySelectorAll("[role=menuitem]")].some(e=>e.innerText==="移除收藏")');await click('移除收藏');
 await open(false);await click('获取/刷新元数据');await ready('probe.metadata.length===1');assert.deepEqual(await run('probe.metadata[0]'),{path:'X:\\',allowMetadataExtraction:true});
 await open(false);await click('自动添加关键词');await ready('probe.batches.length===1');assert.equal(await run('probe.batches[0].driveLetter'),'X');assert.equal(await run('"path" in probe.batches[0]'),false);
 await open(true);await click('自动添加关键词');await ready('probe.batches.length===2');assert.equal(await run('probe.batches[1].locationId'),'desktop');
 await run('probe.hold=true');await open(false);await click('自动添加关键词');await ready('probe.batches.length===3');await open(false);
 assert.equal(await run('[...document.querySelectorAll("[role=menuitem]")].find(e=>e.innerText==="自动添加关键词").disabled'),true);assert.equal(await run('[...document.querySelectorAll("[role=menuitem]")].find(e=>e.innerText==="复制路径").disabled'),false,'busy AI keeps basic actions usable');
 await run('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));document.querySelector(".cap-catalog-activity-bar button").click()');await ready('probe.cancelled===1');
 await open(false);await run('probe.foreground(false)');await ready('!document.querySelector("[role=menu]")');
 console.log('Home context menu: drive/system roots, basic-first ordering, navigation, native open/copy, shared favorites, metadata, validated AI sources and busy isolation passed.');
 }catch(error){console.error(error);process.exitCode=1}finally{win?.destroy();fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}});
