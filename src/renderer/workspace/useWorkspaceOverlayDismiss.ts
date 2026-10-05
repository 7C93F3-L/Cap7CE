import { useEffect } from "react";

export const useWorkspaceOverlayDismiss = (directoriesOpen: boolean, filtersOpen: boolean, editing: boolean, closeDirectories: () => void, closeFilters: () => void) => {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector(".cap-stable-sidebar-flyout") || editing) return;
      if (!directoriesOpen && !filtersOpen) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (directoriesOpen) closeDirectories(); else closeFilters();
      document.querySelector<HTMLButtonElement>(directoriesOpen ? '.cap-workspace-rail button:nth-child(2)' : '.cap-workspace-rail button:nth-child(3)')?.focus({ preventScroll: true });
    };
    const pointer = (event: PointerEvent) => {
      if (!filtersOpen || (window.innerWidth >= 1100 && window.innerHeight >= 360)) return;
      if (!(event.target as Element).closest?.(".cap-workspace-filter-panel, .cap-stable-sidebar-flyout, .cap-workspace-rail")) closeFilters();
    };
    window.addEventListener("keydown", key, true); document.addEventListener("pointerdown", pointer);
    return () => { window.removeEventListener("keydown", key, true); document.removeEventListener("pointerdown", pointer); };
  }, [directoriesOpen, filtersOpen, editing, closeDirectories, closeFilters]);
};
