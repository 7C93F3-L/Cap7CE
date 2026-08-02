import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { getLlamaRuntimeSettings } from "./llamaRuntimeStore";

export type GgufModelFileKind = "model" | "mmproj";
export type GgufModelPairingStatus = "paired" | "missing_mmproj";
export type GgufModelSettingsStatus =
  | "ready"
  | "unselected"
  | "unpaired"
  | "missing_directory"
  | "selection_missing";

export interface GgufModelFile {
  id: string;
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
  kind: GgufModelFileKind;
}

export interface GgufVisionModel {
  id: string;
  name: string;
  modelFile: GgufModelFile;
  mmprojFile?: GgufModelFile;
  pairingStatus: GgufModelPairingStatus;
  loadable: boolean;
  message?: string;
}

export interface GgufModelSettingsResponse {
  files: GgufModelFile[];
  models: GgufVisionModel[];
  selectedModelId: string;
  status: GgufModelSettingsStatus;
  message?: string;
  modelsRoot: string;
  configPath: string;
}

export interface SelectedGgufModelRuntime {
  id: string;
  name: string;
  modelPath: string;
  mmprojPath: string;
}

interface PersistedGgufModelConfig {
  selectedModelId: string;
  updatedAt: string;
}

const configPath = () => path.join(app.getPath("userData"), "config", "gguf-model.json");

const normalizeRelativePath = (relativePath: string) => relativePath.split(path.sep).join("/");
const isMmprojName = (fileName: string) => /(^|[-_.])mmproj([-_.]|$)/i.test(path.parse(fileName).name);

const resolveModelsRoot = async () => {
  const runtimeSettings = await getLlamaRuntimeSettings();
  return path.resolve(runtimeSettings.runtimeRoot, "..", "models");
};

const defaultConfig = (): PersistedGgufModelConfig => ({
  selectedModelId: "",
  updatedAt: new Date().toISOString()
});

const readConfig = async (): Promise<PersistedGgufModelConfig> => {
  try {
    const content = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(content) as Partial<PersistedGgufModelConfig>;
    return {
      selectedModelId: typeof parsed.selectedModelId === "string" ? parsed.selectedModelId.trim() : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString()
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultConfig();
    }
    throw error;
  }
};

const saveConfig = async (config: PersistedGgufModelConfig) => {
  const targetPath = configPath();
  const temporaryPath = `${targetPath}.tmp`;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, targetPath);
};

const isDirectory = async (candidatePath: string) => {
  try {
    return (await fs.stat(candidatePath)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const scanGgufFiles = async (modelsRoot: string): Promise<GgufModelFile[]> => {
  const files: GgufModelFile[] = [];

  const visit = async (directoryPath: string): Promise<void> => {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        return;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".gguf") {
        return;
      }

      const stats = await fs.stat(fullPath);
      const relativePath = normalizeRelativePath(path.relative(modelsRoot, fullPath));
      files.push({
        id: relativePath.toLowerCase(),
        name: entry.name,
        relativePath,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        kind: isMmprojName(entry.name) ? "mmproj" : "model"
      });
    }));
  };

  await visit(modelsRoot);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, {
    numeric: true,
    sensitivity: "base"
  }));
};

const modelIdentityTokens = (fileName: string, kind: GgufModelFileKind) => {
  const ignoredTokens = new Set([
    "gguf", "mmproj", "instruct", "chat", "vision", "projector", "f16", "f32", "bf16",
    "q2", "q3", "q4", "q5", "q6", "q8", "k", "m", "s", "l", "xs"
  ]);
  const baseName = path.parse(fileName).name
    .toLowerCase()
    .replace(/q\d+(?:_[a-z0-9]+)*/g, " ")
    .replace(/f(?:16|32)/g, " ");
  const tokens = baseName.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.filter((token) => !ignoredTokens.has(token) && (kind === "model" || token !== "mmproj"));
};

const pairingScore = (modelFile: GgufModelFile, mmprojFile: GgufModelFile) => {
  const modelDirectory = path.posix.dirname(modelFile.relativePath.toLowerCase());
  const mmprojDirectory = path.posix.dirname(mmprojFile.relativePath.toLowerCase());
  const sameDirectoryScore = modelDirectory === mmprojDirectory ? 100 : 0;
  const modelTokens = new Set(modelIdentityTokens(modelFile.name, "model"));
  const mmprojTokens = modelIdentityTokens(mmprojFile.name, "mmproj");
  const sharedTokens = mmprojTokens.filter((token) => modelTokens.has(token)).length;
  const mismatchedTokens = mmprojTokens.filter((token) => !modelTokens.has(token)).length;
  return sameDirectoryScore + sharedTokens * 10 - mismatchedTokens * 3;
};

