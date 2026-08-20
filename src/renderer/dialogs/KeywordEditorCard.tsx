import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { t } from "../../../electron/localization";
import type { ResolvedThemeMode } from "../../shared/types";
import { splitMiddleEllipsisFileName } from "../ImageContextMenu";
import {
  centerFloatingCardPosition,
  getKeywordEditorTextareaMaximumHeight,
  isKeywordEditorCancelKey,
  shouldSubmitKeywordEditor
} from "../keywordEditorInteraction";
import { formatCacheSize } from "../formatting";
import type { KeywordEditSession } from "./dialogTypes";

interface KeywordEditorCardProps {
  session: KeywordEditSession;
  keywords: string;
  error: string;
  isSaving: boolean;
  isClosing: boolean;
  menuStyle: CSSProperties;
  theme: ResolvedThemeMode;
  onKeywordsChange: (keywords: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onExitComplete: () => void;
}

const getDirectParentPath = (filePath: string) => {
  const normalizedPath = filePath.replace(/\//g, "\\");
  const separatorIndex = normalizedPath.lastIndexOf("\\");
  return separatorIndex >= 0 ? normalizedPath.slice(0, separatorIndex).toLocaleLowerCase() : "";
};

const KeywordEditorCard = ({
  session,
  keywords,
  error,
  isSaving,
  isClosing,
  menuStyle,
  theme,
  onKeywordsChange,
  onSave,
  onCancel,
  onExitComplete
}: KeywordEditorCardProps) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const composingRef = useRef(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const resizeTextarea = useCallback((textarea: HTMLTextAreaElement) => {
    const maxHeight = getKeywordEditorTextareaMaximumHeight(window.innerHeight);
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const card = cardRef.current;
    if (!textarea || !card) return;
    resizeTextarea(textarea);
    const bounds = card.getBoundingClientRect();
    setPosition(centerFloatingCardPosition(
      { width: bounds.width, height: bounds.height },
      { width: window.innerWidth, height: window.innerHeight }
    ));
  }, [keywords, resizeTextarea]);

  useEffect(() => {
    const handleResize = () => {
      const card = cardRef.current;
      if (!card) return;
      const bounds = card.getBoundingClientRect();
      setPosition(centerFloatingCardPosition(
        { width: bounds.width, height: bounds.height },
        { width: window.innerWidth, height: window.innerHeight }
      ));
    };
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleResize);
    if (cardRef.current) resizeObserver?.observe(cardRef.current);
    window.addEventListener("resize", handleResize);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!position || !textareaRef.current) return undefined;
    const focusFrame = window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [position]);

  const firstItem = session.items[0];
  const isSingle = session.mode === "single";
  const formatCounts = new Map<string, number>();
  for (const item of session.items) {
    const format = item.extension.slice(1).toUpperCase() || t("fileInfo.file");
    formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);
  }
  const formatComposition = [...formatCounts.entries()]
    .map(([format, count]) => `${count} ${format}`)
    .join(" / ");
  const directoryCount = new Set(session.items.map((item) => getDirectParentPath(item.filePath))).size;
  const compactFormatComposition = formatCounts.size <= 3
    ? formatComposition
    : t("keywords.formatCount", { count: formatCounts.size });
  const headerTooltip = isSingle
    ? [
      firstItem.fileName,
      formatCacheSize(firstItem.fileSize),
      ...(firstItem.imageWidth > 0 && firstItem.imageHeight > 0
        ? [t("fileInfo.resolution", { width: firstItem.imageWidth, height: firstItem.imageHeight })]
        : [])
    ].join("\n")
    : [
      t("keywords.selectedCount", { count: session.items.length }),
      t("keywords.directoryCount", { count: directoryCount }),
      formatComposition
    ].join("\n");
  const splitFileName = splitMiddleEllipsisFileName(firstItem.fileName);

  return createPortal(
    <div
      ref={cardRef}
      className={`context-menu context-menu-${theme} keyword-editor-card${isClosing ? " is-closing" : ""}`}
      data-context-menu="true"
      data-keyword-editor="true"
      style={{
        ...menuStyle,
        left: position?.left ?? window.innerWidth / 2,
        top: position?.top ?? window.innerHeight / 2,
        visibility: position ? "visible" : "hidden"
      }}
      role="dialog"
      aria-modal="false"
      aria-label={t("context.editKeywords")}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        className="cap7ce-menu-motion-surface keyword-editor-card-surface"
        onAnimationEnd={(event) => {
          if (isClosing && event.animationName === "cap7ce-keyword-card-exit") onExitComplete();
        }}
      >
        <div className="context-menu-file-header keyword-editor-card-header" title={headerTooltip}>
          {isSingle ? (
            <>
              <div className="context-menu-file-heading">
                <span className="context-menu-file-format">{firstItem.extension.slice(1).toUpperCase() || t("fileInfo.file")}</span>
                <span className="context-menu-file-primary-detail">{formatCacheSize(firstItem.fileSize)}</span>
              </div>
              <span className="context-menu-file-name">
                <span className="context-menu-file-name-leading">{splitFileName.leading}</span>
                {splitFileName.trailing && <span className="context-menu-file-name-trailing">{splitFileName.trailing}</span>}
              </span>
            </>
          ) : (
            <>
              <div className="context-menu-file-heading">
                <span className="context-menu-file-format keyword-editor-multi-heading">
                  {t("keywords.selectedCount", { count: session.items.length })}
                </span>
                <span className="context-menu-file-primary-detail">
                  {t("keywords.directoryCount", { count: directoryCount })}
                </span>
              </div>
              <span className="context-menu-file-name keyword-editor-format-composition">{compactFormatComposition}</span>
            </>
          )}
        </div>
        <textarea
          ref={textareaRef}
          className="keyword-editor-textarea"
          value={keywords}
          onChange={(event) => onKeywordsChange(event.target.value)}
          onInput={(event) => resizeTextarea(event.currentTarget)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (isKeywordEditorCancelKey(event.key)) {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
              return;
            }
            const nativeEvent = event.nativeEvent as KeyboardEvent;
            if (shouldSubmitKeywordEditor({
              key: event.key,
              isComposing: nativeEvent.isComposing || composingRef.current,
              repeat: nativeEvent.repeat
            })) {
              event.preventDefault();
              event.stopPropagation();
              onSave();
            }
          }}
          disabled={isSaving || isClosing}
          placeholder={t("keywords.placeholder")}
          aria-label={t("keywords.label")}
        />
        {error && <div className="keyword-editor-error" role="alert">{error}</div>}
      </div>
    </div>,
    document.body
  );
};

export default KeywordEditorCard;
