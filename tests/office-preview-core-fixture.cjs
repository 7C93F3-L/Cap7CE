const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
module.exports=tempRoot=>{
 const output=path.join(tempRoot,'office-core-fixture.cjs');
 esbuild.buildSync({stdin:{contents:'import{createOfficePreviewCache}from"./core/node/officePreview/cache";import{createOfficePreviewService}from"./core/node/officePreview/sessions";export const make=root=>createOfficePreviewService(createOfficePreviewCache(root));',resolveDir:path.resolve(__dirname,'..'),loader:'ts'},outfile:output,bundle:true,platform:'node',format:'cjs',logLevel:'error'});
 if(!fs.existsSync(output))throw Error('Core Office fixture missing');return require(output).make(tempRoot);
};
