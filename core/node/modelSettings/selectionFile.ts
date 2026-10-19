import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
const maximumBytes=1024*1024;
// Only the two existing application selection files. No source-file writes or directory traversal.
export function createModelSelectionFile(root:string,name:"llama-runtime.json"|"gguf-model.json") {
 const target=path.join(root,"config",name);
 return {
  async read():Promise<unknown>{
   const file=await fs.open(target,"r");try {
    if((await file.stat()).size>maximumBytes)throw new Error("core-model-settings-config-too-large");
    const bytes=Buffer.alloc(maximumBytes+1);let offset=0;
    while(offset<bytes.length){const {bytesRead}=await file.read(bytes,offset,bytes.length-offset,null);if(!bytesRead)break;offset+=bytesRead;}
    if(offset>maximumBytes)throw new Error("core-model-settings-config-too-large");return JSON.parse(bytes.subarray(0,offset).toString("utf8"));
   }finally{await file.close();}
  },
  async write(value:unknown):Promise<void>{
   const json=Buffer.from(JSON.stringify(value,null,2)+"\n");if(json.length>maximumBytes)throw new Error("core-model-settings-config-too-large");
   await fs.mkdir(path.dirname(target),{recursive:true});const stage=target+"."+randomUUID()+".tmp";let created=false;
   try{
    const file=await fs.open(stage,"wx");created=true;try{await file.writeFile(json);await file.sync();}finally{await file.close();}
    await fs.rename(stage,target);created=false;
   }finally{if(created)await fs.unlink(stage).catch(()=>{});}
  }
 };
}
