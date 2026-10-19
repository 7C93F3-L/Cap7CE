const path=require('node:path'),fs=require('node:fs/promises'),vm=require('node:vm');
module.exports=async function buildExtractorManifest(root,output){
  const bundle=await require('esbuild').build({entryPoints:[path.join(root,'electron/metadataExtraction/metadataBuildSpecifications.ts')],
    bundle:true,platform:'node',format:'cjs',write:false,metafile:true,logLevel:'error'});
  if(Object.values(bundle.metafile.outputs).some(item=>item.imports.length))throw Error('Extractor manifest must have no runtime imports.');
  const module={exports:{}};
  // Evaluate only our pure, freshly bundled definitions, never source assets or installed user configuration.
  vm.runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports},{timeout:1000});
  const specifications=JSON.parse(JSON.stringify(module.exports.metadataBuildSpecifications));
  if(specifications.length!==9||new Set(specifications.map(item=>item.kind)).size!==9||specifications.some(item=>
    !Number.isSafeInteger(item.kind)||item.kind<0||item.kind>8||!Number.isSafeInteger(item.extractorVersion)||item.extractorVersion<1
    ||!Array.isArray(item.extensions)||item.extensions.length<1||item.extensions.length>64||item.extensions.some(value=>!/^\.[a-z0-9]{1,15}$/i.test(value))))
    throw Error('Invalid extractor manifest definitions.');
  const bytes=JSON.stringify({version:1,specifications})+'\n';
  if(Buffer.byteLength(bytes)>64*1024)throw Error('Extractor manifest exceeds its budget.');
  await fs.writeFile(path.join(output,'extractors.json'),bytes);return specifications;
};
