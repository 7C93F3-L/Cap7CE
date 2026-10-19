import { requestModelKeywords } from "./requestModel";
import { fingerprintKeywordSource } from "./sourceFingerprint";
import { connection, imageData, invalid, requestId, source, timeout } from "./validation";

export class LocalKeywordOwner {
  private readonly jobs = new Map<string, { cancellation: AbortController; result: Promise<string[]> }>();
  private closed = false;
  dispatch(method: string, args: unknown[]): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("local-keywords-unavailable"));
    switch (method) {
      case "localKeywords.fingerprint": if (args.length !== 1) return invalid(); return fingerprintKeywordSource(source(args[0]));
      case "localKeywords.cancel": if (args.length !== 1) return invalid(); return this.cancel(requestId(args[0]));
      case "localKeywords.generate": {
        if (args.length !== 4) return invalid();
        const id = requestId(args[0]);
        if (this.jobs.has(id) || this.jobs.size >= 2) throw new Error("模型请求繁忙，请稍后重试。");
        const target = connection(args[1]), image = imageData(args[2]), deadline = timeout(args[3]);
        const cancellation = new AbortController();
        const result = requestModelKeywords(target, image, cancellation.signal, deadline).finally(() => this.jobs.delete(id));
        this.jobs.set(id, { cancellation, result }); return result;
      }
      default: return invalid();
    }
  }
  close(): void { this.closed = true; for (const job of this.jobs.values()) job.cancellation.abort(); }
  private async cancel(id: string): Promise<void> {
    const job = this.jobs.get(id); if (!job) return;
    job.cancellation.abort(); await job.result.catch(() => undefined);
  }
}
