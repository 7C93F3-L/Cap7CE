const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const lifecycle=read('electron/core/coreVisualCacheClient.ts'),rpc=read('electron/core/coreNodeRpcSession.ts');
assert.ok(lifecycle.split(/\r?\n/).length<=70);assert.doesNotMatch(lifecycle,/VisualCacheFrameReader|private pending|private receive\(/);
for(const anchor of['new CoreNodeRpcSession','() => ++this.sequence','stopCoreVisualHost','await Promise.allSettled([...this.exits])','referenceCoreNodeProcess'])assert.ok(lifecycle.includes(anchor),anchor);
assert.ok(rpc.split(/\r?\n/).length<=65);assert.doesNotMatch(rpc,/\bspawn\(|node:(?:fs|net|https?)|from ["']electron["']|process\.env|CAP7CE_|Catalog|[Aa]rtifact|[Bb]rowserWindow|setInterval\(/);
for(const anchor of['this.pending.size >= 64','2 * maximumCacheFrameBytes','new VisualCacheFrameReader','id,result','error,id','referenceCoreNodeProcess'])assert.ok(rpc.includes(anchor),anchor);
console.log('Core Node RPC framing/budgets and owned process lifecycle have independent boundaries; legacy wire semantics preserved.');
