import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export type LlamaRuntimeStatus =
  | "available"
  | "unselected"
  | "missing_root"
  | "missing_server"
  | "selection_missing";

export interface LlamaRuntimeVersion {
  version: string;
  directoryPath: string;
  serverPath: string;
}

export interface LlamaRuntimeSettingsResponse {
  versions: LlamaRuntimeVersion[];
  selectedVersion: string;
  status: LlamaRuntimeStatus;
  message?: string;
  runtimeRoot: string;
  configPath: string;
}

interface PersistedLlamaRuntimeConfig {
  selectedVersion: string;
  updatedAt: string;
}

const configPath = () => path.join(app.getPath("userData"), "config", "llama-runtime.json");

const uniquePaths = (paths: string[]) => [
  ...new Map(paths.map((candidate) => [path.resolve(candidate).toLowerCase(), path.resolve(candidate)])).values()
];

const runtimeRootCandidates = () => {
  if (!app.isPackaged) {
    return uniquePaths([
      path.join(app.getAppPath(), "llama.cpp"),
      path.join(process.cwd(), "llama.cpp")
    ]);
  }

  const executableDirectory = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  return uniquePaths([
    path.resolve(executableDirectory, "..", "llama.cpp"),
    path.join(executableDirectory, "llama.cpp"),
    path.resolve(process.resourcesPath, "..", "..", "llama.cpp")
  ]);
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
  const candidates = runtimeRootCandidates();
  for (const candidate of candidates) {
    if (await isDirectory(candidate)) {
      return {
        runtimeRoot: candidate,
        exists: true
      };
    }
  }

  return {
    runtimeRoot: candidates[0],
    exists: false
  };
};

const defaultConfig = (): PersistedLlamaRuntimeConfig => ({
  selectedVersion: "",
  updatedAt: new Date().toISOString()
});

const readConfig = async (): Promise<PersistedLlamaRuntimeConfig> => {
  try {
    const content = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(content) as Partial<PersistedLlamaRuntimeConfig>;
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

const saveConfig = async (config: PersistedLlamaRuntimeConfig) => {
  const targetPath = configPath();
  const temporaryPath = `${targetPath}.tmp`;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, targetPath);
};

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

export const getLlamaRuntimeSettings = async () => buildSettings();

export const updateSelectedLlamaRuntime = async (selectedVersion: string) => {
  const normalizedVersion = selectedVersion.trim();
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

import { t } from "./localization";
