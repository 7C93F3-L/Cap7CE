import type { LlamaRuntimeSettingsResponse, GgufModelSettingsResponse, SelectedGgufModelRuntime } from "../../../core/shared/modelSettingsTypes";
export interface ModelRuntimeSettings {
 runtime(): Promise<LlamaRuntimeSettingsResponse>;
 models(): Promise<GgufModelSettingsResponse>;
 selected(): Promise<SelectedGgufModelRuntime>;
}

export interface ModelRuntimeTimings { idleTimeoutMs?:number; healthIntervalMs?:number }
