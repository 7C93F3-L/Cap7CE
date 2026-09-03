import { useRef } from "react";
import type { PreviewWindowData } from "../../shared/types";
import { t } from "../../../electron/localization";
import CustomScrollbar from "../CustomScrollbar";
import PreviewEmbeddedMetadata from "./PreviewEmbeddedMetadata";
import { previewSidebarMaximumWidth, previewSidebarMinimumWidth } from "./previewSidebarKeyboard";
import "./StablePreviewShell.css";
interface PreviewInformationSidebarProps {
  data: PreviewWindowData; expanded: boolean; width: number;
  canShowSecondaryActions: boolean; onToggleExpanded: () => void;
  onBeginResize: (event: React.PointerEvent) => void; onResizeByKeyboard: (event: React.KeyboardEvent<HTMLElement>) => void;
  onResetWidth: () => void; onOpen: () => void;
  onShowInFolder: () => void; onCopyPath: () => void;
  onEditKeywords: () => void; onDelete: () => void;
  onOpenSkim: () => void; onOpenSettings: () => void;
}
const formatBytes = (bytes: number) => {
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
const getFileFormat = (data: PreviewWindowData) => {
  if (data.info?.kind === "folder") return t("fileInfo.folder");
  const extension = data.info?.extension || data.fileName.slice(data.fileName.lastIndexOf(".") + 1);
  return extension && extension !== data.fileName ? extension.replace(/^\./u, "").toUpperCase() : t("fileInfo.file");
};
const PreviewInformationSidebar = ({
  data,
  expanded,
  width,
  canShowSecondaryActions,
  onToggleExpanded,
  onBeginResize,
  onResizeByKeyboard,
  onResetWidth,
  onOpen,
  onShowInFolder,
  onCopyPath,
  onEditKeywords,
  onDelete,
  onOpenSkim,
  onOpenSettings
}: PreviewInformationSidebarProps) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
  <aside
    className={`preview-information-sidebar${expanded ? " is-expanded" : " is-collapsed"}`}
    style={{ "--preview-sidebar-width": `${width}px` } as React.CSSProperties}
    data-preview-navigation-suppressed="true"
    aria-label={t("preview.sidebar.heading")}
  >
    <button className="preview-sidebar-header" type="button" onClick={onToggleExpanded} aria-expanded={expanded} aria-label={t(expanded ? "preview.sidebar.collapse" : "preview.sidebar.expand")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={expanded ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} /></svg>
      {expanded && <strong>{t("preview.sidebar.heading")}</strong>}
    </button>
    {expanded && <>
      <div ref={scrollRef} className="preview-sidebar-scroll cap-main-scroll-viewport">
        <section className="preview-sidebar-section preview-sidebar-file-card">
          <h2>{t("preview.sidebar.fileInfo")}</h2>
          <div className="preview-sidebar-file-heading">
            <strong title={data.fileName}>{data.fileName}</strong>
            <span>{getFileFormat(data)}</span>
          </div>
          <dl className="preview-sidebar-details">
            {(data.imageWidth ?? 0) > 0 && (data.imageHeight ?? 0) > 0 && <div><dt>{t("preview.sidebar.dimensions")}</dt><dd>{data.imageWidth} × {data.imageHeight}</dd></div>}
            <div><dt>{t("skim.previewSize")}</dt><dd>{formatBytes(data.fileSize)}</dd></div>
            <div><dt>{t("skim.previewModified")}</dt><dd>{new Date(data.modifiedAt).toLocaleString()}</dd></div>
          </dl>
        </section>
        <section className="preview-sidebar-section">
          <h2>{t("preview.sidebar.location")}</h2>
          <p className="preview-sidebar-path" title={data.filePath}>{data.filePath}</p>
        </section>
        <section className="preview-sidebar-section">
          <div className="preview-sidebar-section-heading">
            <h2>{t("preview.sidebar.manualKeywords")}</h2>
            {!data.skimActive && <button type="button" onClick={onEditKeywords}>{t("context.editKeywords")}</button>}
          </div>
          {data.manualKeywords?.length
            ? <div className="preview-sidebar-keywords">{data.manualKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
            : <p className="preview-sidebar-empty">{data.skimActive ? t("common.unavailable") : t("preview.sidebar.noKeywords")}</p>}
          {data.userDescription && <p className="preview-sidebar-description">{data.userDescription}</p>}
        </section>
        <section className="preview-sidebar-section">
          <h2>{t("preview.sidebar.currentEvidence")}</h2>
          {data.searchEvidence?.terms.length
            ? <div className="preview-sidebar-evidence">{data.searchEvidence.terms.map((term) => <span key={`${term.term}:${term.bestSource}`}>{term.term}</span>)}</div>
            : <p className="preview-sidebar-empty">{data.skimActive ? t("preview.sidebar.skimEvidence") : t("preview.sidebar.noEvidence")}</p>}
        </section>
        {data.embeddedMetadata
          ? <PreviewEmbeddedMetadata key={data.sessionId} data={data.embeddedMetadata} variant="details" />
          : <section className="preview-sidebar-section"><h2>{t("preview.metadata.heading")}</h2><p className="preview-sidebar-empty">{t("preview.sidebar.noEmbeddedMetadata")}</p></section>}
        <section className="preview-sidebar-section">
          <h2>{t("preview.sidebar.fileActions")}</h2>
          <div className="preview-sidebar-actions">
            <button type="button" onClick={onOpen}>{t("context.open")}</button>
            <button type="button" onClick={onShowInFolder}>{t("context.showInFolder")}</button>
            <button type="button" onClick={onCopyPath}>{t("context.copyPath")}</button>
            {!data.skimActive && <button type="button" className="is-danger" onClick={onDelete}>{t("context.deleteFile")}</button>}
          </div>
        </section>
        {canShowSecondaryActions && <section className="preview-sidebar-section preview-sidebar-secondary-actions">
          <button type="button" onClick={onOpenSkim}>{t("skim.locationPicker.open")}</button>
          <button type="button" onClick={onOpenSettings}>{t("window.openSettings")}</button>
        </section>}
      </div>
      <CustomScrollbar scrollContainerRef={scrollRef} orientation="vertical" />
      <div className="preview-sidebar-resize-handle" role="separator" tabIndex={0} aria-orientation="vertical" aria-label={t("preview.sidebar.resize")} aria-valuemin={previewSidebarMinimumWidth} aria-valuemax={previewSidebarMaximumWidth} aria-valuenow={width} onPointerDown={onBeginResize} onKeyDown={onResizeByKeyboard} onDoubleClick={onResetWidth} />
    </>}
  </aside>
  );
};
export default PreviewInformationSidebar;
