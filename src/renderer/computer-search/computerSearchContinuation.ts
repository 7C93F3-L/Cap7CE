import type { ComputerSearchPage, ComputerSearchRequest, ComputerSearchNextPageRequest } from "../../../electron/computerSearchTypes";
import { readComputerSearchReplacement } from "./computerSearchResultRefresh";

// Keep signed-cursor validation in Core. Rebuild a stale continuation under a
// new owner; the caller retains the displayed authorization until it succeeds.
export async function readComputerSearchContinuation(api: {
  search(request: ComputerSearchRequest): Promise<ComputerSearchPage>;
  nextPage(request: ComputerSearchNextPageRequest): Promise<ComputerSearchPage>;
}, request: ComputerSearchRequest, taskId: string, cursor: string, loadedCount: number,
isCurrent: () => boolean, rebuild = false) {
  if (!rebuild) {
    try {
      const page = await api.nextPage({ taskId, cursor });
      if (!isCurrent()) return null;
      if (page.nextCursor === cursor || (!page.items.length && page.nextCursor))
        throw new Error("computer-search-pagination-did-not-advance");
      return { page, replaced: false };
    } catch (error) {
      if (!/invalid-cursor|search-task-not-found/.test(String(error))) throw error;
    }
  }
  if (!isCurrent()) return null;
  const page = await readComputerSearchReplacement(api, request, loadedCount + 100, isCurrent);
  return page && isCurrent() ? { page, replaced: true } : null;
}
