import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { CompatibilityCapsulePresentation } from "../shared/types";
import { getTextColorForBackground } from "./appearance";
import { QuickSearchCapsule } from "./search/QuickSearchCapsule";
import "./CompatibilityCapsuleWindowApp.css";

const defaultPresentation: CompatibilityCapsulePresentation = {
  query: "",
  placeholder: "", operationHintVisible: false,
  ariaLabel: "Search",
  theme: "light",
  appearanceColors: { themeColor: "#7C93F3", accentColor: "#68C3C0" }
};

const CompatibilityCapsuleWindowApp = () => {
  const [presentation, setPresentation] = useState(defaultPresentation);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const applyPresentation = useCallback((next: CompatibilityCapsulePresentation) => {
    setPresentation(next);
    setDraft(next.query);
  }, []);

  useEffect(() => {
    void window.cap7ce?.capsule.getPresentation().then((next) => {
      if (next) applyPresentation(next);
    });
    return window.cap7ce?.capsule.onPresentationChanged(applyPresentation);
  }, [applyPresentation]);

  useEffect(() => {
    const focusInput = () => window.setTimeout(() => inputRef.current?.focus(), 0);
    focusInput();
    window.addEventListener("focus", focusInput);
    return () => window.removeEventListener("focus", focusInput);
  }, []);

  const style = {
    "--theme-color": presentation.appearanceColors.themeColor,
    "--accent-color": presentation.appearanceColors.accentColor,
    "--theme-on-color": getTextColorForBackground(presentation.appearanceColors.themeColor),
    "--accent-on-color": getTextColorForBackground(presentation.appearanceColors.accentColor)
  } as CSSProperties;

  return (
    <div className={`app theme-${presentation.theme} cap-shell cap-compatibility-capsule-window`} style={style}>
      <QuickSearchCapsule
        ariaLabel={presentation.ariaLabel}
        inputRef={inputRef} operationHintVisible={presentation.operationHintVisible}
        placeholder={presentation.placeholder}
        value={draft}
        onCancel={() => void window.cap7ce?.capsule.cancel(true)}
        onChange={(query) => {
          setDraft(query);
          void window.cap7ce?.capsule.updateDraft(query);
        }}
        onComposingChange={(composing) => void window.cap7ce?.capsule.setComposing(composing)}
        onSubmit={(query) => void window.cap7ce?.capsule.submit(query)}
      />
    </div>
  );
};

export default CompatibilityCapsuleWindowApp;
