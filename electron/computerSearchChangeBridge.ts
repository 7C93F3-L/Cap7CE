type Ipc = {
  on(channel: string, listener: (event: unknown, value: unknown) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, value: unknown) => void): unknown;
  send(channel: string, value: boolean): void;
};

// A Renderer shares one subscription across mounted views. The public payload
// is a revision only, with no paths, Reader protocol or extraction capabilities.
export function createComputerSearchChangeBridge(ipc: Ipc) {
  const callbacks = new Set<(revision: number) => void>();
  const listener = (_event: unknown, revision: unknown) => {
    if (!Number.isSafeInteger(revision) || Number(revision) < 0) return;
    for (const callback of [...callbacks]) { try { callback(revision as number); } catch { /* Other views still receive the event. */ } }
  };
  return { onCatalogChanged(callback: (revision: number) => void) {
    const selected = (revision: number) => callback(revision);
    callbacks.add(selected);
    if (callbacks.size === 1) { ipc.on("computerSearch:catalogChanged", listener); ipc.send("computerSearch:watchCatalog", true); }
    let disposed = false;
    return () => {
      if (disposed) return; disposed = true; callbacks.delete(selected);
      if (!callbacks.size) { ipc.removeListener("computerSearch:catalogChanged", listener); ipc.send("computerSearch:watchCatalog", false); }
    };
  } };
}
