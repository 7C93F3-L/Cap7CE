import { createComputerSearchTaskIdGenerator } from "../computer-search/computerSearchTaskIdentity";
import { useEffect, useState } from "react";
import { fileFormatCapabilities, type FileFormatCategory } from "../../../electron/formatCapabilities";
import type { ComputerSearchFacts } from "../../shared/computerSearchFactTypes";
import type { MetadataBuildProgress } from "../../shared/metadataBuildTypes";
const kinds: Record<FileFormatCategory, ComputerSearchFacts["kind"]> = { visual: "image-dimensions", video: "video", audio: "audio", document: "document", project: "document", font: "font", model: "model", threeD: "three-d", text: "text-data", data: "text-data", archive: "archive" };
// Scoped, read-only existence checks reuse the authenticated query API; no extraction or thumbnail request.
export function useCatalogAttributeAvailability(path: string | null, extensions: string[], enabled: boolean, progress: MetadataBuildProgress | null) {
  const [nextProbe] = useState(() => createComputerSearchTaskIdGenerator());
  const categories = extensions.map(extension => fileFormatCapabilities.find(value => value.extension === extension)?.category);
  const kind = categories.length && categories[0] && categories.every(value => value === categories[0]) ? kinds[categories[0]] : null;
  const key = JSON.stringify([path, kind, [...extensions].sort()]);
  const [result, setResult] = useState<{ key: string; state: "available" | "missing" | "unknown"; colors: boolean } | null>(null);
  const tick = `${progress?.phase}:${Math.floor((progress?.processed ?? 0) / 100)}`;
  useEffect(() => {
    if (!kind || !enabled || !window.cap7ce?.computerSearch) return;
    const api = window.cap7ce.computerSearch, taskIds: string[] = []; let live = true;
    const check = async (facts: ComputerSearchFacts) => {
      const taskId = `${nextProbe("search")}_attribute`; taskIds.push(taskId);
      try { const page = await api.search({ taskId, query: "", scopePath: path, facts, fileConditions: { extensions } }); return page.items.length > 0; }
      finally { void api.cancel(taskId).catch(() => {}); }
    };
    void (async () => {
      const available = await check({ kind });
      if (!live) return;
      const colors = available && (kind === "image-dimensions" || kind === "video") ? await check({ kind, visualGroups: [{ alternatives: [[{ metric: "brightnessMean", operator: "<=", value: 10000 }]] }] }) : true;
      if (live) setResult({ key, state: available ? "available" : "missing", colors });
    })().catch(() => { if (live) setResult({ key, state: "unknown", colors: false }); });
    return () => { live = false; for (const taskId of taskIds) void api.cancel(taskId).catch(() => {}); };
  }, [key, enabled, tick]);
  const current = result?.key === key ? result : null;
  return { relevant: Boolean(kind), disabled: Boolean(kind) && current?.state !== "available", colorsDisabled: !current?.colors,
    message: !kind || current?.state === "available" ? ""
      : current?.state === "missing" ? "当前范围尚无这类可用属性，提取文件属性后可筛选。"
      : current?.state === "unknown" ? "暂时无法确认当前范围的属性状态。" : "正在检查当前范围的文件属性…" };
}
