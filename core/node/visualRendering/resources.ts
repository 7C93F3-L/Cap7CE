import path from "node:path";
export const visualNativeExecutable = () => {
  const executable = process.env.CAP7CE_CORE_VISUAL_HOST;
  if (!executable || !path.isAbsolute(executable)) throw new Error("core-visual-native-resource-unavailable");
  return executable;
};
export const visualScratchDirectory = () => {
  const directory = process.env.CAP7CE_VISUAL_SCRATCH;
  if (!directory || !path.isAbsolute(directory)) throw new Error("core-visual-scratch-unavailable");
  return directory;
};
