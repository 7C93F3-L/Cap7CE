import { randomUUID } from "node:crypto";
import type { CoreNodeTransport } from "../../src/shared/coreNodeTransport";
import type { SkimPreviewInfo, SkimFolderStats, FolderStatsOptions, FolderStatsSnapshot } from "../../src/shared/sourceInformationTypes";
const transport = async (): Promise<CoreNodeTransport> => { const service = await import("../visualCacheService"); return { request: service.requestVisualCacheOwner, cancel: service.requestActiveVisualCacheOwner }; };
const validStats = (value: unknown): value is SkimFolderStats => !!value && typeof value === "object" && ["fileCount", "folderCount", "totalSize", "skippedCount"].every(key => Number.isSafeInteger((value as Record<string, unknown>)[key]) && Number((value as Record<string, unknown>)[key]) >= 0) && ["scanning", "completed", "cancelled"].includes((value as SkimFolderStats).status);
const validSnapshot = (value: unknown): value is FolderStatsSnapshot => !!value && typeof value === "object" && Number.isSafeInteger((value as FolderStatsSnapshot).sequence) && (value as FolderStatsSnapshot).sequence >= 0 && typeof (value as FolderStatsSnapshot).done === "boolean" && validStats((value as FolderStatsSnapshot).stats);
export async function inspectCoreSource(path: string, kind: "file" | "folder", added: string[], injected?: CoreNodeTransport): Promise<SkimPreviewInfo> {
  const value = await (injected ?? await transport()).request("sourceInfo.inspect", [path, kind, added]) as SkimPreviewInfo;
  if (!value || value.kind !== kind || typeof value.name !== "string" || typeof value.path !== "string" || typeof value.extension !== "string" || !Number.isSafeInteger(value.size) || value.size < 0 || typeof value.modifiedAt !== "string" || typeof value.withinAddedDirectory !== "boolean") throw Error("core-source-info-invalid-response"); return value;
}
export function createCoreFolderStatsTask<T extends { path: string }>(identity: T, options: FolderStatsOptions = {}, injected?: CoreNodeTransport) {
  const id = randomUUID(); let cancelled = false, sent = false, connection: CoreNodeTransport | undefined, work: Promise<SkimFolderStats> | undefined;
  const cancel = () => { cancelled = true; if (sent) void connection!.cancel("sourceInfo.cancel", [id]).catch(() => undefined); };
  return { ...identity, get cancelled() { return cancelled; }, set cancelled(value: boolean) { if (value) cancel(); },
    collect(onProgress: (stats: SkimFolderStats) => void, shouldCancel: () => boolean = () => cancelled): Promise<SkimFolderStats> {
      return work ??= (async () => {
        let stats: SkimFolderStats = { fileCount: 0, folderCount: 0, totalSize: 0, skippedCount: 0, status: "scanning" };
        const emit = () => { try { onProgress({ ...stats }); } catch { /* A retired view cannot revoke the Core task's cleanup. */ } };
        try {
          if (cancelled || shouldCancel()) { stats.status = "cancelled"; emit(); return stats; }
          connection = injected ?? await transport(); if (cancelled || shouldCancel()) { stats.status = "cancelled"; emit(); return stats; }
          sent = true; let reply = await connection.request("sourceInfo.start", [id, identity.path, options]);
          while (true) {
            if (!validSnapshot(reply)) throw Error("core-source-info-invalid-response"); stats = { ...reply.stats };
            if (cancelled || shouldCancel()) { cancel(); stats.status = "cancelled"; } emit();
            if (reply.done) return stats; reply = await connection.request("sourceInfo.watch", [id, reply.sequence]);
          }
        } catch { stats = { ...stats, status: "cancelled", skippedCount: stats.skippedCount + (cancelled ? 0 : 1) }; emit(); return stats; }
        finally { if (sent) await connection!.cancel("sourceInfo.release", [id]).catch(() => undefined); }
      })();
    }
  };
}
