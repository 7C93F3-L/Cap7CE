import type { PreviewWindowData, SearchEvidenceSource } from "../../shared/types";
import { t, type TranslationKey } from "../../../electron/localization";
import "./PreviewSearchEvidence.css";

interface PreviewSearchEvidenceProps {
  evidence: PreviewWindowData["searchEvidence"];
  skimActive: boolean;
}

const sourceLabelKeys: Record<SearchEvidenceSource, TranslationKey> = {
  userKeyword: "preview.evidence.userKeyword",
  userDescription: "preview.evidence.userDescription",
  fileName: "preview.evidence.fileName",
  fileExtension: "preview.evidence.fileExtension",
  fileCategory: "preview.evidence.fileCategory",
  modifiedTime: "preview.evidence.modifiedTime",
  imageOrientation: "preview.evidence.imageOrientation",
  imageAspectRatio: "preview.evidence.imageAspectRatio",
  visualPropertyStrong: "preview.evidence.visualProperty",
  relativeDirectory: "preview.evidence.relativeDirectory",
  rootDirectoryName: "preview.evidence.rootDirectoryName",
  directoryDisplayName: "preview.evidence.directoryDisplayName",
  embeddedMetadata: "preview.evidence.embeddedMetadata",
  aiKeyword: "preview.evidence.aiKeyword",
  aiCaption: "preview.evidence.aiCaption",
  visualPropertySoft: "preview.evidence.visualSimilarity",
  aiSearch: "preview.evidence.aiSearch"
};

const groupEvidenceTerms = (evidence: PreviewWindowData["searchEvidence"]) => {
  const grouped = new Map<SearchEvidenceSource, string[]>();
  evidence?.terms.forEach(({ term, bestSource }) => {
    const terms = grouped.get(bestSource) ?? [];
    if (!terms.includes(term)) terms.push(term);
    grouped.set(bestSource, terms);
  });
  return [...grouped.entries()];
};

const PreviewSearchEvidence = ({ evidence, skimActive }: PreviewSearchEvidenceProps) => {
  const rows = groupEvidenceTerms(evidence);
  return (
    <section className="preview-sidebar-section">
      <h2>{t("preview.sidebar.currentEvidence")}</h2>
      {rows.length > 0
        ? <ul className="preview-sidebar-evidence">{rows.map(([source, terms]) => (
          <li key={source}><strong>{t(sourceLabelKeys[source])}</strong><span>{terms.join(t("preview.evidence.termSeparator"))}</span></li>
        ))}</ul>
        : <p className="preview-sidebar-empty">{skimActive ? t("preview.sidebar.skimEvidence") : t("preview.sidebar.noEvidence")}</p>}
    </section>
  );
};

export default PreviewSearchEvidence;
