import { createModelSelectionFile } from "./selectionFile";
import fs from "node:fs/promises";
import path from "node:path";
import { t } from "../resourceCatalog/domain/localization/localization";
import type * as Contracts from "../../../core/shared/modelSettingsTypes";
type GgufModelFile=Contracts.GgufModelFile;
type GgufModelSettingsResponse=Contracts.GgufModelSettingsResponse;
type SelectedGgufModelRuntime=Contracts.SelectedGgufModelRuntime;
import { pairVisionModels } from "./pairing";
export function createGgufSettings(userDataRoot: string, getAiContentPaths: () => Contracts.ModelSettingsContext) {
interface PersistedGgufModelConfig {
  selectedModelId: string;
  updatedAt: string;
}

const configPath = () => path.join(userDataRoot,"config","gguf-model.json");
const selectionFile=createModelSelectionFile(userDataRoot,"gguf-model.json");

const normalizeRelativePath = (relativePath: string) => relativePath.split(path.sep).join("/");
const isMmprojName = (fileName: string) => /(^|[-_.])mmproj([-_.]|$)/i.test(path.parse(fileName).name);

const defaultConfig = (): PersistedGgufModelConfig => ({
  selectedModelId: "",
  updatedAt: new Date().toISOString()
});

const readConfig = async (): Promise<PersistedGgufModelConfig> => {
  try {
    const parsed = await selectionFile.read() as Partial<PersistedGgufModelConfig>;
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

const saveConfig = (config: PersistedGgufModelConfig) => selectionFile.write(config);

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

const buildSettings = async (): Promise<GgufModelSettingsResponse> => {
  const { modelsRoot } = getAiContentPaths();
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

const getGgufModelSettings = async () => buildSettings();

const getSelectedGgufModelId = async () => (await readConfig()).selectedModelId.toLowerCase();

const updateSelectedGgufModel = async (selectedModelId: string) => {
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

const getSelectedGgufModelRuntime = async (): Promise<SelectedGgufModelRuntime> => {
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

return { getGgufModelSettings, getSelectedGgufModelId, updateSelectedGgufModel, getSelectedGgufModelRuntime };
}
