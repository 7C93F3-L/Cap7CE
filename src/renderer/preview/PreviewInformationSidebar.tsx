import { useRef, type ReactNode, type RefObject } from "react";
import type { FileInformationData } from "../../shared/fileInformationTypes";
import { t } from "../../../electron/localization";
import CustomScrollbar from "../CustomScrollbar";
import PreviewEmbeddedMetadata from "./PreviewEmbeddedMetadata";
import PreviewManualKeywordsSection from "./PreviewManualKeywordsSection";
import PreviewSearchEvidence from "./PreviewSearchEvidence";
import "./StablePreviewShell.css";
interface PreviewInformationSidebarProps {
  data: FileInformationData; expanded: boolean;
  showFileActions?: boolean; showSearchEvidence?: boolean; className?: string; heading?: string; metadataStatus?: "loading" | "unavailable";
  renderVisual?: (scrollRef: RefObject<HTMLDivElement | null>) => ReactNode;
  onToggleExpanded?: () => void;
  onOpen?: () => void;
  onShowInFolder?: () => void; onCopyPath?: () => void; copyPathCopied?: boolean;
  keywordEditorOpen?: boolean; keywordSavePending?: boolean; keywordSaveError?: string;
  keywordsAvailable?: boolean; keywordsReadState?: "loading" | "unavailable"; onRetryKeywords?: () => void;
  onEditKeywords?: () => void; onCancelKeywordEdit?: () => void;
  onSaveKeywords?: (keywords: string[]) => void; onDelete?: () => void;
}
const noop = () => undefined;
const formatBytes = (bytes: number | null) => {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
};
const getFileFormat = (data: FileInformationData) => {
  if (data.info?.kind === "folder") return t("fileInfo.folder");
  const extension = data.info?.extension || data.fileName.slice(data.fileName.lastIndexOf(".") + 1);
  return extension && extension !== data.fileName ? extension.replace(/^\./u, "").toUpperCase() : t("fileInfo.file");
};
const PreviewInformationSidebar = ({
  data,
  showFileActions = true, showSearchEvidence = true, className = "", heading = t("preview.sidebar.heading"), renderVisual, metadataStatus,
  expanded,
  onToggleExpanded,
  onOpen,
  onShowInFolder,
  onCopyPath,
  copyPathCopied,
  keywordEditorOpen = false,
  keywordsAvailable, keywordsReadState, onRetryKeywords,
  keywordSavePending = false,
  keywordSaveError = "",
  onEditKeywords = noop,
  onCancelKeywordEdit = noop,
  onSaveKeywords = noop,
  onDelete
}: PreviewInformationSidebarProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
  <aside
    className={`preview-information-sidebar${expanded ? " is-expanded" : " is-collapsed"}${className ? ` ${className}` : ""}`}
    data-preview-navigation-suppressed="true"
    aria-label={t("preview.sidebar.heading")}
  >
    {onToggleExpanded ? <button className="preview-sidebar-header" type="button" onClick={onToggleExpanded} onPointerUp={(event) => event.currentTarget.blur()} aria-expanded={expanded} aria-label={t(expanded ? "preview.sidebar.collapse" : "preview.sidebar.expand")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={expanded ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} /></svg>
      {expanded && <strong>{heading}</strong>}
    </button> : <header className="preview-sidebar-header"><strong>{heading}</strong></header>}
    {expanded && <>
      <div ref={scrollRef} className="preview-sidebar-scroll cap-main-scroll-viewport">
        {renderVisual?.(scrollRef)}
        <section className="preview-sidebar-section preview-sidebar-file-card">
          <h2>{t("preview.sidebar.fileInfo")}</h2>
          <div className="preview-sidebar-file-heading">
            <strong title={data.fileName}>{data.fileName}</strong>
            <span>{getFileFormat(data)}</span>
          </div>
          <dl className="preview-sidebar-details">
            {(data.imageWidth ?? 0) > 0 && (data.imageHeight ?? 0) > 0 && <div><dt>{t("preview.sidebar.dimensions")}</dt><dd>{data.imageWidth} × {data.imageHeight}</dd></div>}
            <div><dt>{t("skim.previewSize")}</dt><dd>{formatBytes(data.fileSize)}</dd></div>
            <div><dt>{t("skim.previewModified")}</dt><dd>{data.modifiedAt ? new Date(data.modifiedAt).toLocaleString() : "—"}</dd></div>
          </dl>
        </section>
        <section className="preview-sidebar-section">
          <h2>{t("preview.sidebar.location")}</h2>
          <button className="preview-sidebar-path" type="button" title={data.filePath} onClick={onShowInFolder}>{data.filePath}</button>
        </section>
        <PreviewManualKeywordsSection sessionId={data.sessionId} manualKeywords={data.manualKeywords ?? []} userDescription={data.userDescription} skimActive={data.skimActive} available={keywordsAvailable} readState={keywordsReadState} onRetry={onRetryKeywords} editorOpen={keywordEditorOpen} savePending={keywordSavePending} saveError={keywordSaveError} onEdit={onEditKeywords} onCancel={onCancelKeywordEdit} onSave={onSaveKeywords} />
        {showSearchEvidence && <PreviewSearchEvidence evidence={data.searchEvidence} skimActive={data.skimActive} />}
        {data.embeddedMetadata
          ? <PreviewEmbeddedMetadata key={data.sessionId} data={data.embeddedMetadata} />
          : <section className="preview-sidebar-section"><h2>{t("preview.metadata.heading")}</h2><p className="preview-sidebar-empty">{t(metadataStatus === "loading" ? "common.loading" : metadataStatus === "unavailable" ? "common.unavailable" : "preview.sidebar.noEmbeddedMetadata")}</p></section>}
        {showFileActions && <section className="preview-sidebar-section">
          <h2>{t("preview.sidebar.fileActions")}</h2>
          <div className="preview-sidebar-actions">
            <button type="button" onClick={onOpen}>{t("context.open")}</button>
            <button type="button" onClick={onShowInFolder}>{t("context.showInFolder")}</button>
            <button type="button" onClick={onCopyPath}>{t(copyPathCopied ? "clipboard.copied" : "context.copyPath")}</button>
            {!data.skimActive && <button type="button" onClick={onDelete}>{t("context.deleteFile")}</button>}
          </div>
        </section>}
      </div>
      <CustomScrollbar scrollContainerRef={scrollRef} orientation="vertical" />
    </>}
  </aside>
  );
};
export default PreviewInformationSidebar;
