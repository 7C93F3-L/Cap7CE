const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const {app,BrowserWindow}=require('electron'),esbuild=require('esbuild'),repo=path.resolve(__dirname,'..');
const compiled=esbuild.buildSync({entryPoints:[path.join(repo,'src/renderer/computer-search/catalogGridLayout.ts')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const mod=new Module(__filename);mod._compile(compiled,__filename);const {catalogGridLayout}=mod.exports;
const close=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} differs from ${b}`);
function check(ratios,width,size=100){
 const layout=catalogGridLayout(ratios.length,width,false,true,i=>ratios[i],size),tiles=layout.visible(-300,layout.height+600);
 assert.equal(tiles.length,ratios.length);assert.deepEqual(tiles.map(x=>x.index),ratios.map((_,i)=>i));
 const rows=[];for(const tile of tiles){if(rows.at(-1)?.[0].top!==tile.top)rows.push([]);rows.at(-1).push(tile)}
 for(let r=0;r<rows.length;r++){
  const row=rows[r];close(row[0].left,0);
  if(r<rows.length-1)close(row.at(-1).left+row.at(-1).width,width);
  else {assert.ok(row.at(-1).left+row.at(-1).width<=width+.001);assert.ok(row[0].height<=200*size/100+28)}
  if(r)close(row[0].top,rows[r-1][0].top+rows[r-1][0].height+8);
  for(let i=0;i<row.length;i++){const tile=row[i];close(tile.height,row[0].height);assert.ok(tile.width>0&&tile.height>28);if(i)close(tile.left,row[i-1].left+row[i-1].width+8);
   const value=ratios[tile.index];close(tile.width/(tile.height-28),Number.isFinite(value)&&value>0?Math.max(.45,Math.min(2.4,value)):1)}
 }
 for(const start of [0,layout.height/3,layout.height-100]){
  const visible=layout.visible(start,350),intersect=tiles.filter(x=>x.top+x.height>=start&&x.top<=start+350);
  assert.ok(intersect.every(tile=>visible.some(x=>x.index===tile.index)),'variable-height virtual viewport misses no intersecting cards');
 }
 return {layout,rows};
}
const mixed=Array.from({length:100},(_,i)=>[.55,1.7,1,2.4,.8,1.2,.45][i%7]);
for(const size of [50,100,200])for(const width of [90,420,900,1200])check(mixed,width,size);
assert.ok(new Set(check(mixed,900).rows.map(row=>row[0].height.toFixed(2))).size>2,'rows adapt independently');
const last=check([1,1,1,1,1,1],1000).rows.at(-1);assert.equal(last.length,1);close(last[0].width,200);close(last[0].height,228);
check([NaN,Infinity,0,-1,.01,99],700);assert.equal(check([],800).layout.height,0);
const large=check(Array.from({length:50000},(_,i)=>mixed[i%mixed.length]),1000).layout;
assert.ok(large.visible(large.height/2,600).length<150,'large galleries retain bounded DOM geometry');
for(const size of [50,100,200]){
 const dense=catalogGridLayout(50000,1000,false,true,i=>mixed[i%mixed.length],size);
 assert.ok(dense.visible(dense.height/2,600).length<350,'size adjustment retains bounded virtual visibility');
 const horizontal=catalogGridLayout(100,900,true,true,()=>1,size,160);
 for(const tile of horizontal.visible(0,900))assert.ok(tile.height<=160&&tile.width===tile.height,'compact cards stay inside available height');
}
for(const size of [50,100,200]){const square=catalogGridLayout(100,950,false,false,()=>1,size);for(const tile of square.visible(0,600))close(tile.width,tile.height);}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-justified-'));app.setPath('userData',root+'-profile');
const fixture=String.raw`
import React,{useState,useRef,useLayoutEffect} from 'react';import {createRoot} from 'react-dom/client';
import CatalogVirtualGrid from './src/renderer/computer-search/CatalogVirtualGrid';import CatalogTile from './src/renderer/computer-search/CatalogTile';
import './src/renderer/results/ResultGrid.css';import './src/renderer/computer-search/ComputerSearchResultGrid.css';
const items=Array.from({length:23},(_,i)=>({id:String(i),ratio:[.55,1.7,1,2.4,.8,1.2,.45][i%7]}));
function Tile({item,style,onRatio}){useLayoutEffect(()=>onRatio(item.ratio),[item.ratio,onRatio]);return <CatalogTile style={style} data-index={item.id}>
 <span className="demo-image" style={{background:['#4483ab','#6d5197','#b26468','#558a77'][Number(item.id)%4]}}><svg viewBox={'0 0 '+item.ratio*100+' 100'}><rect x="1" y="1" width={item.ratio*100-2} height="98" fill="none" stroke="white"/><text x="8" y="52" fill="white" fontSize="15">{item.ratio}</text></svg></span>
 <span className="cap-catalog-thumbnail-name">Image {Number(item.id)+1}</span></CatalogTile>}
function Fixture(){const [width,setWidth]=useState(1000),[mode,setMode]=useState('gallery'),[size,setSize]=useState(100),ref=useRef(null);window.probe={width:setWidth,mode:setMode,size:setSize,ref};
 return <section id="viewport" ref={ref} style={{width,height:620,overflow:'auto',padding:10,boxSizing:'border-box'}}>
 <CatalogVirtualGrid items={items} mode={mode} size={size} rootRef={ref} renderItem={(item,style,onRatio)=><Tile key={item.id} item={item} style={style} onRatio={onRatio}/>}/></section>}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
app.whenReady().then(async()=>{
 let win;
 try{
  esbuild.buildSync({stdin:{contents:fixture,resolveDir:repo,loader:'tsx'},outfile:path.join(root,'fixture.js'),bundle:true,platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
  fs.writeFileSync(path.join(root,'index.html'),'<style>body{margin:0;background:#202534;color:#fff;--cap-stable-text:#eee;--cap-stable-surface:#222;--cap-stable-text-muted:#aaa;--panel-bg:#222}.demo-image{position:absolute;inset:0 0 28px}.demo-image svg{display:block;width:100%;height:100%}</style><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');
  win=new BrowserWindow({show:false,width:1100,height:740,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const run=code=>win.webContents.executeJavaScript(code).catch(error=>{console.error('Renderer action:',code);throw error}),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const ready=async code=>{for(let i=0;i<150;i++){if(await run(code))return;await wait(20)}throw Error('Timeout '+code)};
  const frame=()=>run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  const inspect=()=>run(`(()=>{const grid=document.querySelector('.is-virtual'),bounds=grid.getBoundingClientRect(),rows=[];for(const tile of grid.children){const r=tile.getBoundingClientRect(),top=Math.round(r.top*100)/100;if(rows.at(-1)?.top!==top)rows.push({top,tiles:[]});rows.at(-1).tiles.push({index:Number(tile.dataset.index),left:r.left-bounds.left,right:r.right-bounds.left,height:r.height})}return {width:bounds.width,rows}})()`);
  const checkDom=async()=>{const {width,rows}=await inspect();assert.ok(rows.length>0);for(const row of rows){close(row.tiles[0].left,0);for(const tile of row.tiles)close(tile.height,row.tiles[0].height);
   if(row.tiles.at(-1).index!==22)assert.ok(Math.abs(row.tiles.at(-1).right-width)<.05,'rendered complete row fills both edges')}
   return rows;};
  await win.loadFile(path.join(root,'index.html'));await ready("document.querySelectorAll('.thumb').length>8");await frame();await checkDom();
  await run('probe.width(820)');await frame();await checkDom();
  await run('probe.ref.current.scrollTop=probe.ref.current.scrollHeight');await ready("document.querySelector('[data-index=\"22\"]')");await frame();await checkDom();
  await run('probe.mode("square")');await frame();const square=await run("(()=>{const t=document.querySelector('.thumb').getBoundingClientRect();return [t.width,t.height]})()");close(square[0],square[1]);
  await run('probe.mode("gallery");probe.ref.current.scrollTop=0');await frame();await checkDom();
  await run('probe.size(50)');await frame();await checkDom();
  await run('probe.size(200)');await frame();await checkDom();
  await run('probe.ref.current.scrollTop=probe.ref.current.scrollHeight/2;probe.ref.current.dispatchEvent(new Event("scroll"))');await frame();
  await frame();
  const anchor=await run("(()=>{const r=document.getElementById('viewport').getBoundingClientRect();return [...document.querySelectorAll('.thumb')].find(x=>x.getBoundingClientRect().bottom>r.top).dataset.index})()");
  await run('probe.size(100)');await frame();await checkDom();
  assert.equal(await run(`(()=>{const r=document.getElementById('viewport').getBoundingClientRect();const e=document.querySelector('[data-index="${anchor}"]');return !!e&&e.getBoundingClientRect().bottom>r.top&&e.getBoundingClientRect().top<r.bottom})()`),true,'resize retains the previous visible item');
  console.log('Justified gallery: full rows, variable heights, original ratios, natural last row, resizing and 50k virtual visibility passed.');
 }catch(error){console.error(error.stack);process.exitCode=1}
 finally{win?.destroy();if(path.dirname(root)!==os.tmpdir())throw Error('Unsafe fixture root');fs.rmSync(root,{recursive:true,force:true});app.exit(process.exitCode??0)}
});
