const fs=require('node:fs'),path=require('node:path');
module.exports=(root,failures)=>{
 const files=new Map([
  ['core/src/Cap7CE.Core.Catalog/Keywords/CatalogKeywordSchema.cs',40],['core/src/Cap7CE.Core.Catalog/Keywords/CatalogKeywordModels.cs',12],
  ['core/src/Cap7CE.Core.Catalog/Keywords/CatalogKeywordStore.cs',140],['core/src/Cap7CE.Core.Catalog/Keywords/CatalogKeywordImport.cs',70],
  ['core/src/Cap7CE.Core.Host/Keywords/CatalogKeywordRequestHandler.cs',50]]);
 for(const [file,maximum] of files){const source=fs.readFileSync(path.join(root,file),'utf8');
  if(source.split(/\r?\n/).length>maximum)failures.push(`${file} exceeds its keyword domain limit.`);
  if(/System\.Net|HttpClient|DeviceIoControl|Process\.|File\.(?:Read|Write|Delete|Move)|Directory\.(?:Get|Enumerate|Delete)|Reader\.Host/.test(source))failures.push(`${file} bypasses the keyword database-only boundary.`);
 }
 const legacy=fs.readFileSync(path.join(root,'electron/catalogLegacyKeywords.ts'),'utf8');
 if(!legacy.includes('readOnly: true')||!legacy.includes('LIMIT 64')||/\.exec\(|\.run\(|INSERT INTO|UPDATE |DELETE FROM/.test(legacy))failures.push('Legacy keyword compatibility must remain bounded and read-only.');
 const schema=fs.readFileSync(path.join(root,'core/src/Cap7CE.Core.Catalog/Keywords/CatalogKeywordSchema.cs'),'utf8');
 if(/REFERENCES\s+catalog_nodes/i.test(schema))failures.push('User annotations must survive replacement of automatic Catalog nodes.');
 const ipc=fs.readFileSync(path.join(root,'electron/catalogKeywordsIpc.ts'),'utf8');
 if(ipc.includes('filePath:')||!ipc.includes('resolve(value), words, revision'))failures.push('Keyword writes must resolve current result authorization instead of trusting Renderer paths.');
 const autoFiles=new Map([
  ['electron/catalogAutoKeywordModel.ts',60],['electron/catalogAutoKeywordService.ts',65],['electron/catalogAutoKeywordSource.ts',18],
  ['electron/catalogAutoKeywordRuntime.ts',30],['electron/catalogAutoKeywordIpc.ts',60],['src/shared/catalogAutoKeywordTypes.d.ts',12],
  ['src/renderer/catalog-workspace/useCatalogAutoKeywords.ts',65],['src/renderer/catalog-workspace/CatalogActivity.tsx',36],
  ['src/renderer/catalog-workspace/CatalogActivity.css',6],['src/renderer/catalog-workspace/CatalogKeywords.tsx',40],
  ['src/renderer/catalog-workspace/CatalogKeywords.css',8],['src/renderer/catalog-workspace/catalogKeywordIdentity.ts',8],
  ['src/renderer/catalog-workspace/CatalogTransientFeedback.tsx',15],
  ['src/renderer/feedback/BottomNoticeBar.tsx',25],['src/renderer/feedback/BottomNoticeBar.css',12]]);
 for(const [file,limit] of [
  ['electron/catalogKeywordBatchTargets.ts',85],['electron/catalogKeywordBatchService.ts',40],['electron/catalogKeywordJobOwner.ts',30],
  ['src/shared/catalogKeywordBatchTypes.d.ts',15],['src/renderer/catalog-workspace/catalogBatchKeywordOperations.ts',45],
  ['src/renderer/catalog-workspace/useCatalogBatchKeywords.ts',60],['src/renderer/catalog-workspace/CatalogBatchKeywords.tsx',35],
  ['src/renderer/catalog-workspace/useCatalogKeywordEditRequest.ts',12],['src/renderer/catalog-workspace/catalogKeywordJobMessage.ts',15]]) autoFiles.set(file,limit);
 for(const [file,maximum] of autoFiles){const text=fs.readFileSync(path.join(root,file),'utf8');
  if(text.split(/\r?\n/).length>maximum)failures.push(`${file} exceeds its automatic keyword domain limit.`);
  if(file.startsWith('src/renderer/')&&/fetch\(|node:|ipcRenderer|llamaRuntime|visualRenderService/.test(text))failures.push(`${file} bypasses the automatic keyword bridge.`);
 }
 const runtime=fs.readFileSync(path.join(root,'electron/catalogAutoKeywordRuntime.ts'),'utf8');
 const notice=fs.readFileSync(path.join(root,'src/renderer/feedback/BottomNoticeBar.tsx'),'utf8');
 if(/\buse[A-Z]\w*|window\.|catalog-workspace|metadata-build/.test(notice))failures.push('The shared bottom notice must remain a pure presentation component.');
 for(const file of ['src/renderer/catalog-workspace/CatalogActivity.tsx','src/renderer/metadata-build/MetadataBuildSlot.tsx'])
  if(!fs.readFileSync(path.join(root,file),'utf8').includes('<BottomNoticeBar'))failures.push(`${file} must reuse the shared bottom notice.`);
 if(!runtime.includes('loadModelInputImage')||/ensureThumbnail|prepareAiSearchImage/.test(runtime))failures.push('Automatic keywords must reuse the existing model-input image preparation.');
 const service=fs.readFileSync(path.join(root,'electron/catalogAutoKeywordService.ts'),'utf8');
 for(const anchor of ['deps.keywords.read(check())','deps.keywords.write(check(), keywords, current.revision)','deps.fingerprint(check()) !== original','deps.endUse()'])
  if(!service.includes(anchor))failures.push(`Automatic keyword safety is missing ${anchor}.`);
 const targets=fs.readFileSync(path.join(root,'electron/catalogKeywordBatchTargets.ts'),'utf8');
 if(!targets.includes('runtime.favoriteDirectories?.list()')||!targets.includes('runtime.cancel(taskId)')||!targets.includes('targets.size > 100000')||/fs\.(readdir|opendir|writeFile|unlink|rm)\(/.test(targets))failures.push('Keyword batch scopes must remain Main-authorized, bounded Catalog queries without filesystem traversal or mutation.');
 const manual=fs.readFileSync(path.join(root,'src/renderer/catalog-workspace/catalogBatchKeywordOperations.ts'),'utf8');
 if(!manual.includes('applyKeywordBatchDelta')||!manual.includes('expectedRevision: current.revision'))failures.push('Manual batch editing must preserve per-file unique tags and revision checks.');
};
