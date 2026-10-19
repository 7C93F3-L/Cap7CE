const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
for(const [file,limit] of Object.entries({'core/node/directoryBrowse/owner.ts':55,'core/node/directoryBrowse/policy.ts':30,'electron/core/coreDirectoryBrowseClient.ts':55,'src/renderer/feedback/GradientProgress.tsx':15,'core/src/Cap7CE.Core.Host/CatalogPreparationProgressOwner.cs':32})){
 const source=read(file);assert.ok(source.split(/\r?\n/).length<=limit,`${file} boundary size`);
 assert.doesNotMatch(source,/setInterval\(|Sqlite|sqlite|Reader\.Host|from ['"]electron['"]/);
}
const client=read('electron/core/coreDirectoryBrowseClient.ts');assert.doesNotMatch(client,/node:fs|readdir|lstat|readFile|child_process/);
const owner=read('core/node/directoryBrowse/owner.ts');for(const text of ['readSkimLocation','65536','32 * 1024 * 1024','jobs.size >= 4','job.cancelled','Promise.allSettled'])assert.ok(owner.includes(text),text);
assert.ok(read('core/node/visualCache/dispatch.ts').includes('browse.release()'));
assert.ok(read('core/node/visualCache/dispatch.ts').includes('browse.close()'));
assert.doesNotMatch(read('electron/skimBrowseService.ts'),/from ['"]\.\/skimPreviewService['"]/);
assert.ok(read('src/renderer/feedback/GradientProgress.css').includes('var(--accent-color'));
console.log('Bounded Core directory owner, thin Shell projection and shared gradient progress boundaries passed.');
