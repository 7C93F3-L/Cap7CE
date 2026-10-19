const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {getFileMatchers,copyFiles}=require('app-builder-lib/out/fileMatcher');
const {compareMetadataRuntimeFiles}=require('../scripts/metadata-runtime-packaged-check.cjs');
const configuration=require('../package.json').build;
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'cap7ce-runtime-packaging-'));
 try{
  const source=path.join(root,'artifacts/metadata-worker/v1'),output=path.join(root,'package/resources'),target=path.join(output,'metadata-worker/v1');
  await fs.mkdir(path.join(source,'node_modules/fixture/lib'),{recursive:true});
  await fs.writeFile(path.join(source,'node.exe'),'generated binary fixture');await fs.writeFile(path.join(source,'worker.cjs'),'// generated fixture');
  await fs.writeFile(path.join(source,'node_modules/fixture/package.json'),'{}');await fs.writeFile(path.join(source,'node_modules/fixture/lib/native.node'),'generated native fixture');
  const resources=configuration.extraResources.filter(entry=>entry.from.startsWith('artifacts/metadata-worker/v1'));
  assert.ok(resources.some(entry=>entry.from==='artifacts/metadata-worker/v1/node_modules'&&entry.to==='metadata-worker/v1/node_modules'),'nested dependencies require their own copy root');
  const matchers=getFileMatchers({extraResources:resources},'extraResources',output,{defaultSrc:root,globalOutDir:path.join(root,'package'),customBuildOptions:{},macroExpander:value=>value});
  await copyFiles(matchers);assert.equal(compareMetadataRuntimeFiles(source,target).files,4,'real electron-builder copy retains independent dependencies');
  await fs.rm(path.join(target,'node_modules/fixture/lib/native.node'));assert.throws(()=>compareMetadataRuntimeFiles(source,target),/missing/);
  await fs.copyFile(path.join(source,'node_modules/fixture/lib/native.node'),path.join(target,'node_modules/fixture/lib/native.node'));await fs.appendFile(path.join(target,'worker.cjs'),'changed');assert.throws(()=>compareMetadataRuntimeFiles(source,target),/bytes differ/);
  assert.throws(()=>compareMetadataRuntimeFiles(source,source),/independently copied/);
  console.log('Metadata packaging: actual electron-builder matcher/copy retains nested node_modules; missing/modified resources and validating the source as its own package are rejected.');
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('cap7ce-runtime-packaging-'));await fs.rm(root,{recursive:true,force:true})}
})().catch(error=>{console.error(error);process.exitCode=1});
