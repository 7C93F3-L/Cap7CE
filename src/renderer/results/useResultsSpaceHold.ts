import { useCallback, useEffect, useRef, useState } from "react";
import { createSpaceHoldController, createSpaceReleaseGuard } from "../keywordEditorInteraction";

interface ResultsSpaceHoldOptions<T> {
  onShortPress: (value: T) => void;
  onLongPress: (value: T) => void;
}

export const useResultsSpaceHold = <T>({ onShortPress, onLongPress }: ResultsSpaceHoldOptions<T>) => {
  const [isSpaceHolding, setIsSpaceHolding] = useState(false);
  const releaseGuardRef = useRef(createSpaceReleaseGuard());
  const controllerRef = useRef<ReturnType<typeof createSpaceHoldController<T>> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createSpaceHoldController<T>({
      delayMs: 350,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelScheduled: (handle) => window.clearTimeout(handle as number),
      onShortPress: () => undefined,
      onLongPress: () => undefined
    });
  }
  const controller = controllerRef.current;
  controller.updateHandlers({
    onShortPress: (value) => {
      setIsSpaceHolding(false);
      onShortPress(value);
    },
    onLongPress: (value) => {
      setIsSpaceHolding(false);
      releaseGuardRef.current.activate();
      onLongPress(value);
    }
  });

  const cancelPendingSpaceHold = useCallback(() => {
    controller.cancel();
    setIsSpaceHolding(false);
  }, [controller]);
  const cancelSpaceHold = useCallback(() => {
    releaseGuardRef.current.cancel();
    cancelPendingSpaceHold();
  }, [cancelPendingSpaceHold]);
  const startSpaceHold = useCallback((value: T) => {
    if (controller.start(value)) setIsSpaceHolding(true);
  }, [controller]);
  const isSpaceHoldActive = useCallback(() => controller.isActive(), [controller]);
  const releaseSpaceHold = useCallback(() => controller.release(), [controller]);

  useEffect(() => () => {
    releaseGuardRef.current.cancel();
    controller.cancel();
  }, [controller]);

  useEffect(() => {
    const handleGuardedKeyDown = (event: KeyboardEvent) => {
      if (!releaseGuardRef.current.shouldSuppressKeyDown(event.code)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const handleGuardedKeyUp = (event: KeyboardEvent) => {
      if (!releaseGuardRef.current.consumeKeyUp(event.code)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelPendingSpaceHold();
    };
    window.addEventListener("keydown", handleGuardedKeyDown, true);
    window.addEventListener("keyup", handleGuardedKeyUp, true);
    window.addEventListener("blur", cancelSpaceHold);
    return () => {
      window.removeEventListener("keydown", handleGuardedKeyDown, true);
      window.removeEventListener("keyup", handleGuardedKeyUp, true);
      window.removeEventListener("blur", cancelSpaceHold);
    };
  }, [cancelPendingSpaceHold, cancelSpaceHold]);

  return { isSpaceHolding, startSpaceHold, isSpaceHoldActive, releaseSpaceHold, cancelPendingSpaceHold, cancelSpaceHold };
};
