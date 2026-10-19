import { randomUUID } from "node:crypto";
import { requestCoreProviderPreview } from "./coreProviderPreviewHost";
import { validTextPreviewReply } from "./coreTextPreviewProjection";
import type { CoreNodeTransport } from "../../src/shared/coreNodeTransport";
import type { SkimTextPreview } from "../../src/shared/textPreviewTypes";
const defaultTransport: CoreNodeTransport = { request: requestCoreProviderPreview, cancel: (method, args) => requestCoreProviderPreview(method, args, true) };
const cancelled = () => Object.assign(Error("Text preview stopped."), { code: "ECANCELED" });
export class CoreTextPreviewClient {
  private readonly jobs = new Map<string, { cancelled: boolean }>();
  constructor(private readonly transport = defaultTransport) {}
  async read(filePath: string): Promise<SkimTextPreview> {
    const id = randomUUID(), job = { cancelled: false }; this.jobs.set(id, job);
    try {
      const reply = await this.transport.request("text.read", [id, filePath]);
      if (job.cancelled) throw cancelled();
      if (!validTextPreviewReply(reply)) throw Error("core-text-preview-invalid-response");
      if (!reply.ok) throw Object.assign(Error(reply.error.message), { code: reply.error.code }); return reply.value;
    } catch (error) { if (job.cancelled) throw cancelled(); throw error; }
    finally { this.jobs.delete(id); }
  }
  cancelAll(): boolean {
    for (const [id, job] of this.jobs) { if (!job.cancelled) { job.cancelled = true; void this.transport.cancel("text.cancel", [id]).catch(() => undefined); } }
    return this.jobs.size > 0;
  }
}
