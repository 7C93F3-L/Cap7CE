import path from "node:path";
import { setActiveLanguage } from "../../../electron/localization";
import type { ModelSettingsContext } from "../../../src/shared/modelSettingsTypes";
import { createRuntimeSettings } from "./runtime";
import { createGgufSettings } from "./models";
const invalid=():never=>{throw new Error("core-model-settings-invalid-request");};
export function createModelSettingsOwner(userDataRoot:string) {
 let context:ModelSettingsContext|undefined,serial:Promise<unknown>=Promise.resolve();
 const roots=()=>context??invalid(),runtime=createRuntimeSettings(userDataRoot,roots),models=createGgufSettings(userDataRoot,roots);
 const execute=async(args:unknown[])=>{
  if(args.length!==3)return invalid();const [value,operation,selection]=args;
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!=="language,modelsRoot,runtimeRoot")return invalid();
  const next=value as ModelSettingsContext;
  if(!["zh-CN","en-US"].includes(next.language)||[next.runtimeRoot,next.modelsRoot].some(p=>typeof p!=="string"||p.length>32767||p.includes("\0")||!path.isAbsolute(p)||p.startsWith("\\\\")))return invalid();
  if(context&&(context.runtimeRoot!==next.runtimeRoot||context.modelsRoot!==next.modelsRoot))return invalid();
  if(typeof operation!=="string"||!["runtime.settings","runtime.select","models.settings","models.select","models.selectedId","models.selectedRuntime"].includes(operation))return invalid();
  if(operation.endsWith(".select")?(typeof selection!=="string"||selection.length>32767):selection!==null)return invalid();
  context={...next};setActiveLanguage(next.language);
  switch(operation){
   case "runtime.settings":return runtime.getLlamaRuntimeSettings();
   case "runtime.select":return runtime.updateSelectedLlamaRuntime(selection as string);
   case "models.settings":return models.getGgufModelSettings();
   case "models.select":return models.updateSelectedGgufModel(selection as string);
   case "models.selectedId":return models.getSelectedGgufModelId();
   case "models.selectedRuntime":return models.getSelectedGgufModelRuntime();
  }
 };
 return { dispatch(args:unknown[]){const work=serial.then(()=>execute(args));serial=work.catch(()=>{});return work;} };
}
