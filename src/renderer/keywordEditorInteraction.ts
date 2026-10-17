export type FloatingAnchor = { x: number; y: number };
export type FloatingSize = { width: number; height: number };

export const clampFloatingCardPosition = (
  anchor: FloatingAnchor,
  card: FloatingSize,
  viewport: FloatingSize,
  gap = 5
) => ({
  left: Math.min(
    Math.max(anchor.x + gap, gap),
    Math.max(gap, viewport.width - card.width - gap)
  ),
  top: Math.min(
    Math.max(anchor.y, gap),
    Math.max(gap, viewport.height - card.height - gap)
  )
});

export const centerFloatingCardPosition = (
  card: FloatingSize,
  viewport: FloatingSize,
  gap = 5
) => ({
  left: Math.min(
    Math.max((viewport.width - card.width) / 2, gap),
    Math.max(gap, viewport.width - card.width - gap)
  ),
  top: Math.min(
    Math.max((viewport.height - card.height) / 2, gap),
    Math.max(gap, viewport.height - card.height - gap)
  )
});

export const isPlainSpaceShortcut = (event: {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}) => event.code === "Space"
  && !event.ctrlKey
  && !event.altKey
  && !event.shiftKey
  && !event.metaKey;

export const shouldSubmitKeywordEditor = (event: {
  key: string;
  isComposing: boolean;
  repeat: boolean;
}) => event.key === "Enter" && !event.isComposing && !event.repeat;

export const isKeywordEditorCancelKey = (key: string) => key === "Escape";

export const getKeywordEditorTextareaMinimumHeight = (viewportHeight: number) => (
  viewportHeight < 200 ? 60 : 76
);

export const getKeywordEditorTextareaMaximumHeight = (viewportHeight: number) => Math.min(
  160,
  Math.max(getKeywordEditorTextareaMinimumHeight(viewportHeight), viewportHeight - 96)
);

export const getKeywordEditorExitDelay = (prefersReducedMotion: boolean) => (
  prefersReducedMotion ? 0 : 180
);
