import { useState } from "react";
import { t } from "../../../electron/localization";
import KeywordTagEditor from "../keywords/KeywordTagEditor";

interface PreviewManualKeywordsSectionProps {
  sessionId: string;
  manualKeywords: string[];
  userDescription?: string;
  skimActive: boolean;
  editorOpen: boolean;
  savePending: boolean;
  saveError: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (keywords: string[]) => void;
}

const PreviewManualKeywordsSection = ({ sessionId, manualKeywords, userDescription, skimActive, editorOpen, savePending, saveError, onEdit, onCancel, onSave }: PreviewManualKeywordsSectionProps) => {
  const [clearRequestVersion, setClearRequestVersion] = useState(0);
  return <section className="preview-sidebar-section">
      <div className="preview-sidebar-section-heading">
        <h2>{t("preview.sidebar.manualKeywords")}</h2>
        {!skimActive && <button
          type="button"
          disabled={savePending}
          onClick={editorOpen ? () => setClearRequestVersion((version) => version + 1) : onEdit}
        >{t(editorOpen ? "preview.sidebar.clearKeywords" : "context.editKeywords")}</button>}
      </div>
      {editorOpen
        ? <KeywordTagEditor key={`${sessionId}:${manualKeywords.join("\u0000")}`} initialKeywords={manualKeywords} clearRequestVersion={clearRequestVersion} isSaving={savePending} error={saveError} onSave={onSave} onCancel={onCancel} />
        : manualKeywords.length
          ? <div className="preview-sidebar-keywords">{manualKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
          : <p className="preview-sidebar-empty">{skimActive ? t("common.unavailable") : t("preview.sidebar.noKeywords")}</p>}
      {userDescription && <p className="preview-sidebar-description">{userDescription}</p>}
    </section>;
};

export default PreviewManualKeywordsSection;
