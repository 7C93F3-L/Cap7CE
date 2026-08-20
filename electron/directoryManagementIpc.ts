import type { PersistedDirectory } from "./directoryStore";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

export interface DirectoryManagementIpcDependencies {
  registrar: IpcRegistrar;
  listDirectories: () => Promise<PersistedDirectory[]>;
  updateDirectoryName: (id: string, name: string) => Promise<PersistedDirectory[]>;
  decorateDirectories: (directories: PersistedDirectory[]) => Promise<PersistedDirectory[]>;
}

export const registerDirectoryManagementIpc = ({
  registrar,
  listDirectories,
  updateDirectoryName,
  decorateDirectories
}: DirectoryManagementIpcDependencies): void => {
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
      }
    ]
  });
};
