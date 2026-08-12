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

export const createSpaceReleaseGuard = () => {
  let active = false;
  return {
    activate() {
      active = true;
    },
    shouldSuppressKeyDown(code: string) {
      return active && code === "Space";
    },
    consumeKeyUp(code: string) {
      if (!active || code !== "Space") return false;
      active = false;
      return true;
    },
    cancel() {
      active = false;
    }
  };
};

type SpaceHoldOptions<T> = {
  delayMs: number;
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancelScheduled: (handle: unknown) => void;
  onShortPress: (value: T) => void;
  onLongPress: (value: T) => void;
};

export const createSpaceHoldController = <T>(options: SpaceHoldOptions<T>) => {
  let pendingValue: T | null = null;
  let timer: unknown = null;
  let longPressTriggered = false;

  const clearTimer = () => {
    if (timer !== null) {
      options.cancelScheduled(timer);
      timer = null;
    }
  };

  return {
    start(value: T) {
      if (pendingValue !== null || longPressTriggered) return false;
      pendingValue = value;
      timer = options.schedule(() => {
        timer = null;
        const activeValue = pendingValue;
        if (activeValue === null) return;
        longPressTriggered = true;
        options.onLongPress(activeValue);
      }, options.delayMs);
      return true;
    },
    release() {
      const activeValue = pendingValue;
      if (activeValue === null) return false;
      clearTimer();
      if (!longPressTriggered) {
        options.onShortPress(activeValue);
      }
      pendingValue = null;
      longPressTriggered = false;
      return true;
    },
    cancel() {
      const wasActive = pendingValue !== null;
      clearTimer();
      pendingValue = null;
      longPressTriggered = false;
      return wasActive;
    },
    isActive() {
      return pendingValue !== null;
    }
  };
};
