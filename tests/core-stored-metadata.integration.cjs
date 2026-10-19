const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const {readCoreStoredMetadata:read,readCoreStoredCounts:counts,readCoreLegacyKeywordPage:keywords}=require('../dist-electron/core/coreStoredMetadataClient.js');
const transportFor=require('./core-stored-index-transport.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-stored-index-')),transport=transportFor(root),missing=transportFor(path.join(root,'missing'));let db;
 const source={fileSize:12,modifiedAt:'2026-10-18T00:00:00Z'},file=path.join(root,'index','cap7ce-index.db'),empty={metadata:null,isCurrent:false};
 try{
  assert.deepEqual(await read('X:\\source.jpg',source,missing),empty);assert.deepEqual(await counts(['a'],missing),{a:0});assert.deepEqual(await keywords('',missing),{entries:[],after:null});
  await assert.rejects(fs.access(path.join(root,'missing')),'passive reads do not create user data');
  await fs.mkdir(path.dirname(file));db=new DatabaseSync(file);db.exec(`CREATE TABLE files(id INTEGER PRIMARY KEY,file_path TEXT,created_at TEXT);
CREATE TABLE file_embedded_metadata_state(file_id INTEGER,source_revision TEXT,extractor_version INTEGER,status TEXT,captured_at TEXT);
CREATE TABLE file_embedded_search_evidence(file_id INTEGER,evidence_kind TEXT,search_text TEXT);
CREATE TABLE images(directory_id TEXT,"exists" INTEGER);CREATE TABLE file_user_metadata(file_path TEXT,keywords TEXT);
INSERT INTO files VALUES(1,'X:\\source.jpg','2026-10-18T00:00:00Z'),(2,'X:\\empty.jpg','2026-10-18T00:00:00Z'),(3,'X:\\failed.jpg','2026-10-18T00:00:00Z');
INSERT INTO file_embedded_search_evidence VALUES(1,'software_family','photoshop'),(1,'embedded_title','title');
INSERT INTO images VALUES('a',1),('a',1),('a',0),('b',1);INSERT INTO file_user_metadata VALUES('X:\\source.jpg','手动, blue');`);
  const revision='v1:12:'+Date.parse(source.modifiedAt),put=db.prepare('INSERT INTO file_embedded_metadata_state VALUES(?,?,?,?,?)');
  put.run(1,revision,1,'indexed',null);put.run(2,revision,1,'empty',null);put.run(3,revision,1,'failed',null);db.close();db=undefined;
  const before=await fs.readFile(file),beforeStat=await fs.stat(file),digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
  assert.deepEqual(await read('x:\\SOURCE.jpg',source,transport),{isCurrent:true,metadata:{items:[{kind:'embedded_title',text:'title'},{kind:'software_family',text:'photoshop'}],capturedAt:null}});
  assert.deepEqual(await read('X:\\empty.jpg',source,transport),{metadata:null,isCurrent:true});assert.deepEqual(await read('X:\\failed.jpg',source,transport),{metadata:null,isCurrent:true});
  assert.deepEqual(await read('X:\\source.jpg',{...source,fileSize:13},transport),empty);assert.deepEqual(await counts(['a','b','none','__proto__'],transport),JSON.parse('{"a":2,"b":1,"none":0,"__proto__":0}'));
  assert.deepEqual((await keywords('',transport)).entries[0].keywords,['手动','blue']);
  assert.equal(digest(await fs.readFile(file)),digest(before));assert.equal((await fs.stat(file)).mtimeMs,beforeStat.mtimeMs);assert.deepEqual(await fs.readdir(path.dirname(file)),['cap7ce-index.db']);
  await assert.rejects(transport.request('storedMetadata',[crypto.randomUUID(),'X:\\source.jpg',source,file]),/invalid-request/);
  await assert.rejects(transport.request('storedCounts',[crypto.randomUUID(),Array(4097).fill('a')]),/invalid-request/);
  await assert.rejects(transport.request('legacyKeywordPage',[crypto.randomUUID(),'after',file]),/invalid-request/);
  db=new DatabaseSync(file);db.exec("DROP TABLE file_embedded_metadata_state; CREATE VIEW file_embedded_metadata_state AS SELECT 1 AS file_id;");db.close();db=undefined;
  assert.deepEqual(await read('X:\\source.jpg',source,transport),empty,'unexpected views cannot masquerade as the old schema');
  await fs.writeFile(file,'generated broken SQLite');const damaged=await fs.readFile(file);assert.deepEqual(await read('X:\\source.jpg',source,transport),empty);assert.deepEqual(await counts(['a'],transport),{a:0});await assert.rejects(keywords('',transport),/legacy-keywords-unavailable/);assert.deepEqual(await fs.readFile(file),damaged);
  console.log('Core stored index: real native Job/read-only SQLite, no missing-profile creation, current/empty/failed/stale semantics, evidence order, counts, keyword retry, schema rejection, fixed path, unchanged bytes/mtime and no journal creation passed.');
 }finally{db?.close();transport.close();missing.close();await sleep(150);assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-stored-index-'));await fs.rm(root,{recursive:true,force:true,maxRetries:3,retryDelay:50});}
})().catch(error=>{console.error(error);process.exitCode=1});
