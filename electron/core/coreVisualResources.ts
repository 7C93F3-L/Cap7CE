import path from "node:path";
export const coreVisualExecutable = () => process.resourcesPath && !process.defaultApp
  ? path.join(process.resourcesPath, "core-visuals/v1/Cap7CE.Core.Visuals.exe")
  : path.resolve(__dirname, "../../native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe");