const pairVisionModels = (files: GgufModelFile[]): GgufVisionModel[] => {
  const modelFiles = files.filter((file) => file.kind === "model");
  const mmprojFiles = files.filter((file) => file.kind === "mmproj");

  return modelFiles.map((modelFile) => {
    const rankedCandidates = mmprojFiles
      .map((mmprojFile) => ({
        mmprojFile,
        score: pairingScore(modelFile, mmprojFile)
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score
        || left.mmprojFile.relativePath.localeCompare(right.mmprojFile.relativePath));
    const bestCandidate = rankedCandidates[0];
    const secondCandidate = rankedCandidates[1];
    const mmprojFile = bestCandidate
      && (!secondCandidate || bestCandidate.score > secondCandidate.score)
      ? bestCandidate.mmprojFile
      : undefined;

    return {
      id: modelFile.id,
      name: modelFile.name,
      modelFile,
      ...(mmprojFile ? { mmprojFile } : {}),
      pairingStatus: mmprojFile ? "paired" : "missing_mmproj",
      loadable: Boolean(mmprojFile),
      ...(!mmprojFile ? { message: t("model.mmprojNotFound") } : {})
    };
  });
};

const buildSettings = async (): Promise<GgufModelSettingsResponse> => {
  const modelsRoot = await resolveModelsRoot();
  const config = await readConfig();
  if (!(await isDirectory(modelsRoot))) {
    return {
      files: [],
      models: [],
      selectedModelId: config.selectedModelId,
      status: "missing_directory",
      message: t("model.rootNotFound", { path: modelsRoot }),
      modelsRoot,
      configPath: configPath()
    };
  }

  const files = await scanGgufFiles(modelsRoot);
  const models = pairVisionModels(files);
  if (!config.selectedModelId) {
    return {
      files,
      models,
      selectedModelId: "",
      status: "unselected",
      message: models.length > 0 ? t("model.select") : t("model.mainModelNotFound"),
      modelsRoot,
      configPath: configPath()
    };
  }

  const selectedModel = models.find((model) => model.id === config.selectedModelId.toLowerCase());
  if (!selectedModel) {
    return {
      files,
      models,
      selectedModelId: config.selectedModelId,
      status: "selection_missing",
      message: t("model.selectedMissing"),
      modelsRoot,
      configPath: configPath()
    };
  }

  return {
    files,
    models,
    selectedModelId: selectedModel.id,
    status: selectedModel.loadable ? "ready" : "unpaired",
    ...(!selectedModel.loadable ? { message: selectedModel.message } : {}),
    modelsRoot,
    configPath: configPath()
  };
};

export const getGgufModelSettings = async () => buildSettings();

export const updateSelectedGgufModel = async (selectedModelId: string) => {
  const normalizedModelId = selectedModelId.trim().toLowerCase();
  if (!normalizedModelId) {
    await saveConfig({
      selectedModelId: "",
      updatedAt: new Date().toISOString()
    });
    return buildSettings();
  }
  const settings = await buildSettings();
  if (!settings.models.some((model) => model.id === normalizedModelId)) {
    throw new Error(t("model.notExists", { name: selectedModelId || t("common.unselected") }));
  }

  await saveConfig({
    selectedModelId: normalizedModelId,
    updatedAt: new Date().toISOString()
  });
  return buildSettings();
};

export const getSelectedGgufModelRuntime = async (): Promise<SelectedGgufModelRuntime> => {
  const settings = await buildSettings();
  const selectedModel = settings.models.find((model) => model.id === settings.selectedModelId);
  if (!selectedModel) {
    throw new Error(settings.message || t("model.select"));
  }
  if (!selectedModel.mmprojFile || !selectedModel.loadable) {
    throw new Error(selectedModel.message || t("model.mmprojMissing"));
  }

  return {
    id: selectedModel.id,
    name: selectedModel.name,
    modelPath: path.join(settings.modelsRoot, ...selectedModel.modelFile.relativePath.split("/")),
    mmprojPath: path.join(settings.modelsRoot, ...selectedModel.mmprojFile.relativePath.split("/"))
  };
};

import { t } from "./localization";
