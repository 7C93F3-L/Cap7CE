import { useEffect } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import { getFileFormatCapability } from "../../../electron/formatCapabilities";
import PreviewManualKeywordsSection from "../preview/PreviewManualKeywordsSection";
import { useCatalogKeywords } from "./useCatalogKeywords";
import { useCatalogActivity } from "./CatalogActivity";
import { useCatalogKeywordEditRequest } from "./useCatalogKeywordEditRequest";
import "../keywords/KeywordTagEditor.css";
import "./CatalogKeywords.css";

export default function CatalogKeywords({ item, taskId, foreground }: { item: ComputerSearchItem; taskId: string; foreground: boolean }) {
  const keywords = useCatalogKeywords(item, taskId, foreground), activity = useCatalogActivity();
  const job = activity?.job, matching = job?.key === keywords.sessionId;
  const result = matching ? job?.result : undefined;
  const busy = activity?.busy;
  useEffect(() => { if (result?.status === "saved" && !keywords.editing) keywords.retry(); }, [result, keywords.editing, keywords.retry]);
  const batchResult = job?.batch ? job.result : undefined;
  useEffect(() => { if (batchResult && "succeeded" in batchResult && batchResult.succeeded > 0 && !keywords.editing) keywords.retry(); }, [batchResult, keywords.editing, keywords.retry]);
  useCatalogKeywordEditRequest(keywords.sessionId, foreground && keywords.available && !activity?.busy, keywords.edit);
  const supported = getFileFormatCapability(item.extension)?.canAIIndex === true;
  return <PreviewManualKeywordsSection sessionId={keywords.sessionId} manualKeywords={keywords.keywords} skimActive={false}
    title="添加关键词" emptyText="尚未添加关键词" available={keywords.available} readState={keywords.readState} onRetry={keywords.retry}
    editorOpen={keywords.editing} savePending={keywords.saving} saveError={keywords.error}
    onEdit={keywords.edit} onCancel={keywords.cancel} onSave={words => void keywords.save(words)}
    actions={!keywords.editing && <div className="keyword-tag-editor-actions cap-catalog-keyword-actions">
      <button type="button" disabled={!foreground || !keywords.available || !!busy} onClick={keywords.edit}>编辑</button>
      <button type="button" disabled={!foreground || !keywords.available || !supported || !activity || activity.busy}
        title={!supported ? "此文件格式暂不支持自动添加关键词" : "使用本地模型生成并保存关键词"}
        onClick={() => void activity?.start(item, taskId)}>自动添加</button>
    </div>} />;
}
