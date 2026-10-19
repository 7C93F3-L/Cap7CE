const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const directory='core/node/storedMetadata',limits={'reader.ts':60,'worker.ts':8,'dispatch.ts':30};
assert.deepEqual(fs.readdirSync(path.join(root,directory)).filter(name=>name.endsWith('.ts')).sort(),Object.keys(limits).sort());
for(const[file,limit]of Object.entries(limits)){const source=read(`${directory}/${file}`);assert.ok(source.split(/\r?\n/).length<=limit,file);assert.doesNotMatch(source,/from ["']electron["']|node:(?:net|https?|child_process)|fs\.(?:write|rename|rm|unlink)|INSERT INTO|UPDATE |DELETE FROM|CREATE TABLE|ALTER TABLE/,file);}
for(const[file,limit]of [['electron/core/coreStoredMetadataClient.ts',30],['electron/core/storedMetadataProjection.ts',20],['electron/catalogLegacyKeywords.ts',5],['electron/trashFailureMessage.ts',25],['src/shared/storedMetadataTypes.d.ts',12],['src/shared/deleteFilesTypes.d.ts',15]])assert.ok(read(file).split(/\r?\n/).length<=limit,file+' boundary size');
const reader=read(`${directory}/reader.ts`);for(const anchor of['readOnly: true','allowExtension: false','"index", "cap7ce-index.db"','LIMIT 64','ORDER BY evidence_kind LIMIT 13','trusted_schema=OFF'])assert.ok(reader.includes(anchor),anchor);
assert.doesNotMatch(read('electron/catalogLegacyKeywords.ts'),/node:(?:fs|sqlite)|sqliteImageIndex/);assert.doesNotMatch(read('electron/catalogFileDetailsReader.ts'),/sqliteImageIndex/);
assert.doesNotMatch(read('electron/core/coreStoredMetadataClient.ts'),/node:(?:fs|sqlite)|getImageDatabasePath/);assert.doesNotMatch(read('electron/main.ts'),/ensureImageDatabase/);
assert.doesNotMatch(read('electron/computerSearchTrashService.ts'),/fileOperationService|sqliteImageIndex/);
assert.ok(read('scripts/metadata-worker-build.cjs').includes('stored-metadata.cjs'));assert.ok(read('core/node/interactiveMetadata/owner.ts').includes('job.worker?.terminate()'));
console.log('Core read-only legacy index ownership, fixed database, bounded worker reuse, passive fallback and thin Shell boundaries passed.');
