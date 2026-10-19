export interface CoreNodeTransport {
  request: (method: string, args: unknown[]) => Promise<unknown>;
  cancel: (method: string, args: unknown[]) => Promise<unknown>;
}
