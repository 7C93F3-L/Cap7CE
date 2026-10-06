import { randomBytes } from "node:crypto";
import type { ComputerSearchAuthorization, ComputerSearchItem } from "./computerSearchTypes";

interface Lease extends ComputerSearchAuthorization { sessionId: string }
interface Failures { items: Set<string>; shellBlocked: boolean; allBlocked: boolean }

// Thumbnail ownership is shorter than query/preview authorization. Never evict a
// live interest to admit another one, and never reuse an old lease for a new owner.
export class ComputerSearchThumbnailLeases {
  private readonly leases = new Map<string, Lease>();
  private readonly failures = new Map<string, Failures>();
  constructor(private readonly resolveItem: (request: ComputerSearchAuthorization) => ComputerSearchItem | null,
    private readonly beginSession: (id: string) => boolean | undefined,
    private readonly cancelSession: (id: string) => boolean | undefined) {}

  acquire(request: ComputerSearchAuthorization): string | null {
    const item = this.resolveItem(request), failures = this.failures.get(request.taskId);
    if (!item || this.leases.size >= 512 || failures?.allBlocked || failures?.items.has(request.authorizationId)
      || (failures?.shellBlocked && (!item.canThumbnail || item.isDirectory))) return null;
    const id = randomBytes(24).toString("base64url"), sessionId = `computer-thumbnail:${id}`;
    if (this.beginSession(sessionId) === false) return null;
    this.leases.set(id, { ...request, sessionId });
    return id;
  }

  session(request: ComputerSearchAuthorization, id: string): string | null {
    const lease = this.leases.get(id);
    return lease?.taskId === request.taskId && lease.authorizationId === request.authorizationId
      && this.resolveItem(request) ? lease.sessionId : null;
  }

  release(taskId: string, id: string): boolean {
    const lease = this.leases.get(id);
    if (!lease || lease.taskId !== taskId) return false;
    this.leases.delete(id);
    this.cancelSession(lease.sessionId);
    return true;
  }

  failed(request: ComputerSearchAuthorization, id: string, error: unknown): void {
    if (!this.session(request, id)) return;
    const code = (error as { code?: string } | null)?.code;
    if (code === "ECANCELED") return;
    const failures = this.failures.get(request.taskId) ?? { items: new Set<string>(), shellBlocked: false, allBlocked: false };
    if (failures.allBlocked) return;
    failures.items.add(request.authorizationId);
    if (failures.items.size >= 512) failures.allBlocked = true;
    const item = this.resolveItem(request);
    if (code === "ETIMEDOUT" && item && (!item.canThumbnail || item.isDirectory)) failures.shellBlocked = true;
    this.failures.set(request.taskId, failures);
  }

  releaseTask(taskId: string): void {
    for (const [id, lease] of this.leases) if (lease.taskId === taskId) this.release(taskId, id);
    this.failures.delete(taskId);
  }
}
