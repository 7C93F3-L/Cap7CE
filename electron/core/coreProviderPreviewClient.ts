import { requestCoreProviderPreview } from "./coreProviderPreviewHost";
export const cancelledPreview = () => Object.assign(Error("Preview session was cancelled."), { code: "ECANCELED" });
export class CoreProviderPreviewClient<T> {
  private generation = 0; private session?: string;
  constructor(private readonly kind: string, private readonly valid: (value: unknown) => value is T, private readonly failure: (error: unknown) => Error = error => error as Error, private readonly persistent = false, private readonly request = requestCoreProviderPreview) {}
  async open(session: string, ...args: unknown[]): Promise<T> {
    const own = ++this.generation; this.session = session; let succeeded = false;
    try { const value = await this.request(this.kind + ".open", [session, ...args]); if (own !== this.generation) throw cancelledPreview(); if (!this.valid(value)) throw Error("core-preview-invalid-response"); succeeded = true; return value; }
    catch (error) { if (own !== this.generation) throw cancelledPreview(); throw this.failure(error); }
    finally { if (own === this.generation && (!this.persistent || !succeeded)) this.session = undefined; }
  }
  close(session?: string) {
    if (!this.session || session && session !== this.session) return false;
    const previous = this.session; this.generation++; this.session = undefined;
    void this.request(this.kind + ".close", [previous], true).catch(() => undefined); return true;
  }
  guard(session: string) { const own = this.generation; return () => own === this.generation && this.session === session; }
}
export const providerPreviewFailure = (error: unknown, create: (reason: string, message: string) => Error): Error => {
  const value = error as Error & { code?: string }; if (value?.code === "ECANCELED") return value;
  return create(value?.code?.startsWith("preview:") ? value.code.slice(8) : value?.code === "ETIMEDOUT" ? "timedOut" : "failed", value?.message ?? String(error));
};
