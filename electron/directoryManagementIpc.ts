import type { PersistedDirectory } from "./directoryStore";
import type { DirectoryAddRequest, DirectoryAddResult } from "./directoryAddService";
import type { ImageScanResult, ScannedFile, ScannedImageFile } from "./imageScanner";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

export interface DirectoryManagementIpcDependencies {
  registrar: IpcRegistrar;
  listDirectories: () => Promise<PersistedDirectory[]>;
  updateDirectoryName: (id: string, name: string) => Promise<PersistedDirectory[]>;
  decorateDirectories: (directories: PersistedDirectory[]) => Promise<PersistedDirectory[]>;
  selectDirectoryCandidates: () => Promise<string[] | null>;
  createCancelledDirectoryAddResult: () => Promise<DirectoryAddResult>;
  addDirectoryCandidates: (request: DirectoryAddRequest) => Promise<DirectoryAddResult>;
  scanDirectories: (directories: PersistedDirectory[]) => Promise<ImageScanResult>;
  seedScanSnapshot: (directories: PersistedDirectory[], scanResult: ImageScanResult) => void;
  writeScannedFiles: (
    directoryIds: string[],
    images: ScannedImageFile[],
    scannedAt: string,
    files: ScannedFile[]
  ) => Promise<unknown>;
  applyDirectoryFileCounts: (counts: Record<string, number>) => Promise<PersistedDirectory[]>;
}

const normalizeDirectoryAddRequest = (value: unknown): DirectoryAddRequest => {
  if (!value || typeof value !== "object") {
    return { candidates: [] };
  }
  const candidate = value as { candidates?: unknown; conflictResolution?: unknown };
  return {
    candidates: Array.isArray(candidate.candidates) ? candidate.candidates as string[] : [],
    conflictResolution: candidate.conflictResolution === "replace-existing" ? "replace-existing" : "prompt"
  };
};

export const registerDirectoryManagementIpc = ({
  registrar,
  listDirectories,
  updateDirectoryName,
  decorateDirectories,
  selectDirectoryCandidates,
  createCancelledDirectoryAddResult,
  addDirectoryCandidates,
  scanDirectories,
  seedScanSnapshot,
  writeScannedFiles,
  applyDirectoryFileCounts
}: DirectoryManagementIpcDependencies): void => {
  const decorateDirectoryAddResult = async (result: DirectoryAddResult): Promise<DirectoryAddResult> => ({
    ...result,
    directories: await decorateDirectories(result.directories)
  });

  registerIpcDomain({
    registrar,
    registrations: [
      {
        kind: "handle",
        channel: "directories:list",
        listener: async () => decorateDirectories(await listDirectories())
      },
      {
        kind: "handle",
        channel: "directories:updateName",
        listener: async (_event, id: string, name: string) => (
          decorateDirectories(await updateDirectoryName(id, name))
        )
      },
      {
        kind: "handle",
        channel: "directories:selectAndAdd",
        listener: async () => {
          const candidates = await selectDirectoryCandidates();
          if (!candidates || candidates.length === 0) {
            return decorateDirectoryAddResult(await createCancelledDirectoryAddResult());
          }
          return decorateDirectoryAddResult(await addDirectoryCandidates({ candidates }));
        }
      },
      {
        kind: "handle",
        channel: "directories:addCandidates",
        listener: async (_event, request: unknown) => (
          decorateDirectoryAddResult(await addDirectoryCandidates(normalizeDirectoryAddRequest(request)))
        )
      },
      {
        kind: "handle",
        channel: "directories:refreshFileCounts",
        listener: async (_event, directoryIds: unknown) => {
          const requestedIds = new Set(
            Array.isArray(directoryIds)
              ? directoryIds.filter((id): id is string => typeof id === "string")
              : []
          );
          const allDirectories = await listDirectories();
          const directories = allDirectories.filter((directory) => requestedIds.has(directory.id));
          if (directories.length === 0) {
            return decorateDirectories(allDirectories);
          }
          const scanResult = await scanDirectories(directories);
          seedScanSnapshot(directories, scanResult);
          await writeScannedFiles(
            directories.map((directory) => directory.id),
            scanResult.images,
            scanResult.scannedAt,
            scanResult.files
          );
          const counts = Object.fromEntries(
            scanResult.summaries.map((summary) => [summary.id, summary.fileCount])
          );
          return decorateDirectories(await applyDirectoryFileCounts(counts));
        }
      }
    ]
  });
};
