import path from "node:path";
import { metadataWorkerPaths } from "../metadataExtraction/metadataWorkerPaths";
import { CoreVisualCacheClient } from "./coreVisualCacheClient";
export function createCorePreviewNodeSession(root: () => string, worker: string, deadlineMs = 30000) {
let client: CoreVisualCacheClient | undefined;
const owner = () => { const executable = metadataWorkerPaths().executable; return client ??= new CoreVisualCacheClient(root(), executable, path.join(path.dirname(executable), worker)); };
const closeCoreProviderPreview = () => { client?.close(); client = undefined; };
process.once("exit", closeCoreProviderPreview);
async function requestCoreProviderPreview(method: string, args: unknown[], passive = false) {
  if (passive && !client) return null; const own = owner(); let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([passive ? own.requestIfActive(method, args) : own.request(method, args), new Promise<never>((_, reject) => { timer = setTimeout(() => { own.close(); if (client === own) client = undefined; reject(Object.assign(Error("Preview processing timed out."), { code: "ETIMEDOUT" })); }, deadlineMs); })]); }
  finally { clearTimeout(timer); }
}
async function releaseCoreProviderPreview() {
  if (!client) return; const own = client, timer = setTimeout(() => { own.close(); if (client === own) client = undefined; }, 10000);
  try { await own.releaseSourceHandles(); } finally { clearTimeout(timer); }
}

return { request: requestCoreProviderPreview, release: releaseCoreProviderPreview, close: closeCoreProviderPreview };
}
