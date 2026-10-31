const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
for(const [file,limit] of Object.entries({'core/node/directoryBrowse/owner.ts':60,'core/node/directoryBrowse/recursive.ts':68,'core/node/directoryBrowse/policy.ts':30,'electron/core/coreDirectoryBrowseClient.ts':55,'src/renderer/feedback/GradientProgress.tsx':15,'core/src/Cap7CE.Core.Host/CatalogPreparationProgressOwner.cs':32})){
 const source=read(file);assert.ok(source.trimEnd().split(/\r?\n/).length<=limit,`${file} boundary size`);
 assert.doesNotMatch(source,/setInterval\(|Sqlite|sqlite|Reader\.Host|from ['"]electron['"]/);
}
const recursive=read('core/node/directoryBrowse/recursive.ts');for(const anchor of ['examined > 65536','16 * 1024 * 1024','32 * 1024 * 1024','directory-browse-invalid-descendant','this.checkCancelled()'])assert.ok(recursive.includes(anchor),anchor);
const client=read('electron/core/coreDirectoryBrowseClient.ts');assert.doesNotMatch(client,/node:fs|readdir|lstat|readFile|child_process/);
const owner=read('core/node/directoryBrowse/owner.ts');for(const text of ['readSkimLocation','65536','32 * 1024 * 1024','jobs.size >= 4','job.cancelled','Promise.allSettled'])assert.ok(owner.includes(text),text);
assert.ok(read('core/node/visualCache/dispatch.ts').includes('browse.release()'));
assert.ok(read('core/node/visualCache/dispatch.ts').includes('browse.close()'));
assert.doesNotMatch(read('core/node/directoryBrowse/source/skimBrowseService.ts'),/from ['"]\.\/skimPreviewService['"]/);
assert.ok(read('src/renderer/feedback/GradientProgress.css').includes('var(--accent-color'));
console.log('Bounded Core directory owner, thin Shell projection and shared gradient progress boundaries passed.');
