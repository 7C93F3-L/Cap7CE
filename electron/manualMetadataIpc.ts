import type { IpcMainInvokeEvent } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { PersistedDirectory } from "./directoryStore";
import { getFileFormatCapability } from "./formatCapabilities";
import type { ScannedImageFile } from "./imageScanner";
import { registerIpcDomain, type IpcRegistrar } from "./ipcRegistration";
import { formatKeywordText, normalizeKeywordList, parseKeywordText } from "./keywordRules";
import type { KeywordBatchUpdateRequest, KeywordBatchUpdateResult } from "./keywordTypes";
import type { TranslationKey, TranslationParameters } from "./localization";
import type { ManualKeywordBatchTarget } from "./sqliteImageIndex";

export interface ManualMetadataIpcDependencies {
  registrar: IpcRegistrar;
  isBatchSenderAllowed: (event: IpcMainInvokeEvent) => boolean;
  listDirectories: () => Promise<PersistedDirectory[]>;
  upsertVisualMetadata: (file: ScannedImageFile, caption: string, keywords: string[], updatedAt: string) => Promise<void>;
  upsertFileKeywords: (file: ScannedImageFile, keywords: string[], updatedAt: string) => Promise<void>;
  updateKeywordsBatch: (
    targets: ManualKeywordBatchTarget[],
    initialCommonKeywords: string[],
    targetKeywordText: string
  ) => Promise<string[]>;
  translate: (key: TranslationKey, parameters?: TranslationParameters) => string;
  now?: () => Date;
}

const resolveManualMetadataFile = async (
  filePath: string,
  directories: PersistedDirectory[],
  translate: ManualMetadataIpcDependencies["translate"]
): Promise<ScannedImageFile> => {
  const resolvedFilePath = path.resolve(filePath);
  const ownerDirectory = directories
    .filter((directory) => {
      const relativePath = path.relative(path.resolve(directory.path), resolvedFilePath);
      return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
    })
    .sort((left, right) => right.path.length - left.path.length)[0];
  if (!ownerDirectory) {
    throw new Error(translate("error.fileOutsideAddedDirectories"));
  }

  const sourceStat = await fs.stat(resolvedFilePath);
  if (!sourceStat.isFile()) {
    throw new Error(translate("error.fileMissingOrStale"));
  }

  return {
    directory_id: ownerDirectory.id,
    directory_path: ownerDirectory.path,
    file_path: resolvedFilePath,
    file_name: path.basename(resolvedFilePath),
    file_size: sourceStat.size,
    created_at: sourceStat.birthtime.toISOString(),
    modified_at: sourceStat.mtime.toISOString(),
    modified_ms: sourceStat.mtimeMs
  };
};

export const registerManualMetadataIpc = ({
  registrar,
  isBatchSenderAllowed,
  listDirectories,
  upsertVisualMetadata,
  upsertFileKeywords,
  updateKeywordsBatch,
  translate,
  now = () => new Date()
}: ManualMetadataIpcDependencies): void => {
  registerIpcDomain({
    registrar,
    registrations: [
      {
        kind: "handle",
        channel: "index:updateManualMetadata",
        listener: async (_event, filePath: string, caption: string, keywordText: string) => {
          if (typeof filePath !== "string" || !filePath.trim()) {
            throw new Error(translate("error.invalidFile"));
          }
          if (typeof caption !== "string" || typeof keywordText !== "string") {
            throw new Error(translate("error.invalidMetadata"));
          }
          const capability = getFileFormatCapability(path.extname(filePath).toLowerCase());
          if (!capability?.canSearch) {
            throw new Error(translate("error.invalidFile"));
          }
          const file = await resolveManualMetadataFile(filePath, await listDirectories(), translate);
          const normalizedKeywords = parseKeywordText(keywordText);
          const updatedAt = now().toISOString();
          if (capability.canAIIndex) {
            await upsertVisualMetadata(file, caption.trim(), normalizedKeywords, updatedAt);
          } else {
            await upsertFileKeywords(file, normalizedKeywords, updatedAt);
          }
          return true;
        }
      },
      {
        kind: "handle",
        channel: "index:updateKeywordsBatch",
        listener: async (event, request: KeywordBatchUpdateRequest): Promise<KeywordBatchUpdateResult> => {
          const totalCount = Array.isArray(request?.targets) ? request.targets.length : 0;
          const normalizedKeywordText = typeof request?.targetKeywordText === "string"
            ? formatKeywordText(parseKeywordText(request.targetKeywordText))
            : "";
          const failureResult = (error: unknown): KeywordBatchUpdateResult => ({
            success: false,
            totalCount,
            failedCount: totalCount,
            errorMessage: error instanceof Error ? error.message : translate("error.batchKeywordFailed"),
            normalizedKeywordText
          });

          try {
            if (!isBatchSenderAllowed(event)) {
              throw new Error(translate("error.invalidBatchKeywordSource"));
            }
            if (!Array.isArray(request.targets) || request.targets.length === 0) {
              throw new Error(translate("error.noBatchKeywordSelection"));
            }
            if (!Array.isArray(request.initialCommonKeywords) || typeof request.targetKeywordText !== "string") {
              throw new Error(translate("error.invalidBatchKeywordParameters"));
            }

            const seenTargets = new Set<string>();
            const directories = await listDirectories();
            const targets = await Promise.all(request.targets.map(async (target) => {
              if (typeof target?.filePath !== "string" || !target.filePath.trim()) {
                throw new Error(translate("error.invalidBatchKeywordTarget"));
              }
              const filePath = path.resolve(target.filePath);
              const capability = getFileFormatCapability(path.extname(filePath).toLowerCase());
              if (!capability?.canSearch) {
                throw new Error(translate("error.unsupportedFile", { path: target.filePath }));
              }
              const targetKey = filePath.toLowerCase();
              if (seenTargets.has(targetKey)) {
                throw new Error(translate("error.duplicateBatchKeywordTarget"));
              }
              seenTargets.add(targetKey);
              return {
                file: await resolveManualMetadataFile(filePath, directories, translate),
                resultKind: capability.canAIIndex ? "visual" as const : "file" as const
              };
            }));

            const normalizedTargetKeywords = await updateKeywordsBatch(
              targets,
              normalizeKeywordList(request.initialCommonKeywords),
              request.targetKeywordText
            );
            return {
              success: true,
              totalCount,
              failedCount: 0,
              errorMessage: "",
              normalizedKeywordText: formatKeywordText(normalizedTargetKeywords)
            };
          } catch (error) {
            return failureResult(error);
          }
        }
      }
    ]
  });
};
