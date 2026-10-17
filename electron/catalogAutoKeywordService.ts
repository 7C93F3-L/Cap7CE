import type { ComputerSearchItem } from "./computerSearchTypes";
import type { CatalogKeywordsApi } from "./catalogKeywordsRuntime";
import type { CatalogAutoKeywordPhase, CatalogAutoKeywordResult } from "../src/shared/catalogAutoKeywordTypes";
import { getFileFormatCapability } from "./formatCapabilities";
import { normalizeKeywordList } from "./keywordRules";

interface Dependencies {
  keywords: CatalogKeywordsApi;
  fingerprint: (item: ComputerSearchItem) => Promise<string>;
  prepareImage: (path: string) => Promise<string>;
  beginUse: () => Promise<void>; endUse: () => void;
  recognize: (image: string, signal: AbortSignal, onStarting: () => void, onGenerating: () => void) => Promise<string[]>;
}
export function createCatalogAutoKeywordService(deps: Dependencies) {
  return async (resolve: () => ComputerSearchItem, signal: AbortSignal, progress: (phase: CatalogAutoKeywordPhase) => void): Promise<CatalogAutoKeywordResult> => {
    let using = false, committed = false;
    const check = () => { if (signal.aborted) throw Error("cancelled"); return resolve(); };
    try {
      const item = check();
      if (item.isDirectory || !getFileFormatCapability(item.extension)?.canAIIndex) throw Error("此文件格式暂不支持自动添加关键词。");
      progress("preparing");
      const original = await deps.fingerprint(item);
      await deps.keywords.prepare(); check();
      const image = await deps.prepareImage(item.path); check();
      await deps.beginUse(); using = true; check();
      const words = normalizeKeywordList(await deps.recognize(image, signal, () => progress("starting"), () => progress("generating")));
      check();
      if (!words.length || words.length > 20 || words.some(word => word.length > 64 || /[\u0000-\u001f]/u.test(word))) throw Error("模型未返回有效关键词，请重试。");
      progress("saving");
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await deps.keywords.read(check());
        if (await deps.fingerprint(check()) !== original) throw Error("文件已发生变化，请重新选择文件后重试。");
        const keywords = normalizeKeywordList([...current.keywords, ...words]);
        if (keywords.length > 128 || keywords.join(",").length > 32000) throw Error("现有关键词已接近数量上限，请整理后重试。");
        const result = await deps.keywords.write(check(), keywords, current.revision);
        if (result.saved) { committed = true; return { status: "saved", current: result.current, added: keywords.length - current.keywords.length }; }
      }
      throw Error("关键词正在被其他操作修改，请重试。");
    } catch (error) {
      if (signal.aborted && !committed) return { status: "cancelled" };
      const message = error instanceof Error ? error.message : "";
      return { status: "failed", message: /authorization/u.test(message) ? "浏览位置已更新，请重新选择文件后重试。"
        : /ENOENT|EACCES|EPERM/u.test(message) ? "文件不存在或无法读取，请检查后重试。"
        : /[\u4e00-\u9fff]/u.test(message) ? message.slice(0, 240) : "自动添加关键词失败，请检查模型服务或关键词保存状态后重试。" };
    } finally { if (using) deps.endUse(); }
  };
}
export type CatalogAutoKeywordService = ReturnType<typeof createCatalogAutoKeywordService>;
