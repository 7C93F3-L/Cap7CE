import { createModelSelectionFile } from "./selectionFile";
import fs from "node:fs/promises";
import path from "node:path";
import { t } from "../resourceCatalog/domain/localization/localization";
import type * as Contracts from "../../../core/shared/modelSettingsTypes";
type LlamaRuntimeSettingsResponse = Contracts.LlamaRuntimeSettingsResponse;
type LlamaRuntimeVersion = Contracts.LlamaRuntimeVersion;
export function createRuntimeSettings(userDataRoot: string, getAiContentPaths: () => Contracts.ModelSettingsContext) {
interface PersistedLlamaRuntimeConfig {
  selectedVersion: string;
  updatedAt: string;
}

const configPath = () => path.join(userDataRoot,"config","llama-runtime.json");
const selectionFile=createModelSelectionFile(userDataRoot,"llama-runtime.json");

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

const isFile = async (candidatePath: string) => {
  try {
    return (await fs.stat(candidatePath)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const resolveRuntimeRoot = async () => {
  const { runtimeRoot } = getAiContentPaths();
  return {
    runtimeRoot,
    exists: await isDirectory(runtimeRoot)
  };
};

const defaultConfig = (): PersistedLlamaRuntimeConfig => ({
  selectedVersion: "",
  updatedAt: new Date().toISOString()
});

const readConfig = async (): Promise<PersistedLlamaRuntimeConfig> => {
  try {
    const parsed = await selectionFile.read() as Partial<PersistedLlamaRuntimeConfig>;
    return {
      selectedVersion: typeof parsed.selectedVersion === "string" ? parsed.selectedVersion.trim() : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString()
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultConfig();
    }
    throw error;
  }
};

const saveConfig = (config: PersistedLlamaRuntimeConfig) => selectionFile.write(config);

const scanVersions = async (runtimeRoot: string): Promise<LlamaRuntimeVersion[]> => {
  const entries = await fs.readdir(runtimeRoot, { withFileTypes: true });
  const versions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const directoryPath = path.join(runtimeRoot, entry.name);
      const serverPath = path.join(directoryPath, "llama-server.exe");
      if (!(await isFile(serverPath))) {
        return null;
      }

      return {
        version: entry.name,
        directoryPath,
        serverPath
      };
    }));

  return versions
    .filter((version): version is LlamaRuntimeVersion => version !== null)
    .sort((left, right) => left.version.localeCompare(right.version, undefined, {
      numeric: true,
      sensitivity: "base"
    }));
};

const buildSettings = async (): Promise<LlamaRuntimeSettingsResponse> => {
  const config = await readConfig();
  const resolvedRoot = await resolveRuntimeRoot();
  if (!resolvedRoot.exists) {
    return {
      versions: [],
      selectedVersion: config.selectedVersion,
      status: "missing_root",
      message: t("runtime.rootNotFound", { path: resolvedRoot.runtimeRoot }),
      runtimeRoot: resolvedRoot.runtimeRoot,
      configPath: configPath()
    };
  }

  const versions = await scanVersions(resolvedRoot.runtimeRoot);
  if (versions.length === 0) {
    return {
      versions,
      selectedVersion: config.selectedVersion,
      status: "missing_server",
      message: t("runtime.serverNotFound"),
      runtimeRoot: resolvedRoot.runtimeRoot,
      configPath: configPath()
    };
  }

  if (!config.selectedVersion) {
    return {
      versions,
      selectedVersion: "",
      status: "unselected",
      message: t("runtime.selectVersion"),
      runtimeRoot: resolvedRoot.runtimeRoot,
      configPath: configPath()
    };
  }

  const selectedExists = versions.some((version) => version.version === config.selectedVersion);
  return {
    versions,
    selectedVersion: config.selectedVersion,
    status: selectedExists ? "available" : "selection_missing",
    ...(!selectedExists ? { message: t("runtime.selectedVersionMissing", { name: config.selectedVersion }) } : {}),
    runtimeRoot: resolvedRoot.runtimeRoot,
    configPath: configPath()
  };
};

const getLlamaRuntimeSettings = async () => buildSettings();

const updateSelectedLlamaRuntime = async (selectedVersion: string) => {
  const normalizedVersion = selectedVersion.trim();
  if (!normalizedVersion) {
    await saveConfig({
      selectedVersion: "",
      updatedAt: new Date().toISOString()
    });
    return buildSettings();
  }
  const currentSettings = await buildSettings();
  if (!currentSettings.versions.some((version) => version.version === normalizedVersion)) {
    throw new Error(t("runtime.versionUnavailable", { name: normalizedVersion || t("common.unselected") }));
  }

  await saveConfig({
    selectedVersion: normalizedVersion,
    updatedAt: new Date().toISOString()
  });
  return buildSettings();
};

return { getLlamaRuntimeSettings, updateSelectedLlamaRuntime };
}
