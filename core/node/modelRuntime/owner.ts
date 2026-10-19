import { llamaRuntimeAiIdleTimeoutMs } from "../../../electron/modelRuntimeInitialState";
import { t } from "../../../electron/localization";
import { createLlamaRuntimeIdleController } from "../../../electron/llamaRuntimeIdleController";
import type { LlamaRuntimeProcessState,LlamaRuntimeStartSource,GgufModelLoadStatus } from "../../../src/shared/modelRuntimeTypes";
import type { ModelRuntimeSettings,ModelRuntimeTimings } from "./settings";
import { ModelRuntimeState } from "./state";
import { ModelRuntimeLog } from "./log";
import { ModelRuntimeAttempt } from "./attempt";
import { startModel } from "./startup";
import { initialState,baseUrl,modelStatus,runtimeHost,summarize } from "./policy";
import { healthy } from "./health";
export class LocalModelRuntime {
 readonly log:ModelRuntimeLog;readonly state:ModelRuntimeState;
 private attempt?:ModelRuntimeAttempt;private starting?:Promise<LlamaRuntimeProcessState>;private stopping?:Promise<LlamaRuntimeProcessState>;private retiring?:Promise<void>;private abort?:AbortController;
 private closing?:Promise<void>;private revision=0;private queuedStarts=0;private closed=false;private monitor?:NodeJS.Timeout;private monitorAbort?:AbortController;private polling=false;private healthFailures=0;
 private readonly idle:ReturnType<typeof createLlamaRuntimeIdleController>;
 constructor(root:string,private readonly settings:ModelRuntimeSettings,private readonly timings:ModelRuntimeTimings={}){this.idle=createLlamaRuntimeIdleController({idleTimeoutMs:timings.idleTimeoutMs??llamaRuntimeAiIdleTimeoutMs,onIdle:()=>this.stop("AI 搜索空闲 10 分钟")});this.log=new ModelRuntimeLog(root);this.state=new ModelRuntimeState(initialState(this.log.path));}
 get busy(){return this.queuedStarts>0||!!this.starting||!!this.stopping||!!this.retiring||!!this.attempt?.alive;}
 get canSelect(){return !this.closed&&!this.busy;}
 private current(own:number){return own===this.revision&&!this.closed&&!this.stopping;}
 private cancelled(){return{...this.state.capture().state,status:"failed" as const,port:null,pid:undefined,modelStatus:"load_failed" as const,message:t("runtime.cancelled"),modelMessage:t("runtime.cancelled"),healthUrl:""};}
 async start(source:LlamaRuntimeStartSource="manual"):Promise<LlamaRuntimeProcessState>{this.queuedStarts++;try{return await this.startAccepted(source);}finally{this.queuedStarts--;}}
 private async startAccepted(source:LlamaRuntimeStartSource):Promise<LlamaRuntimeProcessState>{
  const accepted=this.revision;
  if(this.closed)throw Error("core-model-runtime-closed");if(this.stopping)await this.stopping;if(this.retiring)await this.retiring;if(this.closed)throw Error("core-model-runtime-closed");
  if(accepted!==this.revision)return this.cancelled();
  this.idle.cancelIdleStop();this.idle.markStartRequested(source);
  if(this.attempt?.alive&&this.state.capture().state.status==="running")return this.state.capture().state;
  if(this.starting)return this.starting;const own=++this.revision,abort=this.abort=new AbortController();
  const work=startModel({settings:this.settings,state:this.state,log:this.log,
   bind:attempt=>{this.attempt=attempt;},exited:(attempt,code)=>this.exited(attempt,code),running:()=>this.startMonitor(own),
   fail:(version,id,message,status)=>this.fail(own,version,id,message,status)},abort.signal)
   .catch(error=>abort.signal.aborted||!this.current(own)?this.cancelled():this.fail(own,this.state.capture().state.selectedVersion,this.state.capture().state.selectedModelId,error instanceof Error?error.message:t("runtime.visionStartupFailed")))
   .finally(()=>{if(this.starting===work)this.starting=undefined;if(this.abort===abort)this.abort=undefined;});
  this.starting=work;return work;
 }
 private retire(reason:string):Promise<void>{if(this.retiring)return this.retiring;const attempt=this.attempt;this.attempt=undefined;if(!attempt)return Promise.resolve();
  const work=attempt.stop(reason).finally(()=>{if(this.retiring===work)this.retiring=undefined;});this.retiring=work;return work;}
 private async fail(own:number,version:string,id:string,message:string,status:GgufModelLoadStatus="load_failed"){
  if(!this.current(own))return this.cancelled();this.stopMonitor();await this.retire("启动失败清理");if(!this.current(own))return this.cancelled();this.idle.markStopped();await this.log.append("启动失败："+message);
  if(!this.current(own))return this.cancelled();return this.state.set({status:"failed",host:runtimeHost,port:null,selectedVersion:version,modelStatus:status,selectedModelId:id,modelMessage:message,message,healthUrl:"",logPath:this.log.path});
 }
 private exited(attempt:ModelRuntimeAttempt,code:number|null){
  if(this.attempt!==attempt)return;this.attempt=undefined;if(!attempt.ready)return;this.stopMonitor();this.idle.markStopped();void this.log.append("进程退出：PID="+attempt.child.pid+"，code="+code);
  if(this.closed||this.stopping||this.state.capture().state.status!=="running")return;
  const detail=summarize(attempt.stderr),message=detail?t("runtime.unexpectedExitWithDetail",{code:code??t("common.unknown"),detail}):t("runtime.unexpectedExit",{code:code??t("common.unknown")});
  this.state.set({...this.state.capture().state,status:"failed",port:null,pid:undefined,modelStatus:"load_failed",modelMessage:message,message,healthUrl:""});
 }
 private stopMonitor(){if(this.monitor)clearInterval(this.monitor);this.monitor=undefined;this.monitorAbort?.abort();this.monitorAbort=undefined;this.polling=false;this.healthFailures=0;}
 private startMonitor(own:number){
  this.stopMonitor();const abort=this.monitorAbort=new AbortController();
  this.monitor=setInterval(()=>{if(this.polling||!this.current(own))return;const attempt=this.attempt,state=this.state.capture().state;if(!attempt||state.port===null||state.status!=="running")return;this.polling=true;
   void healthy(state.port,abort.signal).then(async available=>{
    if(!this.current(own)||this.attempt!==attempt||abort.signal.aborted)return;this.healthFailures=available?0:this.healthFailures+1;if(this.healthFailures<3)return;
    this.stopMonitor();await this.retire("健康检查失败");if(!this.current(own))return;this.idle.markStopped();const message=t("runtime.healthCheckFailed");await this.log.append(message);
    if(this.current(own))this.state.set({...state,status:"failed",port:null,pid:undefined,modelStatus:"load_failed",modelMessage:message,message,healthUrl:""});
   }).catch(()=>{}).finally(()=>{if(this.monitorAbort===abort)this.polling=false;});
  },this.timings.healthIntervalMs??2000);this.monitor.unref();
 }
 stop(reason="用户请求"):Promise<LlamaRuntimeProcessState>{
  if(this.stopping){this.revision++;this.abort?.abort();return this.stopping;}
  const work=this.stopNow(reason).finally(()=>{if(this.stopping===work)this.stopping=undefined;});this.stopping=work;return work;
 }
 private async stopNow(reason:string){
  this.revision++;this.abort?.abort();this.stopMonitor();this.idle.cancelIdleStop();const pending=this.starting;await this.retire(reason);
  if(pending)await pending.catch(()=>{});await this.retire(reason);this.idle.markStopped();const previous=this.state.capture().state;
  const result=this.state.set({status:"stopped",host:runtimeHost,port:null,selectedVersion:previous.selectedVersion,modelStatus:previous.selectedModelId?"ready":"unselected",selectedModelId:previous.selectedModelId,modelMessage:previous.selectedModelId?t("runtime.modelSelectedNotLoaded"):t("runtime.modelUnselected"),message:t("runtime.serverStopped"),healthUrl:"",logPath:this.log.path});
  await this.log.append("停止时间："+new Date().toISOString());return result;
 }
 async sync(){
  if(this.busy||this.closed)return this.state.capture().state;const own=this.revision,[runtime,models]=await Promise.all([this.settings.runtime(),this.settings.models()]);
  if(this.busy||!this.current(own))return this.state.capture().state;
  return this.state.set({status:"stopped",host:runtimeHost,port:null,selectedVersion:runtime.selectedVersion,modelStatus:modelStatus(models.status),selectedModelId:models.selectedModelId,modelMessage:models.selectedModelId?models.message||t("runtime.modelSelectedNotLoaded"):t("runtime.modelUnselected"),message:t("runtime.serverStopped"),healthUrl:"",logPath:this.log.path});
 }
 async ready(){const own=this.revision,attempt=this.attempt,state=this.state.capture().state;
  if(!attempt?.alive||state.status!=="running"||state.modelStatus!=="loaded"||!state.loadedModelName||state.port===null)return null;
  const available=await healthy(state.port,this.monitorAbort?.signal);
  return available&&this.current(own)&&this.attempt===attempt?{baseUrl:baseUrl(state.port),modelName:state.loadedModelName}:null;
 }
 async beginAiUse(){if(this.stopping)await this.stopping;if(this.closed)throw Error("core-model-runtime-closed");this.idle.beginAiUse();}
 endAiUse(){this.idle.endAiUse();}
 close():Promise<void>{if(this.closing)return this.closing;this.closed=true;this.idle.markStopped();this.abort?.abort();this.stopMonitor();return this.closing=(async()=>{try{if(this.busy)await this.stop("软件退出");await this.log.flush();}finally{this.state.release();}})();}
}
