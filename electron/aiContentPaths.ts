import { app } from "electron";
import path from "node:path";

export interface AiContentPathEnvironment {
  isPackaged: boolean;
  appPath: string;
  executablePath: string;
  userDataPath: string;
}

export interface AiContentPaths {
  programRoot: string;
  runtimeRoot: string;
  modelsRoot: string;
}

export const resolveAiContentPaths = ({
  isPackaged,
  appPath,
  executablePath,
  userDataPath
}: AiContentPathEnvironment): AiContentPaths => {
  const programRoot = path.resolve(isPackaged ? path.dirname(executablePath) : appPath);
  const contentRoot = isPackaged ? path.dirname(path.resolve(userDataPath)) : programRoot;
  return {
    programRoot,
    runtimeRoot: path.join(contentRoot, "llama.cpp"),
    modelsRoot: path.join(contentRoot, "models")
  };
};

export const getAiContentPaths = () => resolveAiContentPaths({
  isPackaged: app.isPackaged,
  appPath: app.getAppPath(),
  executablePath: process.execPath,
  userDataPath: app.getPath("userData")
});
