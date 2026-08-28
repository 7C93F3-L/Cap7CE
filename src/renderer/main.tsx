import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./ImageContextMenu.css";
import "./WindowControlRail.css";
import "./CustomScrollbar.css";
import "./WaitingIndicator.css";
import "./components/MiddleEllipsisFileName.css";
import "./skim/SkimView.css";
import "./preview/PreviewWindow.css";
import "./preview/PreviewEmbeddedMetadata.css";
import "./dialogs/KeywordEditorBackdrop.css";
import "./dialogs/KeywordEditorCard.css";
import "./dialogs/ConfirmationPanels.css";
import "./ColorPickerPopover.css";
import "./results/ResultGrid.css";
import "./results/ResultSectionCard.css";
import "./results/ResultsView.css";
import "./search/Cap7CESearchCapsule.css";
import "./ai-search/AiSearchBeta.css";
import "./search/HomeView.css";
import "./settings/SettingsSelect.css";
import "./settings/ShortcutSettingsPanels.css";
import "./settings/SkimDisplaySettingsRows.css";
import "./settings/SettingsFooter.css";
import "./settings/RuntimeModelSettingsSection.css";
import "./settings/RuntimeDiagnosticsRows.css";
import "./settings/DirectoryAiSettingsRows.css";
import "./settings/SettingsView.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const windowKind = new URLSearchParams(window.location.search).get("window");
const isPreviewWindow = windowKind === "preview";
const isLineWindow = windowKind === "line";

if (isLineWindow) {
  void import("./LineWindowApp").then(({ default: LineWindowApp }) => {
    root.render(<LineWindowApp />);
  });
} else if (isPreviewWindow) {
  void import("./PreviewWindowApp").then(({ default: PreviewWindowApp }) => {
    root.render(
      <React.StrictMode>
        <PreviewWindowApp />
      </React.StrictMode>
    );
  });
} else {
  void import("./App").then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
}
