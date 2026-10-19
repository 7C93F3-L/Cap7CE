const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const directory='core/node/interactiveMetadata',limits={'owner.ts':60,'worker.ts':25};
assert.deepEqual(fs.readdirSync(path.join(root,directory)).filter(name=>name.endsWith('.ts')).sort(),Object.keys(limits).sort());
for(const[file,limit]of Object.entries(limits)){
 const source=read(`${directory}/${file}`);assert.ok(source.split(/\r?\n/).length<=limit,`${file} domain size`);
 assert.doesNotMatch(source,/from ["']electron["']|Sqlite|sqlite|Reader\.Host|writeVisualCache|setInterval\(|node:(?:net|https?)/,`${file} ordinary transient reader`);
}
const owner=read(`${directory}/owner.ts`);
for(const anchor of['timeoutMs = 8000','this.jobs.size >= 4','this.active < 2','maxOldGenerationSizeMb: 256','execArgv: []','stdout: true, stderr: true','job.worker?.terminate()','this.releasing'])assert.ok(owner.includes(anchor),anchor);
assert.doesNotMatch(read(`${directory}/worker.ts`),/fs\.(?:write|rm|unlink|rename|mkdir)|replaceEmbeddedMetadata/);
assert.ok(read(`${directory}/worker.ts`).includes('before.ino === after.ino'));assert.ok(read(`${directory}/worker.ts`).includes('before.mtimeNs === after.mtimeNs'));
const probe=read('electron/embeddedMetadataPreviewProbe.ts');assert.doesNotMatch(probe,/new Worker|from ["']node:worker_threads["']|from ["']\.\/embeddedMetadataExtractor["']/);
assert.ok(probe.includes('startCorePreviewMetadataRead(data.filePath, timeoutMs)'));
assert.doesNotMatch(read('electron/catalogFileDetailsReader.ts'),/from ["']\.\/visualSourceDimensions["']/);
assert.ok(read('scripts/metadata-worker-build.cjs').includes('preview-metadata.cjs'));
console.log('Core interactive metadata: bounded read-only worker ownership, no persistent publisher, shared contracts, cancelled/stale-source guards and thin Shell projection passed.');
