import type { ResolvedThemeMode } from "../../shared/types";

interface KeywordEditorBackdropProps {
  theme: ResolvedThemeMode;
  isClosing: boolean;
}

const KeywordEditorBackdrop = ({ theme, isClosing }: KeywordEditorBackdropProps) => (
  <div
    className={`keyword-editor-backdrop keyword-editor-backdrop-${theme}${isClosing ? " is-closing" : ""}`}
    data-keyword-editor-backdrop="true"
    aria-hidden="true"
  />
);

export default KeywordEditorBackdrop;
