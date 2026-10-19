import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CoreNodeTransport } from "../../src/shared/coreNodeTransport";
import type { DirectoryBrowseOptions, DirectoryBrowsePage } from "../../src/shared/directoryBrowseTypes";
import type { CoreSearchPage } from "./coreProductProtocolTypes";
interface Session { id: string; root: string; volumeId: string; cancelled: boolean; transport?: CoreNodeTransport; }
const transport = async (): Promise<CoreNodeTransport> => { const service = await import("../visualCacheService"); return { request: service.requestVisualCacheOwner, cancel: service.requestActiveVisualCacheOwner }; };
export class CoreDirectoryBrowseClient {
  private readonly sessions = new Map<string, Session>();
  constructor(private readonly connect = transport) {}
  has(taskId: string) { return this.sessions.has(taskId); }
  private convert(session: Session, value: unknown): CoreSearchPage {
    const page = value as DirectoryBrowsePage;
    if (!page || !Array.isArray(page.entries) || page.entries.length > 100 || typeof page.isComplete !== "boolean"
      || !(page.nextCursor === null || typeof page.nextCursor === "string") || page.isComplete !== (page.nextCursor === null)) throw Error("directory-browse-invalid-response");
    return { items: page.entries.map(item => {
      if (!item || !["file", "folder"].includes(item.kind) || typeof item.name !== "string" || typeof item.path !== "string" || typeof item.extension !== "string"
        || path.dirname(path.normalize(item.path)).toLowerCase() !== session.root.toLowerCase() || path.basename(item.path) !== item.name
        || item.size !== null && (!Number.isSafeInteger(item.size) || item.size < 0)
        || item.modifiedAt !== null && !Number.isFinite(Date.parse(item.modifiedAt))) throw Error("directory-browse-invalid-response");
      const modified = item.modifiedAt ? (BigInt(Date.parse(item.modifiedAt)) + 11644473600000n) * 10000n : null;
      return { id: item.path.toLowerCase(), name: item.name, relativePath: path.relative(path.parse(session.root).root, item.path), extension: item.extension,
        isDirectory: item.kind === "folder", volumeId: session.volumeId, fileReference: typeof item.fileReference === "string" && /^[0-9A-F]{16}$/.test(item.fileReference) ? item.fileReference : "", sizeBytes: item.size, modifiedUtcTicks: modified === null ? null : Number(modified), createdUtcTicks: null, attributes: item.hidden ? 2 : 0 };
    }), nextCursor: page.nextCursor, isComplete: page.isComplete, catalogRevision: 0 };
  }
  async start(taskId: string, root: string, volumeId: string, options: DirectoryBrowseOptions): Promise<CoreSearchPage> {
    const session: Session = { id: randomUUID(), root: path.normalize(path.resolve(root)), volumeId, cancelled: false }; this.sessions.set(taskId, session);
    try {
      const connection = await this.connect(); session.transport = connection;
      if (session.cancelled) throw Error("search-cancelled");
      const page = await connection.request("directoryBrowse.start", [session.id, session.root, options]);
      if (session.cancelled) throw Error("search-cancelled");
      return this.convert(session, page);
    } catch (error) { await this.cancel(taskId); throw error; }
  }
  async next(taskId: string, cursor: string) {
    const session = this.sessions.get(taskId); if (!session || session.cancelled || !session.transport) throw Error("search-task-not-found");
    const page = await session.transport.request("directoryBrowse.next", [session.id, cursor])
      .catch(error => { throw /directory-browse-invalid-request/.test(String(error)) ? Error("invalid-cursor") : error; });
    if (session.cancelled) throw Error("search-cancelled"); return this.convert(session, page);
  }
  async cancel(taskId: string) {
    const session = this.sessions.get(taskId); if (!session) return false;
    session.cancelled = true; this.sessions.delete(taskId);
    if (session.transport) await session.transport.cancel("directoryBrowse.cancel", [session.id]).catch(() => undefined);
    return true;
  }
  async close() { await Promise.all([...this.sessions.keys()].map(id => this.cancel(id))); }
}
