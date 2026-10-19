const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const lifecycle=read('electron/core/coreVisualCacheClient.ts'),rpc=read('electron/core/coreNodeRpcSession.ts');
assert.ok(lifecycle.split(/\r?\n/).length<=70);assert.doesNotMatch(lifecycle,/VisualCacheFrameReader|private pending|private receive\(/);
for(const anchor of['new CoreNodeRpcSession','() => ++this.sequence','stopCoreVisualHost','await Promise.allSettled([...this.exits])','referenceCoreNodeProcess'])assert.ok(lifecycle.includes(anchor),anchor);
assert.ok(rpc.split(/\r?\n/).length<=65);assert.doesNotMatch(rpc,/\bspawn\(|node:(?:fs|net|https?)|from ["']electron["']|process\.env|CAP7CE_|Catalog|[Aa]rtifact|[Bb]rowserWindow|setInterval\(/);
for(const anchor of['this.pending.size >= 64','2 * maximumCacheFrameBytes','new VisualCacheFrameReader','id,result','error,id','referenceCoreNodeProcess'])assert.ok(rpc.includes(anchor),anchor);
console.log('Core Node RPC framing/budgets and owned process lifecycle have independent boundaries; legacy wire semantics preserved.');

const serverDirectory='core/node/transport';assert.deepEqual(fs.readdirSync(path.join(root,serverDirectory)).sort(),['server.ts']);
const server=read(serverDirectory+'/server.ts');assert.ok(server.split(/\r?\n/).length<=45);
assert.doesNotMatch(server,/node:(?:fs|net|http|https|child_process)|from ["']electron["']|\bspawn\(|Catalog|modelSettings|createVisualCache|setInterval\(|setTimeout\(/);
for(const anchor of ['pending.size >= 64','2 * maximumCacheFrameBytes','await owner.close()','await Promise.allSettled(pending); await output','slice(0, 1024)','serialMethods.includes'])assert.ok(server.includes(anchor));
const entry=read('core/node/visualCache/host.ts');assert.ok(entry.split(/\r?\n/).length<=10);assert.match(entry,/serveCoreNode/);assert.ok(entry.includes('["read", "write", "temporaryImage"]'));
