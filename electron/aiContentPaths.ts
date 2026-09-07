import { app } from "electron";
import path from "node:path";

export interface AiContentPathEnvironment {
  isPackaged: boolean;
  appPath: string;
  executablePath: string;
}

export interface AiContentPaths {
  programRoot: string;
  runtimeRoot: string;
  modelsRoot: string;
}

export const resolveAiContentPaths = ({
  isPackaged,
  appPath,
  executablePath
}: AiContentPathEnvironment): AiContentPaths => {
  const programRoot = path.resolve(isPackaged ? path.dirname(executablePath) : appPath);
  return {
    programRoot,
    runtimeRoot: path.join(programRoot, "llama.cpp"),
    modelsRoot: path.join(programRoot, "models")
  };
};

export const getAiContentPaths = () => resolveAiContentPaths({
  isPackaged: app.isPackaged,
  appPath: app.getAppPath(),
  executablePath: process.execPath
});
