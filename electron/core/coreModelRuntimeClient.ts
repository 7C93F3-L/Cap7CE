import path from "node:path";
import { t } from "../localization";
import { initialModelRuntimeState } from "../modelRuntimeInitialState";
import type { ModelSettingsContext } from "../../src/shared/modelSettingsTypes";
import type { LlamaRuntimeProcessState,ModelRuntimeSnapshot } from "../../src/shared/modelRuntimeTypes";
import { readModelSnapshot,validModelState,readModelConnection } from "./coreModelRuntimeValidation";
interface Host {request(method:string,args:unknown[]):Promise<unknown>;requestIfActive(method:string,args:unknown[]):Promise<unknown>;close():void}
export class CoreModelRuntimeClient {
 private state:LlamaRuntimeProcessState;private epoch?:string;private sequence=-1;private generation=0;private watching?:Promise<void>;private closed=false;private shutting?:Promise<void>;private starts=0;
 constructor(private readonly root:string,private readonly host:Host,private readonly context:()=>ModelSettingsContext,private readonly changed:(state:LlamaRuntimeProcessState)=>void){this.state=initialModelRuntimeState(path.join(root,"logs","llama-runtime.log"));}
 get snapshot(){return{...this.state};}
 get managed(){return this.starts>0||this.state.status==="starting"||this.state.status==="running";}
 private adopt(reply:ModelRuntimeSnapshot,generation:number){
  if(this.closed||generation!==this.generation)return;
  if(this.epoch!==reply.epoch){this.epoch=reply.epoch;this.sequence=-1;this.generation++;}
  if(reply.sequence>=this.sequence){this.sequence=reply.sequence;this.state={...reply.state};try{this.changed(this.snapshot);}catch{}}
 }
 private watch(){
  if(this.closed||!this.epoch||this.watching)return;const generation=this.generation;
  const work=(async()=>{try{while(!this.closed&&generation===this.generation&&this.epoch){
   const result=await this.host.requestIfActive("runtime.watch",[this.context(),{epoch:this.epoch,sequence:this.sequence}]);if(result===null)return;
   this.adopt(readModelSnapshot(result,this.root),generation);
  }}catch{if(!this.closed&&generation===this.generation){this.generation++;this.epoch=undefined;this.sequence=-1;const message=t("runtime.visionUnavailable");this.state={...this.state,status:"failed",port:null,pid:undefined,modelStatus:"load_failed",message,modelMessage:message,healthUrl:""};try{this.changed(this.snapshot);}catch{}}}
  })().finally(()=>{if(this.watching===work)this.watching=undefined;if(!this.closed&&this.epoch&&generation!==this.generation)this.watch();});this.watching=work;
 }
 async settings<T>(operation:string,value:string|null=null):Promise<T>{
  if(this.closed)throw Error("core-model-runtime-closed");
  try{return await this.host.request("modelSettings.invoke",[this.context(),operation,value]) as T;}
  catch(error){if((error as Error)?.message==="core-model-runtime-switch-blocked")throw Error(t(operation==="runtime.select"?"error.stopServerBeforeRuntimeSwitch":"error.stopServerBeforeModelSwitch"));throw error;}
 }
 async runtime(operation:string,value:unknown=null,passive=false):Promise<unknown>{
  if(this.closed)throw Error("core-model-runtime-closed");const generation=this.generation;const start=operation==="start";if(start)this.starts++;
  try{
   const result=await (passive?this.host.requestIfActive("runtime."+operation,[this.context(),value]):this.host.request("runtime."+operation,[this.context(),value]));
   if(result===null)return operation==="ready"?null:this.snapshot;
   const snapshot=readModelSnapshot(result,this.root);this.adopt(snapshot,generation);this.watch();
   if(operation==="ready")return readModelConnection(snapshot.result);
   if(["start","stop","sync"].includes(operation)){if(!validModelState(snapshot.result,this.root))throw Error("core-model-runtime-invalid-response");return snapshot.result;}
   return snapshot.state;
  }finally{if(start)this.starts--;}
 }
 shutdown():Promise<void>{
  if(this.shutting)return this.shutting;this.closed=true;this.generation++;let timer:NodeJS.Timeout|undefined;
  return this.shutting=(async()=>{try{await Promise.race([this.host.requestIfActive("runtime.shutdown",[this.context(),null]),new Promise<void>(resolve=>{timer=setTimeout(resolve,10000);})]);}catch{ /* Native Job retirement below also handles a dead transport. */ }finally{clearTimeout(timer);this.host.close();}})();
 }
 close(){this.closed=true;this.generation++;this.host.close();}
}
