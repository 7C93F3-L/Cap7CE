import StableMainShell from "./StableMainShell";
import StableSearchInput from "./StableSearchInput";
import StableTitlebar from "./StableTitlebar";
import type { StableUiRendererProps } from "./stableUiRendererTypes";
import "./StableUiFoundation.css";
import "./StableSearchResults.css";
const StableUiRoot = ({ theme, themeStyle, windowMaterial, pinned, pinLabel, search, searchInputRef, inputFeedback, resultStatus, resultContent, overlayContent, backgroundInteractionLocked, sidebar, skim, directoryDropEnabled, onTogglePinned, onSearchChange, onSearchOptionsChange, onSearch, onDirectoryDrop, onDismissOverlay }: StableUiRendererProps) => {
  return (
    <div className={`app theme-${theme} cap-stable-ui`} data-window-material={windowMaterial} style={themeStyle} onClick={onDismissOverlay}
      onDragOverCapture={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = directoryDropEnabled ? "copy" : "none"; }}
      onDropCapture={(event) => { event.preventDefault(); if (directoryDropEnabled) onDirectoryDrop(event.dataTransfer); }}>
      <StableTitlebar
        theme={theme} themeStyle={themeStyle} windowMaterial={windowMaterial}
        pinned={pinned} pinLabel={pinLabel}
        interactionLocked={backgroundInteractionLocked}
        searchInput={<StableSearchInput search={search} inputRef={searchInputRef} inputFeedback={inputFeedback} onSearchChange={onSearchChange} onSearchOptionsChange={onSearchOptionsChange} onSearch={onSearch} />}
        resultStatus={resultStatus}
        onTogglePinned={onTogglePinned}
      />
      <StableMainShell resultContent={resultContent} sidebar={sidebar} skim={skim} interactionLocked={backgroundInteractionLocked} />
      {overlayContent}
    </div>
  );
};
export default StableUiRoot;
