import { useEffect, useRef } from "react";
import type { CompatibilityCapsulePresentation } from "../../shared/types";

interface CompatibilityCapsuleBridgeOptions {
  active: boolean;
  presentation: CompatibilityCapsulePresentation;
  onCancel: (clearQuery: boolean) => void;
  onDraftChange: (query: string) => void;
  onSubmit: (query: string) => void;
}

export const useCompatibilityCapsuleBridge = ({
  active,
  presentation,
  onCancel,
  onDraftChange,
  onSubmit
}: CompatibilityCapsuleBridgeOptions) => {
  const callbacksRef = useRef({ onCancel, onDraftChange, onSubmit });
  callbacksRef.current = { onCancel, onDraftChange, onSubmit };

  useEffect(() => {
    if (active) void window.cap7ce?.capsule.syncPresentation(presentation);
  }, [active, presentation]);

  useEffect(() => {
    if (!active) return undefined;
    const unsubscribeDraft = window.cap7ce?.capsule.onDraftChanged((query) => callbacksRef.current.onDraftChange(query));
    const unsubscribeSubmit = window.cap7ce?.capsule.onSubmitRequested((query) => callbacksRef.current.onSubmit(query));
    const unsubscribeCancel = window.cap7ce?.capsule.onCancelRequested((clearQuery) => callbacksRef.current.onCancel(clearQuery));
    return () => {
      unsubscribeDraft?.();
      unsubscribeSubmit?.();
      unsubscribeCancel?.();
    };
  }, [active]);
};
