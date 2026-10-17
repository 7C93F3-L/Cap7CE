const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const {readLegacyKeywordPage}=require('../dist-electron/catalogLegacyKeywords.js');
const {createCatalogKeywordsRuntime}=require('../dist-electron/catalogKeywordsRuntime.js');
const {registerCatalogKeywordsIpc}=require('../dist-electron/catalogKeywordsIpc.js');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'Cap7CE-keywords-'));
 try{
  const file=path.join(root,'legacy.db'),db=new DatabaseSync(file);
  db.exec('CREATE TABLE files(file_path TEXT PRIMARY KEY,created_at TEXT);CREATE TABLE file_user_metadata(file_path TEXT PRIMARY KEY,keywords TEXT);');
  const putFile=db.prepare('INSERT INTO files VALUES(?,?)'),putTags=db.prepare('INSERT INTO file_user_metadata VALUES(?,?)');
  for(let i=0;i<65;i++){const p=`X:\\${String(i).padStart(3,'0')}.png`;putFile.run(p,'2026-10-17T00:00:00Z');putTags.run(p,' 天空，blue,blue ')}db.close();
  const before=fs.readFileSync(file),page=await readLegacyKeywordPage('',file);assert.equal(page.entries.length,64);assert.ok(page.after);
  const last=await readLegacyKeywordPage(page.after,file);assert.equal(last.entries.length,1);assert.equal(last.after,null);
  assert.deepEqual(last.entries[0].keywords,['天空','blue']);assert.deepEqual(fs.readFileSync(file),before,'legacy compatibility is read-only');
  assert.deepEqual(await readLegacyKeywordPage('',path.join(root,'absent.db')),{entries:[],after:null});
  let processId=1,active=true,fail=false,legacyReads=0;const calls=[];
  const runtime=createCatalogKeywordsRuntime({start:async()=>{},supports:()=>true,processId:()=>processId,active:()=>active,
   legacyPage:async after=>{legacyReads++;if(fail)throw Error('temporary');return readLegacyKeywordPage(after,file)},
   request:async(operation,body)=>{calls.push([operation,body]);if(operation==='keywords.read')return {keywords:['天空'],revision:'2'};
    if(operation==='keywords.write')return {saved:true,current:{keywords:body.keywords,revision:'3'}};return {imported:body.entries.length,catalogRevision:1}}});
  await Promise.all([runtime.prepare('a'),runtime.prepare('a')]);assert.equal(legacyReads,2,'concurrent initialization shares bounded legacy pages');
  await runtime.prepare('a');assert.equal(legacyReads,2);
  const item={volumeId:'a',fileReference:'0000000000000010',createdUtcTicks:10000};
  assert.deepEqual(await runtime.read(item),{keywords:['天空'],revision:'2'});
  await runtime.write(item,[' blue ','blue'],'2');assert.deepEqual(calls.at(-1)[1].keywords,['blue']);
  assert.deepEqual(calls.at(-1)[1].identity,{volumeId:'a',fileReference:'0000000000000010',createdFileTimeMilliseconds:'1'});
  await runtime.read({...item,createdUtcTicks:Number(133000000000009999n),createdFileTimeMilliseconds:'13300000000000'});
  assert.equal(calls.at(-1)[1].identity.createdFileTimeMilliseconds,'13300000000000','identity uses the exact Core timestamp instead of rounded JavaScript FILETIME');
  processId=2;fail=true;await assert.rejects(runtime.prepare('a'));fail=false;await runtime.prepare('a');assert.equal(legacyReads,5,'a failed import can be explicitly retried after restart');
  active=false;await assert.rejects(runtime.prepare('b'),/unavailable/);active=true;
  const handlers=new Map();let authorized=true,prepare=async()=>{},writes=0;
  registerCatalogKeywordsIpc({registrar:{handle:(name,fn)=>handlers.set(name,fn),on:()=>{}},isSenderAllowed:event=>event.allowed,
   resolveItem:request=>{if(!authorized||request.taskId!=='task'||request.authorizationId!=='id')throw Error('expired');return {...item,path:'X:\\real.png',isDirectory:false}},
   keywords:{prepare:()=>prepare(),read:async resolved=>{assert.equal(resolved.path,'X:\\real.png');return {keywords:['existing'],revision:'1'}},write:async resolved=>{writes++;assert.equal(resolved.path,'X:\\real.png');return {saved:true,current:{keywords:[],revision:'2'}}}}});
  const request={taskId:'task',authorizationId:'id',filePath:'C:\\forged.png'};
  await assert.rejects(()=>handlers.get('computerSearch:readKeywords')({allowed:false},request),/not allowed/);
  await assert.rejects(()=>handlers.get('computerSearch:saveKeywords')({allowed:true},{...request,authorizationId:'forged',keywords:[],expectedRevision:null}),/expired/);
  assert.deepEqual(await handlers.get('computerSearch:readKeywords')({allowed:true},request),{keywords:['existing'],revision:'1'});
  for(const keywords of ['bad',Array(129).fill('word'),['x'.repeat(257)],['a\0b']])await assert.rejects(()=>handlers.get('computerSearch:saveKeywords')({allowed:true},{...request,keywords,expectedRevision:null}),/invalid-request/);
  await handlers.get('computerSearch:saveKeywords')({allowed:true},{...request,keywords:[],expectedRevision:'1'});assert.equal(writes,1);
  prepare=async()=>{authorized=false};await assert.rejects(()=>handlers.get('computerSearch:saveKeywords')({allowed:true},{...request,keywords:[],expectedRevision:'2'}),/expired/);assert.equal(writes,1,'retired authorization cannot write after initialization');
  console.log('Catalog keywords: read-only legacy paging, serialized initialization/retry, stable identities, normalization and authorized IPC passed.');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{if(process.versions.electron)require('electron').app.exit(process.exitCode??0)});
