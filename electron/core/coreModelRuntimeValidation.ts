import path from "node:path";
import type { LlamaRuntimeProcessState,ModelRuntimeSnapshot } from "../../src/shared/modelRuntimeTypes";
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const text=(value:unknown,max=32768)=>typeof value==="string"&&value.length<=max;
const invalid=():never=>{throw Error("core-model-runtime-invalid-response");};
export function validModelState(value:unknown,root:string):value is LlamaRuntimeProcessState {
 if(!object(value)||!["stopped","starting","running","failed"].includes(String(value.status))||value.host!=="127.0.0.1"||!["unselected","unpaired","ready","loading","loaded","load_failed"].includes(String(value.modelStatus))
  ||!text(value.selectedVersion)||!text(value.selectedModelId)||value.logPath!==path.join(root,"logs","llama-runtime.log")||value.port!==null&&(!Number.isInteger(value.port)||Number(value.port)<18080||Number(value.port)>=18180)
  ||value.pid!==undefined&&(!Number.isSafeInteger(value.pid)||Number(value.pid)<1)||[value.message,value.modelMessage,value.loadedModelName,value.startedAt].some(v=>v!==undefined&&!text(v)))return false;
 return value.healthUrl===""||value.port!==null&&value.healthUrl==="http://127.0.0.1:"+value.port+"/health";
}
export function readModelSnapshot(value:unknown,root:string):ModelRuntimeSnapshot {
 if(!object(value)||typeof value.epoch!=="string"||!/^[a-f0-9-]{36}$/.test(value.epoch)||!Number.isSafeInteger(value.sequence)||Number(value.sequence)<0||!validModelState(value.state,root))return invalid();
 return value as unknown as ModelRuntimeSnapshot;
}
export function readModelConnection(value:unknown){
 if(value===null)return null;if(!object(value)||!text(value.modelName)||!/^http:\/\/127\.0\.0\.1:18(?:0[89][0-9]|1[0-7][0-9])$/.test(String(value.baseUrl)))return invalid();
 return{baseUrl:String(value.baseUrl),modelName:String(value.modelName)};
}
