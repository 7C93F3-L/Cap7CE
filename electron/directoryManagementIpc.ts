import type { PersistedDirectory } from "./directoryStore";
import type { DirectoryAddRequest, DirectoryAddResult } from "./directoryAddService";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

export interface DirectoryManagementIpcDependencies {
  registrar: IpcRegistrar;
  listDirectories: () => Promise<PersistedDirectory[]>;
  updateDirectoryName: (id: string, name: string) => Promise<PersistedDirectory[]>;
  decorateDirectories: (directories: PersistedDirectory[]) => Promise<PersistedDirectory[]>;
  selectDirectoryCandidates: () => Promise<string[] | null>;
  createCancelledDirectoryAddResult: () => Promise<DirectoryAddResult>;
  addDirectoryCandidates: (request: DirectoryAddRequest) => Promise<DirectoryAddResult>;
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
  addDirectoryCandidates
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
      }
    ]
  });
};
