import { t } from "./localization";
import type { LlamaRuntimeProcessState } from "../src/shared/modelRuntimeTypes";
export const llamaRuntimeAiIdleTimeoutMs=10*60000;
export const initialModelRuntimeState=(logPath:string):LlamaRuntimeProcessState=>({status:"stopped",host:"127.0.0.1",port:null,selectedVersion:"",modelStatus:"unselected",selectedModelId:"",modelMessage:t("runtime.modelUnselected"),message:t("runtime.serverStopped"),healthUrl:"",logPath});
