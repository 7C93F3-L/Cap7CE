import { spawn,type ChildProcess } from "node:child_process";
import type { LlamaRuntimeVersion } from "../../../src/shared/modelSettingsTypes";
import type { ModelRuntimeLog } from "./log";
export class ModelRuntimeAttempt {
 readonly child:ChildProcess;ready=false;error="";errorCode="";stderr="";private readonly exited:Promise<void>;
 constructor(runtime:LlamaRuntimeVersion,args:string[],private readonly log:ModelRuntimeLog,onExit:(attempt:ModelRuntimeAttempt,code:number|null)=>void){
  this.child=spawn(runtime.serverPath,args,{cwd:runtime.directoryPath,windowsHide:true,shell:false,stdio:["ignore","pipe","pipe"]});
  this.child.stdout?.on("data",(chunk:Buffer)=>{void log.append("[stdout] "+chunk.toString("utf8"));});
  this.child.stderr?.on("data",(chunk:Buffer)=>{const text=chunk.toString("utf8");this.stderr=(this.stderr+text).slice(-10000);void log.append("[stderr] "+text);});
  this.child.once("error",(error:NodeJS.ErrnoException)=>{this.error=error.message;this.errorCode=error.code??"";});
  this.exited=new Promise(resolve=>this.child.once("close",()=>resolve()));
  this.child.once("exit",code=>onExit(this,code));
 }
 get alive(){return this.child.exitCode===null&&this.child.signalCode===null&&!this.error;}
 get startupError(){return this.errorCode+"\n"+this.error+"\n"+this.stderr;}
 async stop(reason:string){
  if(this.alive)this.child.kill();
  const until=async(ms:number)=>{let timer:NodeJS.Timeout|undefined;try{return await Promise.race([this.exited.then(()=>true),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),ms);})]);}finally{clearTimeout(timer);}};
  if(!await until(5000)){this.child.kill("SIGKILL");if(!await until(1000))throw Error("core-model-runtime-stop-failed");}
  await this.log.append("停止 llama-server，PID="+this.child.pid+"，原因："+reason);
 }
}
