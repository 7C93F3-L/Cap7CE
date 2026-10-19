const path=require('node:path');
const {CoreVisualCacheClient}=require('../dist-electron/core/coreVisualCacheClient.js');
module.exports=root=>{
 const repository=path.resolve(__dirname,'..'),runtime=path.join(repository,'artifacts/metadata-worker/v1');
 const client=new CoreVisualCacheClient(root,path.join(runtime,'node.exe'),path.join(runtime,'visual-cache.cjs'),path.join(repository,'native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe'));
 return{request:client.request.bind(client),cancel:client.requestIfActive.bind(client),close:()=>client.close()};
};
