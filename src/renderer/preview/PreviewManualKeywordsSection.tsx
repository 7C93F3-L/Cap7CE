import { useState, type ReactNode } from "react";
import { t } from "../../../electron/localization";
import KeywordTagEditor from "../keywords/KeywordTagEditor";

interface PreviewManualKeywordsSectionProps {
  title?: string; emptyText?: string; actions?: ReactNode;
  sessionId: string;
  manualKeywords: string[];
  userDescription?: string;
  skimActive: boolean;
  available?: boolean;
  readState?: "loading" | "unavailable";
  onRetry?: () => void;
  editorOpen: boolean;
  savePending: boolean;
  saveError: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (keywords: string[]) => void;
}

const PreviewManualKeywordsSection = ({ sessionId, manualKeywords, userDescription, skimActive, available = !skimActive, readState, onRetry, editorOpen, savePending, saveError, onEdit, onCancel, onSave, title, emptyText, actions }: PreviewManualKeywordsSectionProps) => {
  const [clearRequestVersion, setClearRequestVersion] = useState(0);
  return <section className="preview-sidebar-section">
      <div className="preview-sidebar-section-heading">
        <h2>{title ?? t("preview.sidebar.manualKeywords")}</h2>
        {readState === "unavailable" && onRetry && <button type="button" onClick={onRetry}>{t("common.retry")}</button>}
        {available && (actions === undefined || editorOpen) && <button
          type="button"
          disabled={savePending}
          onClick={editorOpen ? () => setClearRequestVersion((version) => version + 1) : onEdit}
        >{t(editorOpen ? "preview.sidebar.clearKeywords" : "context.editKeywords")}</button>}
      </div>
      {editorOpen
        ? <KeywordTagEditor key={`${sessionId}:${manualKeywords.join("\u0000")}`} initialKeywords={manualKeywords} clearRequestVersion={clearRequestVersion} isSaving={savePending} error={saveError} onSave={onSave} onCancel={onCancel} />
        : manualKeywords.length
          ? <div className="preview-sidebar-keywords">{manualKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
          : <p className="preview-sidebar-empty">{readState === "loading" ? t("common.loading") : !available ? t("common.unavailable") : emptyText ?? t("preview.sidebar.noKeywords")}</p>}
      {userDescription && <p className="preview-sidebar-description">{userDescription}</p>}
      {actions}
    </section>;
};

export default PreviewManualKeywordsSection;
