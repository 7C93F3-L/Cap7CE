import path from "node:path";
const runtime = process as NodeJS.Process & { resourcesPath?: string; defaultApp?: boolean };
export const coreVisualExecutable = () => runtime.resourcesPath && !runtime.defaultApp
  ? path.join(runtime.resourcesPath, "core-visuals/v1/Cap7CE.Core.Visuals.exe")
  : path.resolve(__dirname, "../../native/artifacts/core-visuals/v1/Cap7CE.Core.Visuals.exe");
