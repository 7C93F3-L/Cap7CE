import { getAiContentPaths } from "../aiContentPaths";
import { getActiveLanguage } from "../localization";
import { requestVisualCacheOwner } from "../visualCacheService";
// The Shell supplies its fixed content roots and language; Core discovers files and owns selection persistence.
export const requestCoreModelSettings = <T>(operation: string, value: string | null = null): Promise<T> => {
 const {runtimeRoot,modelsRoot}=getAiContentPaths();
 return requestVisualCacheOwner<T>("modelSettings.invoke",[{runtimeRoot,modelsRoot,language:getActiveLanguage()},operation,value]);
};
