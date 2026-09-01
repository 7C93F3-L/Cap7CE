import StableMainShell from "./StableMainShell";
import StableSearchInput from "./StableSearchInput";
import StableTitlebar from "./StableTitlebar";
import type { StableUiRendererProps } from "./stableUiRendererTypes";
import "./StableUiFoundation.css";
import "./StableSearchResults.css";

const StableUiRoot = ({ theme, themeStyle, pinned, pinLabel, search, searchInputRef, inputFeedback, inputFeedbackIsGuide, resultStatus, resultContent, overlayContent, onTogglePinned, onSearchChange, onSearchOptionsChange, onSearch, onDismissOverlay }: StableUiRendererProps) => {
  return (
    <div className={`app theme-${theme} cap-stable-ui`} style={themeStyle} onClick={onDismissOverlay}>
      <StableTitlebar
        pinned={pinned}
        pinLabel={pinLabel}
        searchInput={<StableSearchInput search={search} inputRef={searchInputRef} inputFeedback={inputFeedback} inputFeedbackIsGuide={inputFeedbackIsGuide} onSearchChange={onSearchChange} onSearchOptionsChange={onSearchOptionsChange} onSearch={onSearch} />}
        resultStatus={resultStatus}
        onTogglePinned={onTogglePinned}
      />
      <StableMainShell resultContent={resultContent} />
      {overlayContent}
    </div>
  );
};

export default StableUiRoot;
