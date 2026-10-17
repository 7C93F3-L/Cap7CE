import type { CatalogSelection } from "../../shared/catalogPresentationTypes";
import PreviewInformationSidebar from "../preview/PreviewInformationSidebar";
import ComputerSearchResultVisual from "../computer-search/ComputerSearchResultVisual";
import { useCatalogFileInformation } from "./useCatalogFileInformation";
import { useCatalogKeywords } from "./useCatalogKeywords";
import "../preview/PreviewEmbeddedMetadata.css";
import "./CatalogFileInformation.css";

export default function CatalogFileInformation({ selection, foreground }: { selection: CatalogSelection; foreground: boolean }) {
  const item = selection.items[0];
  const information = useCatalogFileInformation(item, selection.taskId, foreground);
  const keywords = useCatalogKeywords(item, selection.taskId, foreground);
  return <div className="cap-catalog-file-information-host" data-selection-preserve="true">
    <PreviewInformationSidebar {...information} expanded mergeLocation showFileActions={false} showSearchEvidence={false} className="cap-catalog-file-information"
      data={{ ...information.data, sessionId: keywords.sessionId, manualKeywords: keywords.keywords }} keywordsAvailable={keywords.available} keywordsReadState={keywords.readState}
      keywordEditorOpen={keywords.editing} keywordSavePending={keywords.saving} keywordSaveError={keywords.error}
      onEditKeywords={keywords.edit} onCancelKeywordEdit={keywords.cancel} onSaveKeywords={words => { void keywords.save(words); }} onRetryKeywords={keywords.retry}
      heading={item.extension.replace(/^\./u, "").toUpperCase() || "文件"}
      onShowInFolder={selection.showInFolder} renderVisual={scrollRef => <div className="cap-catalog-file-visual">
        <ComputerSearchResultVisual item={item} taskId={selection.taskId} foreground={foreground} scrollContainerRef={scrollRef} />
      </div>} />
  </div>;
}
