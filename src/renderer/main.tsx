import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
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
import "./ai-search/AiSearchBeta.css";
import "./settings/SettingsSelect.css";
import "./settings/ShortcutSettingsPanels.css";
import "./settings/SkimDisplaySettingsRows.css";
import "./settings/SettingsFooter.css";
import "./settings/RuntimeDiagnosticsRows.css";
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const rendererSearchParams = new URLSearchParams(window.location.search);
const windowKind = rendererSearchParams.get("window");
const isSettingsWindow = windowKind === "settings", isPreviewWindow = windowKind === "preview";
const isLineWindow = windowKind === "line";
if (isSettingsWindow) {
  void import("./settings-window/SettingsWindowApp").then(({ default: SettingsWindowApp }) => root.render(<React.StrictMode><SettingsWindowApp /></React.StrictMode>));
} else if (isLineWindow) {
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
  void Promise.all([import("./App"), import("./stable-ui/StableUiRoot")]).then(([{ default: App }, { default: StableUiRoot }]) => {
    root.render(
      <React.StrictMode>
        <App stableUiRenderer={StableUiRoot} />
      </React.StrictMode>
    );
  });
}
