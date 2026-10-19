import { app } from "electron";
import path from "node:path";
import { getAiContentPaths } from "../aiContentPaths";
import { getActiveLanguage } from "../localization";
import { initialModelRuntimeState } from "../modelRuntimeInitialState";
import { metadataWorkerPaths } from "../metadataExtraction/metadataWorkerPaths";
import { CoreVisualCacheClient } from "./coreVisualCacheClient";
import { CoreModelRuntimeClient } from "./coreModelRuntimeClient";
import type { LlamaRuntimeProcessState } from "../../src/shared/modelRuntimeTypes";
let client:CoreModelRuntimeClient|undefined,root:string|undefined;
const listeners=new Set<(state:LlamaRuntimeProcessState)=>void>();
export function coreModelHost(){const next=app.getPath("userData");if(next!==root){client?.close();root=next;client=undefined;}
 if(!client){const executable=metadataWorkerPaths().executable,host=new CoreVisualCacheClient(next,executable,path.join(path.dirname(executable),"model-runtime.cjs"));
  client=new CoreModelRuntimeClient(next,host,()=>{const {runtimeRoot,modelsRoot}=getAiContentPaths();return{runtimeRoot,modelsRoot,language:getActiveLanguage()};},state=>{for(const listener of listeners){try{listener(state);}catch{}}});}
 return client;
}
export const cachedCoreModelState=()=>client?.snapshot??initialModelRuntimeState(path.join(app.getPath("userData"),"logs","llama-runtime.log"));
export const hasCoreModelHost=()=>!!client;
export const coreModelManaged=()=>client?.managed??false;
export const subscribeCoreModelState=(listener:(state:LlamaRuntimeProcessState)=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);};
export const shutdownCoreModelHost=()=>client?.shutdown()??Promise.resolve();
export const closeCoreModelHost=()=>{client?.close();client=undefined;root=undefined;};
app.once("will-quit",closeCoreModelHost);process.once("exit",closeCoreModelHost);
