import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getFileFormatCapability, type FileFormatCapability } from "./formatCapabilities";
import { isPathWithinDirectory } from "./skimPreviewService";

export type SkimBrowseEntryKind = "drive" | "folder" | "file";

export interface SkimBrowseEntry {
  kind: SkimBrowseEntryKind;
  name: string;
  path: string;
  extension: string;
  label?: string;
  size: number | null;
  modifiedAt: string | null;
  withinAddedDirectory: boolean;
  hidden: boolean;
  formatCapability?: FileFormatCapability;
  status: "ready" | "loading" | "error";
  error?: string;
}

export interface SkimBreadcrumb {
  name: string;
  path: string;
}

export interface SkimReadResult {
  currentPath: string | null;
  breadcrumbs: SkimBreadcrumb[];
  entries: SkimBrowseEntry[];
  cancelled: boolean;
}

interface WindowsDriveRecord {
  root?: unknown;
  label?: unknown;
}

const execFileAsync = promisify(execFile);

const pathKey = (value: string) => path.normalize(value).toLocaleLowerCase();

const toDriveEntry = (root: string, label = ""): SkimBrowseEntry => {
  const normalizedRoot = path.parse(path.resolve(root)).root;
  return {
    kind: "drive",
    name: normalizedRoot,
    path: normalizedRoot,
    extension: "",
    label: label.trim() || undefined,
    size: null,
    modifiedAt: null,
    withinAddedDirectory: false,
    hidden: false,
    status: "ready"
  };
};

export const parseWindowsDriveOutput = (output: string): SkimBrowseEntry[] => {
  const trimmed = output.replace(/^\uFEFF/, "").trim();
  if (!trimmed) {
    return [];
  }
  const parsed = JSON.parse(trimmed) as WindowsDriveRecord | WindowsDriveRecord[] | null;
  const records = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  const seenRoots = new Set<string>();
  const drives: SkimBrowseEntry[] = [];
  for (const record of records) {
    if (typeof record.root !== "string" || !/^[A-Za-z]:\\$/.test(record.root)) {
      continue;
    }
    const drive = toDriveEntry(record.root, typeof record.label === "string" ? record.label : "");
    const key = pathKey(drive.path);
    if (seenRoots.has(key)) {
      continue;
    }
    seenRoots.add(key);
    drives.push(drive);
  }
  return drives.sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "base" }));
};

const fallbackDriveEntries = () => {
  const roots = [path.parse(os.homedir()).root, path.parse(process.cwd()).root].filter(Boolean);
  return parseWindowsDriveOutput(JSON.stringify(roots.map((root) => ({ root }))));
};

export const parseWindowsHiddenAttributeOutput = (output: string): Set<string> => {
  const trimmed = output.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return new Set<string>();
  const parsed = JSON.parse(trimmed) as string | string[];
  return new Set((Array.isArray(parsed) ? parsed : [parsed]).filter((value) => typeof value === "string").map(pathKey));
};

const listHiddenEntryPaths = async (directoryPath: string) => {
  if (process.platform !== "win32") return new Set<string>();
  const escapedDirectoryPath = directoryPath.replace(/'/g, "''");
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$OutputEncoding = [Console]::OutputEncoding",
    `$paths = @(Get-ChildItem -LiteralPath '${escapedDirectoryPath}' -Force | Where-Object { ($_.Attributes -band [IO.FileAttributes]::Hidden) -ne 0 } | ForEach-Object { $_.FullName })`,
    "ConvertTo-Json -Compress -InputObject $paths"
  ].join("; ");
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024
    });
    return parseWindowsHiddenAttributeOutput(stdout);
  } catch {
    return new Set<string>();
  }
};

export const listSkimDrives = async (): Promise<SkimBrowseEntry[]> => {
  if (process.platform !== "win32") {
    return fallbackDriveEntries();
  }
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$OutputEncoding = [Console]::OutputEncoding",
    "$drives = @(Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -match '^[A-Za-z]:\\\\$' } | ForEach-Object { [PSCustomObject]@{ root = $_.Root; label = $_.Description } })",
    "ConvertTo-Json -Compress -InputObject $drives"
  ].join("; ");
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 1024 * 1024
    });
    const drives = parseWindowsDriveOutput(stdout);
    return drives.length > 0 ? drives : fallbackDriveEntries();
  } catch {
    return fallbackDriveEntries();
  }
};

