import { requestCoreModelSettings } from "./core/coreModelSettingsClient";
import type { GgufModelSettingsResponse, SelectedGgufModelRuntime } from "../src/shared/modelSettingsTypes";
export type { GgufModelFileKind,GgufModelPairingStatus,GgufModelSettingsStatus,GgufModelFile,GgufVisionModel,GgufModelSettingsResponse,SelectedGgufModelRuntime } from "../src/shared/modelSettingsTypes";
export const getGgufModelSettings = () => requestCoreModelSettings<GgufModelSettingsResponse>("models.settings");
export const getSelectedGgufModelId = () => requestCoreModelSettings<string>("models.selectedId");
export const updateSelectedGgufModel = (id: string) => requestCoreModelSettings<GgufModelSettingsResponse>("models.select", id);
export const getSelectedGgufModelRuntime = () => requestCoreModelSettings<SelectedGgufModelRuntime>("models.selectedRuntime");
