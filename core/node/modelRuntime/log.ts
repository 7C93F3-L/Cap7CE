import fs from "node:fs/promises";
import path from "node:path";
export class ModelRuntimeLog {
 readonly path:string; private queue=Promise.resolve();private pending=0;
 constructor(root:string){this.path=path.join(root,"logs","llama-runtime.log");}
 append(message:string):Promise<void>{
  const line="["+new Date().toISOString()+"] "+message.trimEnd().slice(0,65536)+"\n",bytes=Buffer.byteLength(line);
  if(this.pending+bytes>1024*1024)return Promise.resolve();this.pending+=bytes;
  const write=this.queue.then(async()=>{await fs.mkdir(path.dirname(this.path),{recursive:true});await fs.appendFile(this.path,line,"utf8");});
  return this.queue=write.catch(()=>{}).finally(()=>{this.pending-=bytes;});
 }
 flush(){return this.queue;}
}
