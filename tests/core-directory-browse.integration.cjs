const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
const transportFor=require('./core-stored-index-transport.cjs');
const {CoreDirectoryBrowseClient}=require('../dist-electron/core/coreDirectoryBrowseClient.js');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-directory-browse-')),transport=transportFor(path.join(root,'profile'));
 const client=new CoreDirectoryBrowseClient(async()=>transport),options={sort:'name-ascending',excludeHidden:false};
 try{
  const source=path.join(root,'source'),outside=path.join(root,'outside');await fs.mkdir(path.join(source,'nested'),{recursive:true});await fs.mkdir(outside);
  await fs.writeFile(path.join(source,'nested','not-a-child.txt'),'nested');await fs.writeFile(path.join(outside,'outside.txt'),'external');
  await fs.symlink(outside,path.join(source,'linked'),'junction');
  await Promise.all(Array.from({length:107},(_,i)=>fs.writeFile(path.join(source,`item${i}.txt`),'test')));
  const target=path.join(source,'item0.txt'),before=await fs.stat(target,{bigint:true});
  let page=await client.start('browse',source,'volume',options),items=[...page.items];assert.equal(items[0].name,'nested');assert.equal(items.length,100);
  const used=page.nextCursor;page=await client.next('browse',used);items.push(...page.items);assert.equal(items.length,108);assert.equal(page.isComplete,true);
  assert.equal(new Set(items.map(item=>item.id)).size,108);assert.ok(items.every(item=>!['not-a-child.txt','outside.txt','linked'].includes(item.name)));
  const item=items.find(item=>item.name==='item0.txt');assert.equal(item.fileReference,before.ino.toString(16).padStart(16,'0').toUpperCase());
  const stamp=BigInt(Math.trunc(Number(before.mtimeMs)))*10000n+116444736000000000n;
  assert.ok(Math.abs(item.modifiedUtcTicks-Number(stamp))<=10016,'projection uses Windows FILETIME');
  await assert.rejects(client.next('browse',used),/invalid-cursor/);await client.cancel('browse');
  assert.equal((await client.start('empty',source,'volume',{...options,fileConditions:{extensions:[]}})).items.length,0);
  const filtered=await client.start('filter',source,'volume',{...options,fileConditions:{extensions:['.TXT'],minimumSizeBytes:4,maximumSizeBytes:4,minimumModifiedFileTime:(stamp-20000n).toString(),maximumModifiedFileTime:(stamp+20000n).toString()}});
  assert.ok(filtered.items.some(item=>item.name==='item0.txt'));assert.ok(filtered.items.every(item=>!item.isDirectory));
  await client.cancel('filter');
  const ids=Array.from({length:4},()=>randomUUID());await Promise.all(ids.map(id=>transport.request('directoryBrowse.start',[id,source,options])));
  const fifth=await transport.request('directoryBrowse.start',[randomUUID(),source,options]);assert.equal(fifth.entries.length,100,'completed snapshots retire to admit another directory');
  await assert.rejects(transport.request('directoryBrowse.next',[ids[0],used]),/invalid-request/);
  await transport.request('releaseSourceHandles',[]);for(const id of ids)await assert.rejects(transport.request('directoryBrowse.next',[id,used]),/invalid-request/);
  await assert.rejects(transport.request('directoryBrowse.start',['-'.repeat(36),source,options]),/invalid-request/);
  await assert.rejects(transport.request('directoryBrowse.start',[randomUUID(),'\\\\server\\share',options]),/invalid-request/);
  assert.equal((await fs.stat(target,{bigint:true})).mtimeNs,before.mtimeNs);await assert.rejects(fs.access(path.join(root,'profile')));
  let connected,cancelled=0;const delayed=new CoreDirectoryBrowseClient(()=>new Promise(resolve=>connected=resolve));
  const work=delayed.start('late',source,'volume',options);await delayed.cancel('late');connected({request:async()=>{throw Error('must not read')},cancel:async()=>{cancelled++;return null}});
  await assert.rejects(work,/search-cancelled/);assert.equal(cancelled,0);
  const unsafe=new CoreDirectoryBrowseClient(async()=>({request:async()=>({entries:[{kind:'file',path:path.join(outside,'outside.txt'),name:'outside.txt',extension:'.txt',size:8,modifiedAt:null}],nextCursor:null,isComplete:true}),cancel:async()=>null}));
  await assert.rejects(unsafe.start('unsafe',source,'volume',options),/invalid-response/);
  console.log('Directory browsing: real Core Job/RPC, direct children, link exclusion, paging/cursors, FILETIME, filters, quota, release, cancellation, response path validation and unchanged sources passed.');
 }finally{await client.close();transport.close();await new Promise(resolve=>setTimeout(resolve,150));assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-directory-browse-'));await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:50});}
})().catch(error=>{console.error(error);process.exitCode=1});
