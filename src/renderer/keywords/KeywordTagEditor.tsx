import { useEffect, useMemo, useRef, useState } from "react";
import { formatKeywordText, normalizeKeywordList, parseKeywordText } from "../../../electron/keywordRules";
import { t } from "../../../electron/localization";
import clearIcon from "../assets/icons/icon-stable-clear-search.svg?raw";
import SvgIcon from "../components/SvgIcon";
import "./KeywordTagEditor.css";

interface KeywordTagEditorProps {
  initialKeywords: string[];
  clearRequestVersion: number;
  isSaving: boolean;
  error: string;
  onSave: (keywords: string[]) => void;
  onCancel: () => void;
}

const KeywordTagEditor = ({ initialKeywords, clearRequestVersion, isSaving, error, onSave, onCancel }: KeywordTagEditorProps) => {
  const [keywords, setKeywords] = useState(() => normalizeKeywordList(initialKeywords));
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const composingRef = useRef(false);
  const clearRequestVersionRef = useRef(clearRequestVersion);
  const initialKeywordText = useMemo(() => formatKeywordText(initialKeywords), [initialKeywords]);
  const draftKeywordText = formatKeywordText(keywords);
  const hasPendingInput = parseKeywordText(inputValue).length > 0;
  const isDirty = draftKeywordText !== initialKeywordText || hasPendingInput;

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (clearRequestVersionRef.current === clearRequestVersion) return;
    clearRequestVersionRef.current = clearRequestVersion;
    setKeywords([]);
    setInputValue("");
    inputRef.current?.focus({ preventScroll: true });
  }, [clearRequestVersion]);

  const mergePendingInput = () => {
    const nextKeywords = normalizeKeywordList([...keywords, ...parseKeywordText(inputValue)]);
    setKeywords(nextKeywords);
    setInputValue("");
    return nextKeywords;
  };

  return (
    <div
      className="keyword-tag-editor"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        if (!isSaving) onCancel();
      }}
    >
      {keywords.length > 0 && <div className="keyword-tag-editor-list">
        {keywords.map((keyword) => <span className="keyword-tag-editor-tag" key={keyword}>
          <span>{keyword}</span>
          <button
            type="button"
            disabled={isSaving}
            aria-label={t("preview.sidebar.removeKeyword", { keyword })}
            onClick={() => setKeywords((current) => current.filter((candidate) => candidate !== keyword))}
          ><SvgIcon svg={clearIcon} className="cap-svg-icon keyword-tag-editor-remove-icon" /></button>
        </span>)}
      </div>}
      <div className="keyword-tag-editor-entry">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          disabled={isSaving}
          placeholder={t("preview.sidebar.keywordInputPlaceholder")}
          aria-label={t("preview.sidebar.keywordInputLabel")}
          onChange={(event) => setInputValue(event.target.value)}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onKeyDown={(event) => {
            const nativeEvent = event.nativeEvent as KeyboardEvent;
            if (event.key !== "Enter" || nativeEvent.isComposing || composingRef.current || event.repeat) return;
            event.preventDefault();
            event.stopPropagation();
            mergePendingInput();
          }}
        />
      </div>
      <div className="keyword-tag-editor-actions">
        <button type="button" disabled={isSaving} onClick={onCancel}>{t("common.cancel")}</button>
        <button
          className="is-primary"
          type="button"
          disabled={isSaving || !isDirty}
          onClick={() => onSave(mergePendingInput())}
        >{t(isSaving ? "common.saving" : "common.save")}</button>
      </div>
      <div className={`keyword-tag-editor-status${error ? " is-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite">
        {error || (isDirty ? t("preview.sidebar.unsavedKeywords") : "")}
      </div>
    </div>
  );
};

export default KeywordTagEditor;
