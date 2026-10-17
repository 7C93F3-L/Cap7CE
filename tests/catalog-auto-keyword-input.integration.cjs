const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),sharp=require('sharp');
const {app,BrowserWindow,ipcMain}=require('electron');
const root=path.join(os.tmpdir(),'Cap7CE-auto-input-'+process.pid+'-'+Date.now());app.setPath('userData',path.join(root,'profile'));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{let win,server;try{
 await fs.mkdir(root,{recursive:true});const source=path.join(root,'synthetic.png');
 await sharp({create:{width:3000,height:2000,channels:4,background:{r:40,g:120,b:220,alpha:.5}}}).png().toFile(source);
 const {loadModelInputImage,releaseVisualRenderFileHandles}=require('../dist-electron/visualRenderService.js');
 const {fingerprintKeywordSource}=require('../dist-electron/catalogAutoKeywordSource.js');
 const {createCatalogAutoKeywordService}=require('../dist-electron/catalogAutoKeywordService.js');
 const {generateImageKeywords}=require('../dist-electron/catalogAutoKeywordModel.js');
 const {registerCatalogAutoKeywordIpc}=require('../dist-electron/catalogAutoKeywordIpc.js');
 const before=await fs.readFile(source),prepared=await loadModelInputImage(source),metadata=await sharp(prepared.buffer).metadata();
 assert.equal(metadata.width,1536);assert.equal(metadata.height,1024);assert.equal(metadata.format,'jpeg');assert.ok(prepared.imagePath.endsWith('.capmo'));
 assert.ok(prepared.imagePath.includes('model-inputs'));const cached=await fs.stat(prepared.imagePath);
 assert.equal((await loadModelInputImage(source)).imagePath,prepared.imagePath);assert.equal((await fs.stat(prepared.imagePath)).mtimeMs,cached.mtimeMs,'second request reuses the same model input');
 const small=path.join(root,'small.png');await sharp({create:{width:100,height:60,channels:3,background:'white'}}).png().toFile(small);
 assert.equal((await sharp((await loadModelInputImage(small)).buffer).metadata()).width,100,'small sources are not enlarged');
 let received=0;server=http.createServer(async(req,res)=>{try{
  let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text),url=body.messages[0].content[0].image_url.url;
  const image=await sharp(Buffer.from(url.split(',')[1],'base64')).metadata();assert.equal(image.width,1536);assert.equal(image.height,1024);received++;
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'["合成素材","蓝色"]'}}]}));
 }catch(error){res.statusCode=500;res.end(String(error))}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const sourceStat=await fs.stat(source,{bigint:true});const item={path:source,name:'synthetic.png',extension:'.png',isDirectory:false,
  createdFileTimeMilliseconds:String(sourceStat.birthtimeNs/1000000n+11644473600000n)};
 let words=['手动保留'],revision=1;const keywords={prepare:async()=>{},read:async()=>({keywords:[...words],revision:String(revision)}),
  write:async(_item,values,expected)=>{assert.equal(expected,String(revision));words=values;revision++;return {saved:true,current:{keywords:[...words],revision:String(revision)}}}};
 const service=createCatalogAutoKeywordService({keywords,fingerprint:fingerprintKeywordSource,beginUse:async()=>{},endUse:()=>{},prepareImage:async p=>{
  const image=await loadModelInputImage(p);return `data:${image.mimeType};base64,${image.buffer.toString('base64')}`},recognize:async(image,signal,starting,generating)=>{
  starting();generating();return generateImageKeywords({baseUrl:`http://127.0.0.1:${server.address().port}`,modelName:'synthetic'},image,signal)}});
 let owner;registerCatalogAutoKeywordIpc({registrar:ipcMain,isSenderAllowed:event=>event.sender===owner,
  resolveItem:r=>{if(r.taskId!=='task'||r.authorizationId!=='granted')throw Error('authorization-expired');return item},keywords,createService:async()=>service});
 win=new BrowserWindow({show:false,webPreferences:{preload:path.resolve(__dirname,'../dist-electron/preload.js'),sandbox:true,contextIsolation:true,nodeIntegration:false}});owner=win.webContents;
 await win.loadURL('data:text/html,<meta charset="utf-8"><p>Synthetic local model input fixture</p>');
 const result=await owner.executeJavaScript(`(async()=>{const phases=[];const off=window.cap7ce.computerSearch.onAutoKeywordProgress(p=>phases.push(p.phase));
 const result=await window.cap7ce.computerSearch.generateKeywords({taskId:'task',authorizationId:'granted',requestId:'input-test',filePath:'C:\\forged.png'});off();return {result,phases,node:typeof require}})()`);
 assert.equal(result.node,'undefined');assert.equal(result.result.status,'saved');assert.equal(result.result.added,2);
 assert.deepEqual(result.phases,['preparing','starting','generating','saving']);assert.deepEqual(words,['手动保留','合成素材','蓝色']);assert.equal(received,1);
 assert.deepEqual(await fs.readFile(source),before,'the original file is unchanged');
 await releaseVisualRenderFileHandles();console.log('Automatic keyword input: real isolated preload/IPC, 1536px JPEG cache reuse, no upscaling, local model request and append/save passed.');
}catch(error){console.error(error);process.exitCode=1}finally{win?.destroy();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}app.exit(process.exitCode??0)}});
