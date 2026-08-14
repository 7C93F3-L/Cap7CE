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
  const seenRoots = new Set<string>();
  const drives: SkimBrowseEntry[] = [];
  for (const [root] of output.matchAll(/[A-Za-z]:\\/g)) {
    const drive = toDriveEntry(root);
    const key = pathKey(drive.path);
    if (seenRoots.has(key)) {
      continue;
    }
    seenRoots.add(key);
    drives.push(drive);
  }
  return drives.sort((left, right) => left.path.localeCompare(right.path, "en", { sensitivity: "base" }));
};

export const parseWindowsVolumeLabelOutput = (output: string): Map<string, string> => {
  const labels = new Map<string, string>();
  const patterns = [
    /^Volume in drive ([A-Z]) is (.+)$/i,
    /^驱动器\s+([A-Z])\s+中的卷是\s+(.+)$/i,
    /^磁碟機\s+([A-Z])\s+中的磁碟區是\s+(.+)$/i
  ];
  for (const line of output.replace(/^\uFEFF/, "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match) continue;
      labels.set(match[1].toLocaleUpperCase(), match[2].trim());
      break;
    }
  }
  return labels;
};

const fallbackDriveEntries = () => {
  const roots = [path.parse(os.homedir()).root, path.parse(process.cwd()).root].filter(Boolean);
  return parseWindowsDriveOutput(roots.join(" "));
};

export const parseWindowsHiddenNameOutput = (directoryPath: string, output: string): Set<string> => {
  return new Set(output
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => pathKey(path.join(directoryPath, name))));
};

const listHiddenEntryPaths = async (directoryPath: string) => {
  if (process.platform !== "win32") return new Set<string>();
  try {
    const { stdout } = await execFileAsync(process.env.ComSpec || "cmd.exe", ["/d", "/u", "/c", "dir /a:h /b"], {
      cwd: directoryPath,
      encoding: "utf16le",
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 4 * 1024 * 1024
    });
    return parseWindowsHiddenNameOutput(directoryPath, stdout);
  } catch {
    return new Set<string>();
  }
};

const readWindowsVolumeLabels = async (drives: SkimBrowseEntry[]) => {
  const driveLetters = drives
    .map((drive) => drive.path.match(/^([A-Za-z]):\\$/)?.[1]?.toLocaleUpperCase())
    .filter((letter): letter is string => Boolean(letter));
  if (driveLetters.length === 0) return new Map<string, string>();
  const command = `${driveLetters.map((letter) => `vol ${letter}:`).join(" & ")} & exit /b 0`;
  try {
    const { stdout } = await execFileAsync(process.env.ComSpec || "cmd.exe", ["/d", "/u", "/c", command], {
      encoding: "utf16le",
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 1024 * 1024
    });
    return parseWindowsVolumeLabelOutput(stdout);
  } catch {
    return new Map<string, string>();
  }
};

export const listSkimDrives = async (): Promise<SkimBrowseEntry[]> => {
  if (process.platform !== "win32") {
    return fallbackDriveEntries();
  }
  try {
    const fsutilPath = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "fsutil.exe");
    const { stdout } = await execFileAsync(fsutilPath, ["fsinfo", "drives"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 1024 * 1024
    });
    const drives = parseWindowsDriveOutput(stdout);
    if (drives.length === 0) return fallbackDriveEntries();
    const labels = await readWindowsVolumeLabels(drives);
    return drives.map((drive) => ({
      ...drive,
      label: labels.get(drive.path[0].toLocaleUpperCase()) || undefined
    }));
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

const resolveSkimDirectoryPath = async (requestedPath: string): Promise<string> => {
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
  return directoryPath;
};

export const resolveReadableSkimDirectoryPath = async (requestedPath: string): Promise<string> => {
  const directoryPath = await resolveSkimDirectoryPath(requestedPath);
  const directory = await fs.opendir(directoryPath);
  await directory.close();
  return directoryPath;
};

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
  const directoryPath = await resolveSkimDirectoryPath(requestedPath);
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
