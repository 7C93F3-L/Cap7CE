import { useEffect } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import PreviewManualKeywordsSection from "../preview/PreviewManualKeywordsSection";
import { useCatalogActivity } from "./CatalogActivity";
import { useCatalogBatchKeywords } from "./useCatalogBatchKeywords";
import { useCatalogKeywordEditRequest } from "./useCatalogKeywordEditRequest";
import "../keywords/KeywordTagEditor.css";
import "./CatalogKeywords.css";

const noop = () => {};
export default function CatalogBatchKeywords({ items, taskId, foreground }: { items: ComputerSearchItem[]; taskId: string; foreground: boolean }) {
  const activity = useCatalogActivity(), keywords = useCatalogBatchKeywords(items, taskId, foreground, activity?.notify ?? noop);
  const result = activity?.job?.result;
  useEffect(() => { if (result && "succeeded" in result && result.succeeded > 0 && !keywords.editing) keywords.retry(); }, [result, keywords.editing, keywords.retry]);
  useCatalogKeywordEditRequest(keywords.sessionId, foreground && keywords.available && !activity?.busy, keywords.edit);
  return <PreviewManualKeywordsSection title="添加关键词" emptyText="暂无共同关键词" sessionId={keywords.sessionId} manualKeywords={keywords.keywords}
    userDescription={`编辑 ${items.filter(item => !item.isDirectory).length} 个文件的共同关键词，保留各自独有的关键词。`}
    skimActive={false} available={keywords.available} readState={keywords.readState} onRetry={keywords.retry}
    editorOpen={keywords.editing} savePending={keywords.saving} saveError={keywords.error} onEdit={keywords.edit} onCancel={keywords.cancel} onSave={words => void keywords.save(words)}
    actions={!keywords.editing && <div className="keyword-tag-editor-actions cap-catalog-keyword-actions">
      <button type="button" disabled={!foreground || !keywords.available || activity?.busy} onClick={keywords.edit}>编辑</button>
      <button type="button" disabled={!foreground || !activity || activity.busy || keywords.saving}
        onClick={() => void activity?.startBatch({ taskId, authorizationIds: items.map(item => item.authorizationId) }, `已选择 ${items.length} 项`)}>自动添加</button>
    </div>} />;
}
