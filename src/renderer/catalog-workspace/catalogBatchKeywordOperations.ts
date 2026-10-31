import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import type { CatalogKeywordSnapshot } from "../../shared/catalogKeywordTypes";
import { applyKeywordBatchDelta } from "../../../core/node/localKeywords/policy/keywordRules";
import { catalogKeywordKey } from "./catalogKeywordIdentity";

export interface BatchKeywordSnapshot extends CatalogKeywordSnapshot { key: string; }
export async function mapKeywordFiles<T, R>(items: T[], operation: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    for (;;) { const index = next++; if (index >= items.length) return; results[index] = await operation(items[index]); }
  }));
  return results;
}
export async function readBatchKeywords(items: ComputerSearchItem[], taskId: string, active = () => true) {
  let failed = false;
  return mapKeywordFiles(items, async item => {
    if (failed || !active()) throw Error("keyword-read-retired");
    try { return { ...await window.cap7ce!.computerSearch.readKeywords({ taskId, authorizationId: item.authorizationId }), key: catalogKeywordKey(item) }; }
    catch (error) { failed = true; throw error; }
  });
}
export async function saveBatchKeywords(snapshots: BatchKeywordSnapshot[], common: string[], target: string[],
  resolve: (key: string) => { taskId: string; authorizationId: string } | null) {
  return mapKeywordFiles(snapshots, async original => {
    let current: CatalogKeywordSnapshot = original;
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const authorization = resolve(original.key); if (!authorization) return false;
        const keywords = applyKeywordBatchDelta(current.keywords, common, target);
        const result = await window.cap7ce!.computerSearch.saveKeywords({ ...authorization, keywords, expectedRevision: current.revision });
        if (result.saved) return true;
        current = result.current;
      }
    } catch { /* Keep the editor draft and report per-file failure to its owner. */ }
    return false;
  });
}