export const buildSkimBreadcrumbs = (directoryPath: string): SkimBreadcrumb[] => {
  const normalizedPath = path.normalize(path.resolve(directoryPath));
  const root = path.parse(normalizedPath).root;
  const relativeSegments = normalizedPath.slice(root.length).split(path.sep).filter(Boolean);
  const breadcrumbs: SkimBreadcrumb[] = [{ name: root, path: root }];
  let currentPath = root;
  for (const segment of relativeSegments) {
    currentPath = path.join(currentPath, segment);
    breadcrumbs.push({ name: segment, path: currentPath });
  }
  return breadcrumbs;
};

const cancelledResult = (currentPath: string | null): SkimReadResult => ({
  currentPath,
  breadcrumbs: currentPath ? buildSkimBreadcrumbs(currentPath) : [],
  entries: [],
  cancelled: true
});

export const readSkimLocation = async (
  requestedPath: string | null,
  shouldCancel: () => boolean = () => false,
  addedDirectoryPaths: string[] = []
): Promise<SkimReadResult> => {
  if (shouldCancel()) {
    return cancelledResult(requestedPath);
  }
  if (requestedPath === null) {
    const entries = await listSkimDrives();
    return shouldCancel()
      ? cancelledResult(null)
      : { currentPath: null, breadcrumbs: [], entries, cancelled: false };
  }
  if (typeof requestedPath !== "string" || requestedPath.trim().length === 0 || !path.isAbsolute(requestedPath)) {
    const error = new Error("Invalid skim directory path.") as NodeJS.ErrnoException;
    error.code = "EINVAL";
    throw error;
  }

  const directoryPath = path.normalize(path.resolve(requestedPath));
  const targetStats = await fs.lstat(directoryPath);
  if (targetStats.isSymbolicLink() || !targetStats.isDirectory()) {
    const error = new Error("Skim target is not a readable directory.") as NodeJS.ErrnoException;
    error.code = "ENOTDIR";
    throw error;
  }
  if (shouldCancel()) {
    return cancelledResult(directoryPath);
  }

  const directoryEntries = await fs.readdir(directoryPath, { withFileTypes: true });
  const hiddenEntryPaths = await listHiddenEntryPaths(directoryPath);
  if (shouldCancel()) {
    return cancelledResult(directoryPath);
  }

  const entries: SkimBrowseEntry[] = [];
  for (let index = 0; index < directoryEntries.length; index += 48) {
    if (shouldCancel()) return cancelledResult(directoryPath);
    const batchEntries = await Promise.all(directoryEntries.slice(index, index + 48).map(async (entry) => {
      if (entry.isSymbolicLink()) return null;
      const entryPath = path.join(directoryPath, entry.name);
      try {
        const stats = await fs.lstat(entryPath);
        if (stats.isSymbolicLink()) return null;
        const withinAddedDirectory = addedDirectoryPaths.some((addedPath) => isPathWithinDirectory(entryPath, addedPath));
        if (stats.isDirectory()) {
          return {
            kind: "folder",
            name: entry.name,
            path: entryPath,
            extension: "",
            size: null,
            modifiedAt: stats.mtime.toISOString(),
            withinAddedDirectory,
            hidden: hiddenEntryPaths.has(pathKey(entryPath)) || (process.platform !== "win32" && entry.name.startsWith(".")),
            status: "ready"
          } satisfies SkimBrowseEntry;
        }
        if (!stats.isFile()) return null;
        const extension = path.extname(entry.name).toLocaleLowerCase();
        const formatCapability = getFileFormatCapability(extension);
        return {
          kind: "file",
          name: entry.name,
          path: entryPath,
          extension,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          withinAddedDirectory,
          hidden: hiddenEntryPaths.has(pathKey(entryPath)) || (process.platform !== "win32" && entry.name.startsWith(".")),
          ...(formatCapability?.canBrowse ? { formatCapability } : {}),
          status: "ready"
        } satisfies SkimBrowseEntry;
      } catch {
        return null;
      }
    }));
    for (const entry of batchEntries) {
      if (entry) entries.push(entry);
    }
  }

  entries.sort((left, right) => {
    const kindOrder = left.kind === right.kind ? 0 : left.kind === "folder" ? -1 : 1;
    return kindOrder || left.name.localeCompare(right.name, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
  });
  return {
    currentPath: directoryPath,
    breadcrumbs: buildSkimBreadcrumbs(directoryPath),
    entries,
    cancelled: false
  };
};
