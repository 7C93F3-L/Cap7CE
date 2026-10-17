import type { CatalogSelection } from "../../shared/catalogPresentationTypes";
import PreviewInformationSidebar from "../preview/PreviewInformationSidebar";
import ComputerSearchResultVisual from "../computer-search/ComputerSearchResultVisual";
import { useCatalogFileInformation } from "./useCatalogFileInformation";
import CatalogKeywords from "./CatalogKeywords";
import "../preview/PreviewEmbeddedMetadata.css";
import "./CatalogFileInformation.css";

export default function CatalogFileInformation({ selection, foreground }: { selection: CatalogSelection; foreground: boolean }) {
  const item = selection.items[0];
  const information = useCatalogFileInformation(item, selection.taskId, foreground);
  return <div className="cap-catalog-file-information-host" data-selection-preserve="true">
    <PreviewInformationSidebar {...information} expanded mergeLocation showFileActions={false} showSearchEvidence={false} className="cap-catalog-file-information"
      keywordsSection={<CatalogKeywords item={item} taskId={selection.taskId} foreground={foreground} />}
      heading={item.extension.replace(/^\./u, "").toUpperCase() || "文件"}
      onShowInFolder={selection.showInFolder} renderVisual={scrollRef => <div className="cap-catalog-file-visual">
        <ComputerSearchResultVisual item={item} taskId={selection.taskId} foreground={foreground} scrollContainerRef={scrollRef} />
      </div>} />
  </div>;
}
