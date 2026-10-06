import type { CoreProtocolClient } from "./coreProtocolClient";

export type CoreAbortableClient = Pick<CoreProtocolClient, "request"> & Partial<Pick<CoreProtocolClient, "startRequest" | "cancel">>;

// The authenticated session owns requests. On abort, wait for its targeted
// cancellation/response before the product owner can dispose the shared Host.
export const requestCore = async <T>(client: CoreAbortableClient, operation: string,
  body: Record<string, unknown>, deadline: number, signal?: AbortSignal): Promise<T> => {
  signal?.throwIfAborted();
  if (!signal || !client.startRequest || !client.cancel) {
    const response = await client.request<T>(operation, body, deadline);
    signal?.throwIfAborted(); return response;
  }
  const pending = client.startRequest<T>(operation, body, deadline);
  const abort = () => { void client.cancel!(pending.requestId).catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  try { const response = await pending.response; signal.throwIfAborted(); return response; }
  finally { signal.removeEventListener("abort", abort); }
};
