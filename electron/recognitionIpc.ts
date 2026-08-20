import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";

interface RecognitionCleanupResult {
  errors: string[];
  removedFilePaths: string[];
}

export interface RecognitionIpcDependencies {
  registrar: IpcRegistrar;
  getQualityStats: () => Promise<unknown>;
  beginRecognition: () => void;
  cleanupMissingFiles: () => Promise<RecognitionCleanupResult>;
  reportCleanupWarning: (message: string) => void;
  runRecognition: () => Promise<Record<string, unknown>>;
  cancelRecognition: () => void;
}

export const registerRecognitionIpc = ({
  registrar,
  getQualityStats,
  beginRecognition,
  cleanupMissingFiles,
  reportCleanupWarning,
  runRecognition,
  cancelRecognition
}: RecognitionIpcDependencies): void => {
  registerIpcDomain({
    registrar,
    registrations: [
      {
        kind: "handle",
        channel: "index:qualityStats",
        listener: () => getQualityStats()
      },
      {
        kind: "handle",
        channel: "index:continueRecognition",
        listener: async () => {
          beginRecognition();
          const cleanupResult = await cleanupMissingFiles();
          cleanupResult.errors.forEach(reportCleanupWarning);
          return {
            ...await runRecognition(),
            removedFilePaths: cleanupResult.removedFilePaths
          };
        }
      },
      {
        kind: "handle",
        channel: "index:cancelRecognition",
        listener: () => {
          cancelRecognition();
          return true;
        }
      }
    ]
  });
};
