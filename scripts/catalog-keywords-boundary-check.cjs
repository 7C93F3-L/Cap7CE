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
  ['src/renderer/catalog-workspace/useCatalogAutoKeywords.ts',65],['src/renderer/catalog-workspace/CatalogActivity.tsx',60],
  ['src/renderer/catalog-workspace/CatalogActivity.css',15],['src/renderer/catalog-workspace/CatalogKeywords.tsx',40],
  ['src/renderer/catalog-workspace/CatalogKeywords.css',8],['src/renderer/catalog-workspace/catalogKeywordIdentity.ts',8],
  ['src/renderer/catalog-workspace/CatalogTransientFeedback.tsx',15]]);
 for(const [file,maximum] of autoFiles){const text=fs.readFileSync(path.join(root,file),'utf8');
  if(text.split(/\r?\n/).length>maximum)failures.push(`${file} exceeds its automatic keyword domain limit.`);
  if(file.startsWith('src/renderer/')&&/fetch\(|node:|ipcRenderer|llamaRuntime|visualRenderService/.test(text))failures.push(`${file} bypasses the automatic keyword bridge.`);
 }
 const runtime=fs.readFileSync(path.join(root,'electron/catalogAutoKeywordRuntime.ts'),'utf8');
 if(!runtime.includes('loadModelInputImage')||/ensureThumbnail|prepareAiSearchImage/.test(runtime))failures.push('Automatic keywords must reuse the existing model-input image preparation.');
 const service=fs.readFileSync(path.join(root,'electron/catalogAutoKeywordService.ts'),'utf8');
 for(const anchor of ['deps.keywords.read(check())','deps.keywords.write(check(), keywords, current.revision)','deps.fingerprint(check()) !== original','deps.endUse()'])
  if(!service.includes(anchor))failures.push(`Automatic keyword safety is missing ${anchor}.`);
};
