import { setTimeout as delay } from "node:timers/promises";
import { t } from "../../../electron/localization";
import type { GgufModelLoadStatus,LlamaRuntimeProcessState } from "../../../src/shared/modelRuntimeTypes";
import { ModelRuntimeAttempt } from "./attempt";
import type { ModelRuntimeSettings } from "./settings";
import type { ModelRuntimeLog } from "./log";
import type { ModelRuntimeState } from "./state";
import { runtimeHost,portCount,startupTimeout,healthUrl,modelStatus,quoteArgument,bindingFailure,summarize } from "./policy";
import { findModelPort } from "./ports";
import { healthy,expectedModel } from "./health";
export interface ModelStartupContext {
 settings:ModelRuntimeSettings;state:ModelRuntimeState;log:ModelRuntimeLog;
 bind(attempt:ModelRuntimeAttempt):void;exited(attempt:ModelRuntimeAttempt,code:number|null):void;running():void;
 fail(version:string,id:string,message:string,status?:GgufModelLoadStatus):Promise<LlamaRuntimeProcessState>;
}
export async function startModel(context:ModelStartupContext,signal:AbortSignal):Promise<LlamaRuntimeProcessState>{
 const {settings,state,log}=context;const runtime=await settings.runtime(),models=await settings.models();signal.throwIfAborted();
 const version=runtime.selectedVersion,id=models.selectedModelId,selectedRuntime=runtime.versions.find(value=>value.version===version);
 if(!version||runtime.status!=="available"||!selectedRuntime)return context.fail(version,id,runtime.message||t("runtime.selectAvailable"));
 if(!id||models.status==="unselected"||models.status==="selection_missing")return context.fail(version,id,models.message||t("model.select"),"unselected");
 if(models.status!=="ready")return context.fail(version,id,models.message||t("model.mmprojMissing"),"unpaired");
 let selected;try{selected=await settings.selected();}catch(error){return context.fail(version,id,error instanceof Error?error.message:t("model.configurationUnavailable"),modelStatus(models.status));}
 signal.throwIfAborted();let offset=0;const deadline=Date.now()+startupTimeout;
 attempts:while(offset<portCount&&Date.now()<deadline){
  const candidate=await findModelPort(offset,signal,log);if(!candidate)break;offset=candidate.nextOffset;signal.throwIfAborted();const port=candidate.port,startedAt=new Date().toISOString();
  const args=["--host",runtimeHost,"--port",String(port),"--parallel","1","--ctx-size","8192","--cache-ram","0","--image-min-tokens","1024","--alias",selected.name,"-m",selected.modelPath,"--mmproj",selected.mmprojPath];
  state.set({status:"starting",host:runtimeHost,port,selectedVersion:version,modelStatus:"loading",selectedModelId:id,loadedModelName:selected.name,modelMessage:t("runtime.loadingModel"),startedAt,message:t("runtime.waitingForHealth"),healthUrl:healthUrl(port),logPath:log.path});
  await log.append("启动时间："+startedAt);await log.append("启动命令："+[selectedRuntime.serverPath,...args].map(quoteArgument).join(" "));signal.throwIfAborted();
  const attempt=new ModelRuntimeAttempt(selectedRuntime,args,log,context.exited);context.bind(attempt);state.set({...state.capture().state,pid:attempt.child.pid});
  while(Date.now()<deadline){
   signal.throwIfAborted();
   if(bindingFailure(attempt.startupError)){await log.append("端口绑定竞态失败："+runtimeHost+":"+port);await attempt.stop("端口绑定竞态失败");continue attempts;}
   if(attempt.error)return context.fail(version,id,attempt.error);
   if(!attempt.alive){const detail=summarize(attempt.stderr);return context.fail(version,id,detail?t("runtime.startupExitWithDetail",{code:attempt.child.exitCode??t("common.unknown"),detail}):t("runtime.startupExit",{code:attempt.child.exitCode??t("common.unknown")}));}
   if(await healthy(port,signal)){
    if(!await expectedModel(port,selected.name,signal))return context.fail(version,id,t("runtime.modelNotReported"));
    signal.throwIfAborted();if(!attempt.alive)continue;attempt.ready=true;
    const result=state.set({status:"running",host:runtimeHost,port,selectedVersion:version,pid:attempt.child.pid,modelStatus:"loaded",selectedModelId:id,loadedModelName:selected.name,modelMessage:t("runtime.modelLoaded"),startedAt,message:t("runtime.healthCheckPassed"),healthUrl:healthUrl(port),logPath:log.path});
    context.running();await log.append("启动成功：PID="+attempt.child.pid+"，健康检查="+healthUrl(port));return result;
   }
   await delay(250,undefined,{signal});
  }
  return context.fail(version,id,t("runtime.healthCheckTimeout",{seconds:startupTimeout/1000}));
 }
 return context.fail(version,id,t("runtime.noAvailablePort"));
}
