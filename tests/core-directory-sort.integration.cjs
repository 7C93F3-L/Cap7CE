const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
const transportFor=profile=>require('./support/native-session.cjs')(path.resolve('artifacts/metadata-worker/v1'),'visual-cache.cjs',profile);
(async()=>{
 const temporary=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(temporary,'cap7ce-directory-sort-')),source=path.join(root,'source');
 const transport=transportFor(path.join(root,'profile')),files=[];
 const names=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
 try{
  await fs.mkdir(path.join(source,'folder10'),{recursive:true});await fs.mkdir(path.join(source,'folder2'),{recursive:true});
  // Interleave names and timestamps across directories and more than two pages.
  for(let i=0;i<225;i++){
   const dir=i%3===0?source:path.join(source,i%3===1?'folder10':'folder2');
   const name=`file${225-i}.txt`,file=path.join(dir,name),stamp=Date.UTC(2024,0,1)+(i%53)*86400000;
   await fs.writeFile(file,'sort fixture');await fs.utimes(file,stamp/1000,stamp/1000);
   files.push({path:file,name,modifiedAt:new Date(stamp).toISOString(),kind:'file'});
  }
  for(const folder of ['folder2','folder10']){
   const file=path.join(source,folder,'same.txt');await fs.writeFile(file,'same name');
   await fs.utimes(file,1704067200,1704067200);files.push({path:file,name:'same.txt',modifiedAt:'2024-01-01T00:00:00.000Z',kind:'file'});
  }
  const before=await Promise.all(files.map(f=>fs.stat(f.path,{bigint:true})));
  for(const folder of ['folder2','folder10'])await fs.utimes(path.join(source,folder),1704067200,1704067200);
  function compare(sort){const direction=sort.endsWith('descending')?-1:1;return(a,b)=>
   Number(b.kind==='folder')-Number(a.kind==='folder')
   ||(sort.startsWith('modified')?direction*(Date.parse(a.modifiedAt)-Date.parse(b.modifiedAt))||names.compare(a.name,b.name):direction*names.compare(a.name,b.name))
   ||a.path.localeCompare(b.path);}
  const folders=await Promise.all(['folder2','folder10'].map(async name=>({path:path.join(source,name),name,kind:'folder',modifiedAt:(await fs.stat(path.join(source,name))).mtime.toISOString()})));
  for(const recursive of [false,true])for(const sort of ['name-ascending','name-descending','modified-ascending','modified-descending']){
   const id=randomUUID();let page=await transport.request('directoryBrowse.start',[id,source,{sort,excludeHidden:false,includeSubfolders:recursive}]),actual=[...page.entries];
   let pages=1;while(page.nextCursor){page=await transport.request('directoryBrowse.next',[id,page.nextCursor]);actual.push(...page.entries);pages++;}
   const expected=recursive?[...files]:[...folders,...files.filter(f=>path.dirname(f.path)===source)];
   expected.sort(compare(sort));assert.deepEqual(actual.map(x=>x.path),expected.map(x=>x.path),`${sort}, recursive=${recursive}: one global order across pages`);
   assert.equal(new Set(actual.map(x=>x.path)).size,expected.length,'no duplicates or omissions');
   if(recursive)assert.equal(pages,3,'global order survives multiple page boundaries');
   if(!recursive)assert.ok(actual.slice(0,2).every(x=>x.kind==='folder'),'folders remain first in both directions');
  }
  const id=randomUUID(),starting=transport.request('directoryBrowse.start',[id,source,{sort:'modified-descending',excludeHidden:false,includeSubfolders:true}]);
  const cancelled=transport.request('directoryBrowse.cancel',[id]);
  const outcomes=await Promise.allSettled([starting,cancelled]);assert.equal(outcomes[1].status,'fulfilled');
  assert.equal(outcomes[0].status,'rejected','cancel interrupts recursive collection before first page');
  for(let i=0;i<files.length;i++)assert.equal((await fs.stat(files[i].path,{bigint:true})).mtimeNs,before[i].mtimeNs,'sorting never changes source modification times');
  console.log('All four directory sorts passed: natural names, timestamps/ties, folders first, global recursive pages, duplicate names, cancellation and unchanged sources.');
 }finally{
  await transport.close();
  assert.equal(path.dirname(root),temporary);assert.ok(path.basename(root).startsWith('cap7ce-directory-sort-'));
  await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:50});
 }
})().catch(error=>{console.error(error);process.exitCode=1});
