const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),directory='core/node/visualRendering',read=file=>fs.readFileSync(path.join(root,file),'utf8');
const limits={'directPreview.ts':100,'owner.ts':55,'preparation.ts':85,'renderSource.ts':240,'resources.ts':15,'worker.ts':45,'workerSlot.ts':95};
assert.deepEqual(fs.readdirSync(path.join(root,directory)).filter(file=>file.endsWith('.ts')).sort(),Object.keys(limits).sort());
for(const[file,limit]of Object.entries(limits)){
 const text=read(`${directory}/${file}`);assert.ok(text.split(/\r?\n/).length<=limit,`${file} domain boundary`);
 assert.doesNotMatch(text,/from ["']electron["']|BrowserWindow|ipcRenderer|ipcMain|Sqlite|sqlite|Reader\.Host|node:(?:net|https?)|setInterval\(/,`${file} ordinary source-only domain`);
}
const renderer=read(`${directory}/renderSource.ts`);
for(const anchor of['sharp.concurrency(2)','memory: 64','files: 20','items: 100','maxWidth: 1536','jpegQuality: 90','maxWidth: 2560','withoutEnlargement: true','visualScratchDirectory()'])assert.ok(renderer.includes(anchor),anchor);
assert.doesNotMatch(renderer,/writeVisualCacheEntry|createVisualCacheEntry|visualCacheEpoch/);
const owner=read(`${directory}/preparation.ts`);for(const anchor of['this.store.writeVisualCacheEntry','this.track(this.ensurePath','Promise.allSettled([...this.operations])','type.endsWith("preview") ? 1200 : 300'])assert.ok(owner.includes(anchor),anchor);
const slot=read(`${directory}/workerSlot.ts`);for(const anchor of['--max-old-space-size=256','timeoutMs = 60000','idleMs = 5000','768 * 1024 * 1024','closeAndWait','CAP7CE_VISUAL_SCRATCH','cap7ce-visual-worker-','path.dirname(scratch) !== temporaryRoot'])assert.ok(slot.includes(anchor),anchor);
const shell=read('electron/visualRenderService.ts');assert.ok(shell.split(/\r?\n/).length<=40);assert.doesNotMatch(shell,/from ["']electron["']|node:fs|from ["']sharp|\.stat\(|new Worker|renderStrategies|pendingRenders/);
assert.doesNotMatch(read('electron/shellThumbnailProvider.ts'),/from ["']electron["']|nativeImage/);assert.ok(read('electron/shellThumbnailProvider.ts').includes('"ensureShell"'));
for(const file of['electron/computerSearchTrashService.ts','electron/fileOperationService.ts'])assert.ok(read(file).includes('await releaseVisualRenderFileHandles()'));
assert.ok(read('electron/favoriteDirectories/favoriteFolderRenameService.ts').includes('await (await import("../visualRenderService")).releaseVisualRenderFileHandles()'));
const builder=read('scripts/metadata-worker-build.cjs');assert.ok(builder.includes('psdArtboardRenderWorker.js'));assert.ok(builder.includes('visual-render.cjs'));
console.log('Core visual execution, sole cache publication, owned worker/temp lifecycle, standalone dynamic dependencies and reduced Shell boundary passed.');
