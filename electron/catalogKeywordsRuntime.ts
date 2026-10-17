import type { ComputerSearchItem } from "./computerSearchTypes";
import type { CatalogKeywordSnapshot, CatalogKeywordSaveResult } from "../src/shared/catalogKeywordTypes";
import { normalizeKeywordList } from "./keywordRules";
import { readLegacyKeywordPage } from "./catalogLegacyKeywords";

interface Dependencies {
  request: <T>(operation: string, body: Record<string, unknown>, deadline?: number) => Promise<T>;
  start: () => Promise<unknown>; supports: (capability: string) => boolean;
  processId: () => number | undefined; active: () => boolean;
  legacyPage?: typeof readLegacyKeywordPage;
}
const snapshot = (value: unknown): CatalogKeywordSnapshot => {
  const data = value as CatalogKeywordSnapshot;
  if (!data || !Array.isArray(data.keywords) || data.keywords.length > 128
    || data.keywords.some(word => typeof word !== "string" || word.length > 256 || word.includes("\0"))
    || (data.revision !== null && (typeof data.revision !== "string" || !/^\d{1,19}$/.test(data.revision)))) throw Error("catalog-keywords-invalid-response");
  return { keywords: [...data.keywords], revision: data.revision };
};
const identity = (item: ComputerSearchItem) => ({ volumeId: item.volumeId, fileReference: item.fileReference,
  createdFileTimeMilliseconds: item.createdFileTimeMilliseconds ?? (item.createdUtcTicks === null ? null : String(Math.trunc(item.createdUtcTicks / 10000))) });
export function createCatalogKeywordsRuntime(deps: Dependencies) {
  let prepared = "", scope = "", pending: Promise<void> | null = null, pendingKey = "";
  const prepare = async (availableVolumes?: string) => {
    await deps.start();
    if (!deps.active() || !deps.supports("search.manualKeywords") || !deps.supports("keywords.write")) throw Error("catalog-keywords-unavailable");
    if (availableVolumes !== undefined) scope = availableVolumes;
    const key = `${deps.processId()}:${scope}`;
    if (prepared === key) return;
    if (pending && pendingKey === key) return pending;
    const previous = pending;
    pendingKey = key;
    const work = (async () => {
      if (previous) await previous.catch(() => undefined);
      let after = "";
      do {
        if (!deps.active()) throw Error("catalog-keywords-unavailable");
        const page = await (deps.legacyPage ?? readLegacyKeywordPage)(after);
        let entries: typeof page.entries = [], bytes = 0;
        for (const entry of page.entries) {
          const size = Buffer.byteLength(JSON.stringify(entry));
          if (size > 512 * 1024) throw Error("catalog-keywords-legacy-entry-too-large");
          if (bytes + size > 512 * 1024) { await deps.request("keywords.import", { entries }, 30_000); entries = []; bytes = 0; }
          entries.push(entry); bytes += size;
        }
        if (entries.length) await deps.request("keywords.import", { entries }, 30_000);
        if (page.after === null) break;
        after = page.after;
      } while (true);
      prepared = key;
    })();
    pending = work;
    try { await work; } finally { if (pending === work) { pending = null; pendingKey = ""; } }
  };
  return { prepare,
    async read(item: ComputerSearchItem): Promise<CatalogKeywordSnapshot> {
      await prepare(); return snapshot(await deps.request("keywords.read", { identity: identity(item) }));
    },
    async write(item: ComputerSearchItem, keywords: string[], expectedRevision: string | null): Promise<CatalogKeywordSaveResult> {
      await prepare();
      const result = await deps.request<CatalogKeywordSaveResult>("keywords.write", { identity: identity(item), keywords: normalizeKeywordList(keywords), expectedRevision });
      if (typeof result?.saved !== "boolean") throw Error("catalog-keywords-invalid-response");
      return { saved: result.saved, current: snapshot(result.current) };
    }
  };
}
export type CatalogKeywordsApi = ReturnType<typeof createCatalogKeywordsRuntime>;
