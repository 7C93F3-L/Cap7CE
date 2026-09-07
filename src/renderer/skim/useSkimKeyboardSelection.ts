import { useEffect, useMemo, type RefObject } from "react";
import type { SkimBrowseEntry, SkimLocationShortcut } from "../../shared/types";
import { isEditableKeyboardTarget } from "../keyboardTarget";
import { getScrollLeftToRevealItem, getScrollTopToRevealItem, imageGridGap } from "../virtualGridLayout";

type SkimSelectionDirection = "left" | "right" | "up" | "down";

export const getSkimKeyboardNavigationPaths = ({
  currentPath,
  entries,
  rootLocations,
  systemLocationsCollapsed,
  starredLocationsCollapsed,
  drivesCollapsed
}: {
  currentPath: string | null;
  entries: SkimBrowseEntry[];
  rootLocations: SkimLocationShortcut[];
  systemLocationsCollapsed: boolean;
  starredLocationsCollapsed: boolean;
  drivesCollapsed: boolean;
}) => {
  if (currentPath !== null) return entries.map((entry) => entry.path);
  const paths: string[] = [];
  if (!systemLocationsCollapsed) {
    paths.push(...rootLocations.flatMap((location) => (
      location.kind !== "computer" && location.kind !== "starred" && location.path ? [location.path] : []
    )));
  }
  if (!starredLocationsCollapsed) {
    paths.push(...rootLocations.flatMap((location) => location.kind === "starred" && location.path ? [location.path] : []));
  }
  if (!drivesCollapsed) paths.push(...entries.filter((entry) => entry.kind === "drive").map((entry) => entry.path));
  return paths;
};

export const getSkimGridNavigationIndex = (
  currentIndex: number,
  direction: SkimSelectionDirection,
  columnCount: number,
  itemCount: number,
  horizontal: boolean
) => {
  if (itemCount <= 0) return -1;
  if (currentIndex < 0) return 0;
  const delta = horizontal
    ? direction === "left" ? -1 : direction === "right" ? 1 : 0
    : direction === "left" ? -1 : direction === "right" ? 1 : direction === "up" ? -Math.max(1, columnCount) : Math.max(1, columnCount);
  return Math.min(itemCount - 1, Math.max(0, currentIndex + delta));
};

export const useSkimKeyboardSelection = ({
  active,
  currentPath,
  entries,
  rootLocations,
  systemLocationsCollapsed,
  starredLocationsCollapsed,
  drivesCollapsed,
  activePath,
  selectedPathCount,
  contextMenuOpen,
  columnCount,
  cellSize,
  horizontal,
  scrollContainerRef,
  onSelectEntry,
  onSelectRootPath,
  onClearSelection
}: {
  active: boolean;
  currentPath: string | null;
  entries: SkimBrowseEntry[];
  rootLocations: SkimLocationShortcut[];
  systemLocationsCollapsed: boolean;
  starredLocationsCollapsed: boolean;
  drivesCollapsed: boolean;
  activePath: string | null;
  selectedPathCount: number;
  contextMenuOpen: boolean;
  columnCount: number;
  cellSize: number;
  horizontal: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
  onSelectEntry: (entry: SkimBrowseEntry) => void;
  onSelectRootPath: (path: string) => void;
  onClearSelection: () => void;
}) => {
  const navigationPaths = useMemo(() => getSkimKeyboardNavigationPaths({ currentPath, entries, rootLocations,
    systemLocationsCollapsed, starredLocationsCollapsed, drivesCollapsed }),
  [currentPath, drivesCollapsed, entries, rootLocations, starredLocationsCollapsed, systemLocationsCollapsed]);
  useEffect(() => {
    if (!active) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableKeyboardTarget(event.target)) return;
      if (contextMenuOpen) {
        if (event.key === "Escape") event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        if (selectedPathCount === 0 && !activePath) return;
        event.preventDefault();
        event.stopPropagation();
        onClearSelection();
        return;
      }
      const direction = event.key === "ArrowLeft" ? "left"
        : event.key === "ArrowRight" ? "right"
          : event.key === "ArrowUp" ? "up"
            : event.key === "ArrowDown" ? "down"
              : null;
      if (!direction || navigationPaths.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      const currentIndex = navigationPaths.indexOf(activePath ?? "");
      const nextIndex = getSkimGridNavigationIndex(currentIndex, direction, columnCount, navigationPaths.length, horizontal);
      const nextPath = navigationPaths[nextIndex];
      if (!nextPath || nextIndex === currentIndex) return;
      if (currentPath === null) onSelectRootPath(nextPath);
      else {
        const nextEntry = entries[nextIndex];
        if (!nextEntry) return;
        onSelectEntry(nextEntry);
      }
      const focusNextEntry = (preventScroll: boolean) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const button = [...document.querySelectorAll<HTMLButtonElement>(".cap-skim-entry")]
          .find((candidate) => candidate.title === nextPath);
        button?.focus({ preventScroll });
      }));
      if (currentPath === null) {
        focusNextEntry(false);
        return;
      }
      const container = scrollContainerRef.current;
      if (!container || cellSize <= 0) return;
      const stride = cellSize + imageGridGap;
      const targetOffset = horizontal
        ? getScrollLeftToRevealItem(container, nextIndex * stride, cellSize, 0)
        : getScrollTopToRevealItem(container, Math.floor(nextIndex / Math.max(1, columnCount)) * stride, cellSize, 0);
      container.scrollTo(horizontal ? { left: targetOffset, behavior: "auto" } : { top: targetOffset, behavior: "auto" });
      focusNextEntry(true);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [active, activePath, cellSize, columnCount, contextMenuOpen, currentPath, entries, horizontal, navigationPaths, onClearSelection, onSelectEntry, onSelectRootPath, scrollContainerRef, selectedPathCount]);
};
