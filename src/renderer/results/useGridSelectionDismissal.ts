import { useCallback, useEffect, type RefObject } from "react";
import { isEditableKeyboardTarget } from "../keyboardTarget";

const preservedArea = '[data-result-tile="true"], [data-selection-preserve="true"], [data-context-menu="true"], [data-window-controls="true"], [data-settings-view="true"]';

export function useGridSelectionDismissal({ rootRef, foreground, hasSelection, menuOpen = false, onClear }: {
  rootRef: RefObject<HTMLElement>; foreground: boolean; hasSelection: boolean; menuOpen?: boolean; onClear: () => void;
}) {
  const dismiss = useCallback(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && rootRef.current?.contains(focused)
      && focused.closest('[data-result-tile="true"]')) focused.blur();
    onClear();
  }, [rootRef, onClear]);
  useEffect(() => {
    if (!foreground || !hasSelection) return;
    const pointerdown = (event: PointerEvent) => {
      if (event.button !== 0 || !rootRef.current) return;
      const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null;
      if (target && !target.closest(preservedArea)) dismiss();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || menuOpen
        || isEditableKeyboardTarget(event.target) || !rootRef.current) return;
      if (event.target instanceof Element && event.target.closest('[data-context-menu="true"]')) return;
      event.preventDefault(); event.stopPropagation(); dismiss();
    };
    document.addEventListener("pointerdown", pointerdown, true);
    window.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", pointerdown, true);
      window.removeEventListener("keydown", keydown);
    };
  }, [dismiss, foreground, hasSelection, menuOpen, rootRef]);
  return dismiss;
}
