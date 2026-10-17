import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ComputerSearchRuntime } from "./computerSearchRuntime";
import type { ComputerSearchItem } from "./computerSearchTypes";
import type { CatalogKeywordBatchSource } from "../src/shared/catalogKeywordBatchTypes";

export const keywordItemIdentity = (item: ComputerSearchItem) => `${item.volumeId}:${item.fileReference}:${item.createdFileTimeMilliseconds ?? item.createdUtcTicks}`;
export interface KeywordBatchTargets { items: ComputerSearchItem[]; failed: number; skipped: number; message?: string; }
// Only Main-resolved results, saved favorites or fixed OS locations may establish a recursive scope.
export async function collectKeywordBatchTargets(runtime: ComputerSearchRuntime, source: CatalogKeywordBatchSource,
  resolveItems: (value: unknown) => ComputerSearchItem[], signal: AbortSignal, discovered: (count: number) => void) {
  const targets = new Map<string, ComputerSearchItem>(); let failed = 0, skipped = 0, message: string | undefined;
  const check = () => { if (signal.aborted) throw Error("cancelled"); };
  const add = (item: ComputerSearchItem) => {
    check(); targets.set(keywordItemIdentity(item), { ...item });
    if (targets.size > 100000) throw Error("目录包含超过十万个文件，请选择更小的范围后重试。");
    if (targets.size % 100 === 0) discovered(targets.size);
  };
  let roots: string[], selected: ComputerSearchItem[] = [];
  if ("driveLetter" in source) {
    if (typeof source.driveLetter !== "string" || !/^[A-Z]$/.test(source.driveLetter)) throw Error("invalid-drive-letter");
    roots = [`${source.driveLetter}:\\`];
  } else if ("locationId" in source) {
    const locations = ["desktop", "downloads", "documents", "pictures", "music", "videos"] as const;
    const location = locations.find(value => value === source.locationId);
    if (!location) throw Error("invalid-system-location");
    const { app } = await import("electron"); roots = [app.getPath(location)];
  } else if ("favoriteId" in source) {
    if (typeof source.favoriteId !== "string" || source.favoriteId.length > 128) throw Error("invalid-favorite");
    const favorite = (await runtime.favoriteDirectories?.list())?.find(value => value.id === source.favoriteId);
    if (!favorite) throw Error("收藏目录已不存在，请重新选择。");
    roots = [favorite.path];
  } else {
    selected = resolveItems(source);
    selected.filter(item => !item.isDirectory).forEach(add);
    roots = selected.filter(item => item.isDirectory).map(item => item.path);
  }
  roots = [...new Set(roots.map(root => path.resolve(root)))].filter((root, index, all) => !all.some((parent, other) =>
    other !== index && root.toLowerCase().startsWith(parent.toLowerCase().replace(/[\\/]+$/, "") + path.sep)));
  for (const root of roots) {
    try {
      check(); const original = await fs.lstat(root, { bigint: true });
      if (!original.isDirectory() || original.isSymbolicLink()) throw Error("目录不可用，或属于链接目录，请选择实际目录。");
      const expected = selected.find(item => item.isDirectory && path.resolve(item.path).toLowerCase() === root.toLowerCase());
      const created = expected?.createdFileTimeMilliseconds ?? (expected?.createdUtcTicks == null ? null : String(Math.trunc(expected.createdUtcTicks / 10000)));
      if (created !== null && BigInt(created) - 11644473600000n !== original.birthtimeNs / 1000000n) throw Error("目录已发生变化，请重新选择。");
      const realRoot = await fs.realpath(root), taskId = `keyword_batch_${randomUUID().replace(/-/g, "")}`;
      const cancel = () => { void runtime.cancel(taskId).catch(() => {}); };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        let page = await runtime.search({ taskId, query: "", scopePath: root, scopeKind: "directory-descendants" });
        for (;;) {
          check(); const current = await fs.lstat(root, { bigint: true });
          if (current.ino !== original.ino || current.dev !== original.dev || current.birthtimeNs !== original.birthtimeNs) throw Error("目录已发生变化，请重新选择。");
          for (const item of page.items) {
            check(); if (item.isDirectory) continue;
            const relative = path.relative(realRoot, await fs.realpath(item.path).catch(() => item.path));
            if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) { skipped++; continue; }
            add(item);
          }
          if (!page.nextCursor) break;
          page = await runtime.nextPage({ taskId, cursor: page.nextCursor });
        }
      } finally { signal.removeEventListener("abort", cancel); await runtime.cancel(taskId).catch(() => {}); }
    } catch (error) {
      check();
      if (error instanceof Error && error.message.includes("十万个")) throw error;
      failed++; message = "部分目录无法完整读取，请确认目录已入库且仍可访问。";
    }
  }
  check(); discovered(targets.size); return { items: [...targets.values()], failed, skipped, ...(message ? { message } : {}) };
}
