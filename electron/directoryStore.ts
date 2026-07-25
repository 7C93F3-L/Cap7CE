import { app } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface PersistedDirectory {
  id: string;
  name: string;
  path: string;
  indexedCount: number;
  createdAt: string;
  updatedAt: string;
  lastScannedAt?: string;
  scanStatus?: "pending" | "ready" | "missing" | "error";
  scanError?: string;
}

export interface DirectoryScanSummary {
  id: string;
  indexedCount: number;
  lastScannedAt: string;
  scanStatus: "ready" | "missing" | "error";
  scanError?: string;
}

interface DirectoryConfig {
  version: 1;
  directories: PersistedDirectory[];
}

const configDirectory = () => path.join(app.getPath("userData"), "config");
const configPath = () => path.join(configDirectory(), "directories.json");

const now = () => new Date().toISOString();

const isPersistedDirectory = (value: unknown): value is PersistedDirectory => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as PersistedDirectory;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.path === "string" &&
    typeof candidate.indexedCount === "number" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    (candidate.lastScannedAt === undefined || typeof candidate.lastScannedAt === "string") &&
    (candidate.scanStatus === undefined || candidate.scanStatus === "pending" || candidate.scanStatus === "ready" || candidate.scanStatus === "missing" || candidate.scanStatus === "error") &&
    (candidate.scanError === undefined || typeof candidate.scanError === "string")
  );
};

const normalizeConfig = (value: unknown): DirectoryConfig => {
  if (!value || typeof value !== "object") {
    return { version: 1, directories: [] };
  }

  const candidate = value as Partial<DirectoryConfig>;
  const directories = Array.isArray(candidate.directories) ? candidate.directories.filter(isPersistedDirectory) : [];
  return { version: 1, directories };
};

const readConfig = async (): Promise<DirectoryConfig> => {
  const filePath = configPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { version: 1, directories: [] };
    }

    const backupPath = `${filePath}.corrupt-${Date.now()}`;
    try {
      await fs.copyFile(filePath, backupPath);
    } catch {
      // Keep startup resilient even if the corrupt file cannot be copied.
    }
    return { version: 1, directories: [] };
  }
};

const writeConfig = async (config: DirectoryConfig) => {
  const directory = configDirectory();
  const filePath = configPath();
  const tempPath = `${filePath}.tmp`;

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  await fs.rename(tempPath, filePath);
};

export const listDirectories = async (): Promise<PersistedDirectory[]> => {
  const config = await readConfig();
  return config.directories;
};

export const addDirectory = async (directoryPath: string): Promise<PersistedDirectory[]> => {
  const config = await readConfig();
  const existing = config.directories.find((directory) => directory.path.toLocaleLowerCase() === directoryPath.toLocaleLowerCase());
  if (existing) {
    return config.directories;
  }

  const timestamp = now();
  const directoryName = path.basename(directoryPath) || directoryPath;
  const directory: PersistedDirectory = {
    id: randomUUID(),
    name: directoryName,
    path: directoryPath,
    indexedCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const nextConfig: DirectoryConfig = {
    version: 1,
    directories: [...config.directories, directory]
  };
  await writeConfig(nextConfig);
  return nextConfig.directories;
};

export const updateDirectoryName = async (id: string, name: string): Promise<PersistedDirectory[]> => {
  const trimmedName = name.trim();
  const config = await readConfig();
  if (!trimmedName) {
    return config.directories;
  }

  const nextConfig: DirectoryConfig = {
    version: 1,
    directories: config.directories.map((directory) =>
      directory.id === id
        ? {
            ...directory,
            name: trimmedName,
            updatedAt: now()
          }
        : directory
    )
  };

  await writeConfig(nextConfig);
  return nextConfig.directories;
};

export const deleteDirectory = async (id: string): Promise<PersistedDirectory[]> => {
  const config = await readConfig();
  const nextConfig: DirectoryConfig = {
    version: 1,
    directories: config.directories.filter((directory) => directory.id !== id)
  };
  await writeConfig(nextConfig);
  return nextConfig.directories;
};

export const applyDirectoryScanSummaries = async (summaries: DirectoryScanSummary[]): Promise<PersistedDirectory[]> => {
  const config = await readConfig();
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
  const nextConfig: DirectoryConfig = {
    version: 1,
    directories: config.directories.map((directory) => {
      const summary = summaryById.get(directory.id);
      if (!summary) {
        return directory;
      }

      return {
        ...directory,
        indexedCount: summary.indexedCount,
        lastScannedAt: summary.lastScannedAt,
        scanStatus: summary.scanStatus,
        scanError: summary.scanError,
        updatedAt: summary.lastScannedAt
      };
    })
  };

  await writeConfig(nextConfig);
  return nextConfig.directories;
};
