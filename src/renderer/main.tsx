import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const isPreviewWindow = new URLSearchParams(window.location.search).get("window") === "preview";

if (isPreviewWindow) {
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
