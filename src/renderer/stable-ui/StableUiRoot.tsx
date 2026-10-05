import StableMainShell from "./StableMainShell";
import StableExploreBar from "./StableExploreBar";
import StableTitlebar from "./StableTitlebar";
import type { StableUiRendererProps } from "./stableUiRendererTypes";
import "./StableUiFoundation.css";
import "./StableSearchResults.css";
const StableUiRoot = ({ theme, themeStyle, windowMaterial, pinned, pinLabel, search, workspace, searchInputRef, inputFeedback, resultStatus, resultContent, overlayContent, backgroundInteractionLocked, explore, sidebar, skim, directoryDropEnabled, onTogglePinned, onSearchChange, onSearchOptionsChange, onSearch, onDirectoryDrop, onDismissOverlay }: StableUiRendererProps) => {
  return (
    <div className={`app theme-${theme} cap-stable-ui`} data-window-material={windowMaterial} style={themeStyle} onClick={onDismissOverlay}
      onDragOverCapture={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = directoryDropEnabled ? "copy" : "none"; }}
      onDropCapture={(event) => { event.preventDefault(); if (directoryDropEnabled) onDirectoryDrop(event.dataTransfer); }}>
      <StableTitlebar
        theme={theme} themeStyle={themeStyle} windowMaterial={windowMaterial}
        pinned={pinned} pinLabel={pinLabel}
        interactionLocked={backgroundInteractionLocked}
        resultStatus={resultStatus}
        onTogglePinned={onTogglePinned}
      />
      <StableMainShell resultsToolbar={<StableExploreBar {...explore} search={search} searchInputRef={searchInputRef} inputFeedback={inputFeedback} onSearchChange={onSearchChange} onSearchOptionsChange={onSearchOptionsChange} onSearch={onSearch} />} resultContent={resultContent} sidebar={sidebar} skim={skim} workspace={workspace} interactionLocked={backgroundInteractionLocked} />
      {overlayContent}
    </div>
  );
};
export default StableUiRoot;
