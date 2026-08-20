import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./skim/SkimView.css";
import "./preview/PreviewWindow.css";
import "./dialogs/KeywordEditorCard.css";
import "./ColorPickerPopover.css";
import "./results/ResultGrid.css";

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
