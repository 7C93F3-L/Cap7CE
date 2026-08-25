import fs from "node:fs/promises";
import path from "node:path";
import {
  createPersistedDirectory,
  listDirectories,
  replaceDirectories,
  type PersistedDirectory
} from "./directoryStore";

export type DirectoryAddConflictResolution = "prompt" | "replace-existing";

export interface DirectoryAddRequest {
  candidates: string[];
  conflictResolution?: DirectoryAddConflictResolution;
}

export type DirectoryAddIgnoreReason =
  | "drive-root"
  | "duplicate-candidate"
  | "covered-by-candidate"
  | "already-added"
  | "covered-by-existing";

export interface DirectoryAddIgnoredItem {
  inputPath: string;
  directoryPath?: string;
  reason: DirectoryAddIgnoreReason;
  existingDirectory?: PersistedDirectory;
}

export type DirectoryAddFailureReason = "invalid-candidate" | "not-found" | "unavailable";

export interface DirectoryAddFailure {
  inputPath: string;
  reason: DirectoryAddFailureReason;
  message: string;
}

export interface DirectoryAddConflict {
  candidatePath: string;
  existingDirectories: PersistedDirectory[];
}

export interface DirectoryAddReplacement {
  directory: PersistedDirectory;
  replacedDirectories: PersistedDirectory[];
}

export interface DirectoryAddResult {
  directories: PersistedDirectory[];
  added: PersistedDirectory[];
  ignored: DirectoryAddIgnoredItem[];
  conflicts: DirectoryAddConflict[];
  replacements: DirectoryAddReplacement[];
  failures: DirectoryAddFailure[];
  cancelled: boolean;
}

interface ResolvedCandidate {
  inputPath: string;
  directoryPath: string;
  key: string;
}

const normalizeDirectoryPath = (directoryPath: string) => path.normalize(path.resolve(directoryPath));
const pathKey = (directoryPath: string) => normalizeDirectoryPath(directoryPath).toLocaleLowerCase();

const isSameOrDescendant = (parentPath: string, candidatePath: string) => {
  const relativePath = path.relative(pathKey(parentPath), pathKey(candidatePath));
  return relativePath === "" || (
    relativePath !== ".."
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
  );
};

const isDriveRoot = (directoryPath: string) => {
  const normalizedPath = normalizeDirectoryPath(directoryPath);
  return pathKey(normalizedPath) === pathKey(path.parse(normalizedPath).root);
};

const resolveCandidate = async (inputPath: string): Promise<ResolvedCandidate> => {
  const resolvedInputPath = path.resolve(inputPath);
  const stats = await fs.stat(resolvedInputPath);
  const directoryPath = normalizeDirectoryPath(stats.isDirectory() ? resolvedInputPath : path.dirname(resolvedInputPath));
  return { inputPath, directoryPath, key: pathKey(directoryPath) };
};

const failureFromError = (inputPath: string, error: unknown): DirectoryAddFailure => {
  const code = (error as NodeJS.ErrnoException).code;
  return {
    inputPath,
    reason: code === "ENOENT" ? "not-found" : "unavailable",
    message: error instanceof Error ? error.message : String(error)
  };
};

const collapseCandidateDirectories = (
  candidates: ResolvedCandidate[],
  ignored: DirectoryAddIgnoredItem[]
) => {
  const uniqueCandidates: ResolvedCandidate[] = [];
  const seenKeys = new Set<string>();
  for (const candidate of candidates) {
    if (seenKeys.has(candidate.key)) {
      ignored.push({
        inputPath: candidate.inputPath,
        directoryPath: candidate.directoryPath,
        reason: "duplicate-candidate"
      });
      continue;
    }
    seenKeys.add(candidate.key);
    uniqueCandidates.push(candidate);
  }

  uniqueCandidates.sort((left, right) => left.directoryPath.length - right.directoryPath.length);
  const collapsed: ResolvedCandidate[] = [];
  for (const candidate of uniqueCandidates) {
    const coveringCandidate = collapsed.find((parent) => isSameOrDescendant(parent.directoryPath, candidate.directoryPath));
    if (coveringCandidate) {
      ignored.push({
        inputPath: candidate.inputPath,
        directoryPath: candidate.directoryPath,
        reason: "covered-by-candidate"
      });
      continue;
    }
    collapsed.push(candidate);
  }
  return collapsed;
};

