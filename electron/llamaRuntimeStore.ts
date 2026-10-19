import { requestCoreModelSettings } from "./core/coreModelSettingsClient";
import type { LlamaRuntimeSettingsResponse } from "../src/shared/modelSettingsTypes";
export type { LlamaRuntimeStatus, LlamaRuntimeVersion, LlamaRuntimeSettingsResponse } from "../src/shared/modelSettingsTypes";
export const getLlamaRuntimeSettings = () => requestCoreModelSettings<LlamaRuntimeSettingsResponse>("runtime.settings");
export const updateSelectedLlamaRuntime = (selectedVersion: string) => requestCoreModelSettings<LlamaRuntimeSettingsResponse>("runtime.select", selectedVersion);
