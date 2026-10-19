const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),dir='core/node/modelSettings';
const limits={'owner.ts':40,'runtime.ts':175,'models.ts':200,'pairing.ts':60,'selectionFile.ts':30};
assert.deepEqual(fs.readdirSync(path.join(root,dir)).sort(),Object.keys(limits).sort());
for(const [file,max]of Object.entries(limits)){
 const s=read(dir+'/'+file);assert.ok(s.split(/\r?\n/).length<=max,file+' responsibility');
 assert.doesNotMatch(s,/from ["'](?:electron|node:(?:net|http|https|child_process))["']|Sqlite|sqlite|Reader\.Host|setInterval\(|setTimeout\(/,file+' settings-only ownership');
}
assert.doesNotMatch(read(dir+'/pairing.ts'),/node:fs|fs\.|writeFile|readdir/);
for(const file of ['runtime.ts','models.ts']){
 const s=read(dir+'/'+file);assert.ok(s.includes('createModelSelectionFile(userDataRoot,'));
 assert.doesNotMatch(s,/unlink|copyFile|\.rm\(|\.rename\(|writeFile|fs\.readFile/);
}
for(const file of ['electron/llamaRuntimeStore.ts','electron/ggufModelStore.ts']){
 const s=read(file);assert.ok(s.split(/\r?\n/).length<=10);assert.match(s,/requestCoreModelSettings/);assert.doesNotMatch(s,/node:fs|readdir|JSON\.|writeFile|\.stat\(/);
}
const owner=read(dir+'/owner.ts');for(const a of ['serial.then','context.runtimeRoot!==next.runtimeRoot','setActiveLanguage(next.language)'])assert.ok(owner.includes(a));
assert.match(read('core/node/visualCache/dispatch.ts'),/modelSettings\.dispatch\(args\)/);

const io=read(dir+'/selectionFile.ts');for(const a of ['maximumBytes=1024*1024','fs.open(stage,"wx")','await file.sync()','if(created)','await fs.rename(stage,target)'])assert.ok(io.includes(a));

console.log('Core model discovery/pairing and bounded atomic selection files have independent ownership; Shell stores only forward actions.');
