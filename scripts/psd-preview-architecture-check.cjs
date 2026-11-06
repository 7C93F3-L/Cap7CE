const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const base='core/node/providerPreview/psd/';
for(const name of ['cursor','layout','source','worker','service']) {
 const source=read(base+name+'.ts');assert(!/Sqlite|CatalogDatabase|visualCache|writeFile|createWriteStream/.test(source),`${name}: preview cannot mutate Catalog, source files or thumbnail cache`);
}
assert(read(base+'source.ts').includes('fs.open(file, "r")')&&read(base+'source.ts').includes('finally { await handle.close(); }'),'bounded source owner closes its read handle');
assert(read(base+'worker.ts').includes('assertPsdSource(file, stamp)')&&read(base+'worker.ts').includes('source.input = Buffer.alloc(0)'),'page rendering must fence changes and release compressed source memory');
assert(read(base+'service.ts').includes('createPreviewWorker')&&read(base+'service.ts').includes('await session.worker.terminate()'),'provider lifecycle owns its registered worker');
const view=read('shell/Cap7CE.WinUI/Controls/PsdPreviewView.cs');
assert(view.trimEnd().split(/\r?\n/).length<=100&&!/readPsd|Catalog|File\.Read/.test(view),'native view owns only paging and presentation');
assert(view.includes('token.Register(')&&view.includes('Unloaded+=')&&view.includes('psd.close'),'view cancellation/unload releases its session');
assert(read('scripts/metadata-worker-build.cjs').includes('"psd-preview.js"'),'standalone runtime must include the page worker');
console.log('PSD preview bounded reader, isolated rendering, immutable source and session lifetime boundaries passed.');
