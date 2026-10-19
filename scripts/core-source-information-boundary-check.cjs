const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const limits={'inspection.ts':40,'folderStats.ts':90,'owner.ts':60},directory='core/node/sourceInformation';
assert.deepEqual(fs.readdirSync(path.join(root,directory)).filter(name=>name.endsWith('.ts')).sort(),Object.keys(limits).sort());
for(const[file,limit]of Object.entries(limits)){const source=read(`${directory}/${file}`);assert.ok(source.split(/\r?\n/).length<=limit,file);assert.doesNotMatch(source,/from ["']electron["']|node:(?:net|https?|child_process)|fs\.(?:write|rename|rm|unlink|readFile|open)|setInterval|setTimeout/,file);}
for(const[file,limit]of [['electron/skimPreviewService.ts',10],['electron/core/coreSourceInformationClient.ts',45],['electron/sourcePathPolicy.ts',20],['src/shared/sourceInformationTypes.d.ts',25]])assert.ok(read(file).split(/\r?\n/).length<=limit,file);
for(const file of ['electron/skimPreviewService.ts','electron/core/coreSourceInformationClient.ts'])assert.doesNotMatch(read(file),/node:fs|fs\.|setInterval|setTimeout|child_process/);
const owner=read(`${directory}/owner.ts`);for(const anchor of ['jobs.size >= 4','inspections.size >= 8','job.waiters.size >= 2','await job.work','sourceInfo.watch'])assert.ok(owner.includes(anchor),anchor);
assert.ok(read('core/node/visualCache/dispatch.ts').includes('sourceInfo.release()'));assert.ok(read('electron/main.ts').includes('void task.collect('));
assert.doesNotMatch(read('src/shared/types.ts'),/export interface Skim(?:PreviewInfo|FolderStats) \{/);assert.ok(read('src/shared/types.ts').includes('from "./sourceInformationTypes"'));
console.log('Core metadata-only source inspection/statistics, bounded jobs, passive progress, release barrier and thin Shell boundaries passed.');
