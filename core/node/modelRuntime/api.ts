import type { ModelRuntimeTimings } from "./settings";
import { createModelSettingsOwner } from "../modelSettings/owner";
import { LocalModelRuntime } from "./owner";
import type { LlamaRuntimeSettingsResponse,GgufModelSettingsResponse,SelectedGgufModelRuntime } from "../../../core/shared/modelSettingsTypes";
import type { LlamaRuntimeStartSource } from "../../../core/shared/modelRuntimeTypes";
export function createLocalModelService(root:string,timings:ModelRuntimeTimings={}){
 let runtime:LocalModelRuntime|undefined,closed=false;
 const settings=createModelSettingsOwner(root,()=>!closed&&(!runtime||runtime.canSelect));
 const invalid=():never=>{throw Error("core-model-runtime-invalid-request");};
 return {
  async dispatch(method:unknown,args:unknown):Promise<unknown>{
   if(closed)throw Error("core-model-runtime-closed");if(!Array.isArray(args))return invalid();
   if(method==="runtime.idle"){if(args.length)return invalid();await settings.flush();return !runtime||runtime.canRetire;}
   if(method==="modelSettings.invoke")return settings.dispatch(args);
   if(args.length!==2||typeof method!=="string"||!["runtime.state","runtime.start","runtime.stop","runtime.ready","runtime.sync","runtime.beginAI","runtime.endAI","runtime.watch","runtime.shutdown"].includes(method))return invalid();
   const [context,value]=args;
   if(method==="runtime.start"?!["manual","ai"].includes(value):method==="runtime.stop"?typeof value!=="string"||value.length>1024:method==="runtime.watch"?!value||typeof value!=="object":value!==null)return invalid();
   settings.prepare(context);
   if(method==="runtime.shutdown"){closed=true;await runtime?.close();await settings.flush();return{closed:true};}
   const owner=runtime??=new LocalModelRuntime(root,{runtime:()=>settings.dispatch([settings.currentContext(),"runtime.settings",null]) as Promise<LlamaRuntimeSettingsResponse>,models:()=>settings.dispatch([settings.currentContext(),"models.settings",null]) as Promise<GgufModelSettingsResponse>,selected:()=>settings.dispatch([settings.currentContext(),"models.selectedRuntime",null]) as Promise<SelectedGgufModelRuntime>},timings);
   let result:unknown;switch(method){
    case "runtime.state":return owner.state.capture();
    case "runtime.watch":return owner.state.wait(value.epoch,value.sequence);
    case "runtime.start":result=await owner.start(value as LlamaRuntimeStartSource);break;
    case "runtime.stop":result=await owner.stop(value);break;
    case "runtime.ready":result=await owner.ready();break;
    case "runtime.sync":result=await owner.sync();break;
    case "runtime.beginAI":await owner.beginAiUse();break;
    case "runtime.endAI":owner.endAiUse();break;
   }
   return owner.state.capture(result);
  },
  async close(){closed=true;await runtime?.close();await settings.flush();}
 };
}
