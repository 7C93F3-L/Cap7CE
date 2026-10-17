import { useEffect } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import { getFileFormatCapability } from "../../../electron/formatCapabilities";
import PreviewManualKeywordsSection from "../preview/PreviewManualKeywordsSection";
import { useCatalogKeywords } from "./useCatalogKeywords";
import { useCatalogActivity } from "./CatalogActivity";
import "./CatalogKeywords.css";

export default function CatalogKeywords({ item, taskId, foreground }: { item: ComputerSearchItem; taskId: string; foreground: boolean }) {
  const keywords = useCatalogKeywords(item, taskId, foreground), activity = useCatalogActivity();
  const job = activity?.job, matching = job?.key === keywords.sessionId;
  const result = matching ? job?.result : undefined;
  const busy = matching && !!activity?.busy;
  useEffect(() => { if (result?.status === "saved") keywords.retry(); }, [result, keywords.retry]);
  const supported = getFileFormatCapability(item.extension)?.canAIIndex === true;
  return <PreviewManualKeywordsSection sessionId={keywords.sessionId} manualKeywords={keywords.keywords} skimActive={false}
    title="添加关键词" emptyText="尚未添加关键词" available={keywords.available} readState={keywords.readState} onRetry={keywords.retry}
    editorOpen={keywords.editing} savePending={keywords.saving} saveError={keywords.error}
    onEdit={keywords.edit} onCancel={keywords.cancel} onSave={words => void keywords.save(words)}
    actions={!keywords.editing && <div className="cap-catalog-keyword-actions">
      <button type="button" disabled={!foreground || !keywords.available || !!busy} onClick={keywords.edit}>手动添加</button>
      <button type="button" disabled={!foreground || !keywords.available || !supported || !activity || activity.busy}
        title={!supported ? "此文件格式暂不支持自动添加关键词" : "使用本地模型生成并保存关键词"}
        onClick={() => void activity?.start(item, taskId)}>自动添加</button>
    </div>} />;
}