const addDirectoryCandidatesInternal = async (request: DirectoryAddRequest): Promise<DirectoryAddResult> => {
  const existingDirectories = await listDirectories();
  const ignored: DirectoryAddIgnoredItem[] = [];
  const failures: DirectoryAddFailure[] = [];
  const resolvedCandidates: ResolvedCandidate[] = [];

  for (const rawCandidate of request.candidates) {
    if (typeof rawCandidate !== "string" || rawCandidate.trim().length === 0) {
      failures.push({
        inputPath: typeof rawCandidate === "string" ? rawCandidate : "",
        reason: "invalid-candidate",
        message: "Directory candidate must be a non-empty path."
      });
      continue;
    }

    try {
      const candidate = await resolveCandidate(rawCandidate.trim());
      if (isDriveRoot(candidate.directoryPath)) {
        ignored.push({
          inputPath: candidate.inputPath,
          directoryPath: candidate.directoryPath,
          reason: "drive-root"
        });
        continue;
      }
      resolvedCandidates.push(candidate);
    } catch (error) {
      failures.push(failureFromError(rawCandidate, error));
    }
  }

  const candidates = collapseCandidateDirectories(resolvedCandidates, ignored);
  const conflicts: DirectoryAddConflict[] = [];
  const candidatesToAdd: ResolvedCandidate[] = [];
  const existingIdsToReplace = new Set<string>();
  const replacedByCandidateKey = new Map<string, PersistedDirectory[]>();

  for (const candidate of candidates) {
    const exactMatch = existingDirectories.find((directory) => pathKey(directory.path) === candidate.key);
    if (exactMatch) {
      ignored.push({
        inputPath: candidate.inputPath,
        directoryPath: candidate.directoryPath,
        reason: "already-added",
        existingDirectory: exactMatch
      });
      continue;
    }

    const coveringExisting = existingDirectories.find((directory) => isSameOrDescendant(directory.path, candidate.directoryPath));
    if (coveringExisting) {
      ignored.push({
        inputPath: candidate.inputPath,
        directoryPath: candidate.directoryPath,
        reason: "covered-by-existing",
        existingDirectory: coveringExisting
      });
      continue;
    }

    const coveredExisting = existingDirectories.filter((directory) => isSameOrDescendant(candidate.directoryPath, directory.path));
    if (coveredExisting.length > 0 && request.conflictResolution !== "replace-existing") {
      conflicts.push({ candidatePath: candidate.directoryPath, existingDirectories: coveredExisting });
      continue;
    }

    coveredExisting.forEach((directory) => existingIdsToReplace.add(directory.id));
    replacedByCandidateKey.set(candidate.key, coveredExisting);
    candidatesToAdd.push(candidate);
  }

  const added = candidatesToAdd.map((candidate) => createPersistedDirectory(candidate.directoryPath));
  const replacements = added.flatMap((directory) => {
    const replacedDirectories = replacedByCandidateKey.get(pathKey(directory.path)) ?? [];
    return replacedDirectories.length > 0 ? [{ directory, replacedDirectories }] : [];
  });
  const directories = added.length > 0
    ? await replaceDirectories([
        ...existingDirectories.filter((directory) => !existingIdsToReplace.has(directory.id)),
        ...added
      ])
    : existingDirectories;

  return { directories, added, ignored, conflicts, replacements, failures, cancelled: false };
};

let addQueue: Promise<void> = Promise.resolve();

export const addDirectoryCandidates = (request: DirectoryAddRequest): Promise<DirectoryAddResult> => {
  const task = addQueue.then(() => addDirectoryCandidatesInternal(request));
  addQueue = task.then(() => undefined, () => undefined);
  return task;
};

export const createCancelledDirectoryAddResult = async (): Promise<DirectoryAddResult> => ({
  directories: await listDirectories(),
  added: [],
  ignored: [],
  conflicts: [],
  replacements: [],
  failures: [],
  cancelled: true
});
