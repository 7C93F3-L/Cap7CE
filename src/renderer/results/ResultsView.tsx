import { useCallback, useEffect, useRef, useState } from "react";
import type * as React from "react";
import { getActiveLanguage, t } from "../../../electron/localization";
import type { AppearanceColors, ImageIndexItem, PreviewWindowData, SearchState } from "../../shared/types";
import { resolveFileContentPreview } from "../contentPreview";
import { isEditableKeyboardTarget } from "../keyboardTarget";
import { createSpaceHoldController, createSpaceReleaseGuard, isPlainSpaceShortcut } from "../keywordEditorInteraction";
import { VirtualImageGrid, VirtualUnrecognizedList, type ResultShellState } from "./VirtualResultGrids";

type SpacePressSnapshot = {
  index: number;
  items: ImageIndexItem[];
};

const areImageIdSetsEqual = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>
) => left.size === right.size && [...left].every((imageId) => right.has(imageId));

const toFullImageUrl = (filePath: string) => `cap7ce://image/?path=${encodeURIComponent(filePath)}`;
const toSearchShellPreviewUrl = (filePath: string) => `cap7ce://search-shell-preview/?path=${encodeURIComponent(filePath)}`;

export interface ResultsViewProps {
  shellState: ResultShellState;
  search: SearchState;
  searchCapsule: React.ReactNode;
  images: ImageIndexItem[];
  isSearching: boolean;
  searchError: string;
  contextMenuTheme: "light" | "dark";
  appearanceColors: AppearanceColors;
  imageContextMenuOpen: boolean;
  keywordEditorOpen: boolean;
  selectedImageId: string | null;
  clearSelectionRequestId: number;
  scrollTop: number;
  onSelectedImageChange: (imageId: string | null) => void;
  onScrollTopChange: (scrollTop: number) => void;
  onFeedback: (message: string) => void;
  onEditKeywords: (items: ImageIndexItem[]) => void;
  onContextMenu: (event: React.MouseEvent, item: ImageIndexItem, selectedItems: ImageIndexItem[], preview: () => void) => void;
  onContextMenuClose: () => void;
  onOpenImage: (item: ImageIndexItem) => void;
  onOpenSkim: () => void;
}

export const ResultsView = ({ shellState, search, searchCapsule, images, isSearching, searchError, contextMenuTheme, appearanceColors, imageContextMenuOpen, keywordEditorOpen, selectedImageId, clearSelectionRequestId, scrollTop, onSelectedImageChange, onScrollTopChange, onFeedback, onEditKeywords, onContextMenu, onContextMenuClose, onOpenImage, onOpenSkim }: ResultsViewProps) => {
  const [gridMetrics, setGridMetrics] = useState({ left: 0, right: 0, columnCount: 1 });
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [scrollTargetIndex, setScrollTargetIndex] = useState<number | null>(null);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(
    () => new Set(selectedImageId ? [selectedImageId] : [])
  );
  const selectionAnchorIdRef = useRef<string | null>(selectedImageId);
  const handledClearSelectionRequestIdRef = useRef(clearSelectionRequestId);
  const previewSessionCounterRef = useRef(0);
  const previewOpenRequestRef = useRef(0);
  const previewIndexRef = useRef<number | null>(null);
  const [isSpaceHolding, setIsSpaceHolding] = useState(false);
  const spaceReleaseGuardRef = useRef(createSpaceReleaseGuard());
  const updateGridMetrics = useCallback((nextMetrics: { left: number; right: number; columnCount: number }) => {
    setGridMetrics((currentMetrics) => {
      if (currentMetrics.left === nextMetrics.left && currentMetrics.right === nextMetrics.right && currentMetrics.columnCount === nextMetrics.columnCount) {
        return currentMetrics;
      }
      return nextMetrics;
    });
  }, []);
  const isUnrecognizedView = search.recognitionStatus === "unrecognized";
  const selectedImageIndex = selectedImageId ? images.findIndex((image) => image.id === selectedImageId) : -1;
  const activePreviewIndex = previewIndex !== null && images[previewIndex] ? previewIndex : null;
  const openPreviewAtIndex = useCallback(async (index: number) => {
    const openRequestId = ++previewOpenRequestRef.current;
    const image = images[index];
    const previewApi = window.imageEverything?.preview;
    if (!image || !previewApi) {
      return;
    }

    onContextMenuClose();
    if (!selectedImageIds.has(image.id)) {
      setSelectedImageIds(new Set([image.id]));
      selectionAnchorIdRef.current = image.id;
    }
    onSelectedImageChange(image.id);
    let previewData: PreviewWindowData;
    if ((image.resultKind === "file" && !image.canShellPreview) || image.previewKind !== "image") {
      try {
        const info = await window.imageEverything?.skim.inspect({ path: image.filePath, kind: "file" });
        if (!info || previewOpenRequestRef.current !== openRequestId) return;
        const contentPreview = await resolveFileContentPreview(image.filePath, image.previewKind);
        if (previewOpenRequestRef.current !== openRequestId) return;
        previewData = {
          sessionId: `${image.id}:${Date.now()}:${++previewSessionCounterRef.current}`,
          itemId: image.id,
          filePath: image.filePath,
          fileName: image.fileName,
          fileSize: image.fileSize,
          previewUrl: contentPreview.previewUrl,
          thumbnailUrl: "",
          provider: contentPreview.provider,
          info,
          textPreview: contentPreview.textPreview,
          skimActive: false,
          theme: contextMenuTheme,
          language: getActiveLanguage(),
          appearanceColors
        };
      } catch {
        return;
      }
    } else {
      previewData = {
        sessionId: `${image.id}:${Date.now()}:${++previewSessionCounterRef.current}`,
        itemId: image.id,
        filePath: image.filePath,
        fileName: image.fileName,
        fileSize: image.fileSize,
        previewUrl: image.canShellPreview
          ? toSearchShellPreviewUrl(image.filePath)
          : toFullImageUrl(image.filePath),
        thumbnailUrl: image.thumbnailUrl,
        skimActive: false,
        theme: contextMenuTheme,
        language: getActiveLanguage(),
        appearanceColors
      };
    }
    previewIndexRef.current = index;
    setPreviewIndex(index);
    void previewApi.open(previewData).then((opened) => {
      if (!opened) {
        if (previewIndexRef.current === index) {
          previewIndexRef.current = null;
        }
        setPreviewIndex((currentIndex) => currentIndex === index ? null : currentIndex);
      }
    });
  }, [appearanceColors, contextMenuTheme, images, onContextMenuClose, onSelectedImageChange, selectedImageIds]);

  const openPreviewForItem = useCallback((item: ImageIndexItem) => {
    const index = images.findIndex((image) => image.id === item.id);
    if (index >= 0) {
      openPreviewAtIndex(index);
    }
  }, [images, openPreviewAtIndex]);

  const spaceHoldControllerRef = useRef<ReturnType<typeof createSpaceHoldController<SpacePressSnapshot>> | null>(null);
  if (!spaceHoldControllerRef.current) {
    spaceHoldControllerRef.current = createSpaceHoldController<SpacePressSnapshot>({
      delayMs: 350,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelScheduled: (handle) => window.clearTimeout(handle as number),
      onShortPress: () => undefined,
      onLongPress: () => undefined
    });
  }
  const spaceHoldController = spaceHoldControllerRef.current;
  spaceHoldController.updateHandlers({
    onShortPress: (snapshot) => {
      setIsSpaceHolding(false);
      openPreviewAtIndex(snapshot.index);
    },
    onLongPress: (snapshot) => {
      setIsSpaceHolding(false);
      spaceReleaseGuardRef.current.activate();
      onEditKeywords(snapshot.items);
    }
  });

  const cancelPendingSpaceHold = useCallback(() => {
    spaceHoldController.cancel();
    setIsSpaceHolding(false);
  }, [spaceHoldController]);

  const cancelSpaceHold = useCallback(() => {
    spaceReleaseGuardRef.current.cancel();
    cancelPendingSpaceHold();
  }, [cancelPendingSpaceHold]);

  useEffect(() => () => {
    spaceReleaseGuardRef.current.cancel();
    spaceHoldController.cancel();
  }, [spaceHoldController]);

  useEffect(() => {
    if (keywordEditorOpen) {
      cancelPendingSpaceHold();
      return;
    }
    cancelSpaceHold();
  }, [cancelPendingSpaceHold, cancelSpaceHold, imageContextMenuOpen, keywordEditorOpen, selectedImageId, shellState]);

  const movePreview = useCallback((direction: -1 | 1) => {
    onContextMenuClose();
    if (images.length === 0) {
      return;
    }
    const baseIndex = activePreviewIndex ?? Math.max(0, selectedImageIndex);
    const nextIndex = Math.min(images.length - 1, Math.max(0, baseIndex + direction));
    if (nextIndex === baseIndex) {
      return;
    }
    openPreviewAtIndex(nextIndex);
  }, [activePreviewIndex, images.length, onContextMenuClose, openPreviewAtIndex, selectedImageIndex]);

  useEffect(() => {
    const unsubscribeNavigate = window.imageEverything?.preview.onNavigate(movePreview);
    const unsubscribeClosed = window.imageEverything?.preview.onClosed(() => {
      previewOpenRequestRef.current += 1;
      const lastPreviewIndex = previewIndexRef.current;
      previewIndexRef.current = null;
      setPreviewIndex(null);
      if (lastPreviewIndex !== null) {
        setScrollTargetIndex(lastPreviewIndex);
      }
    });
    return () => {
      unsubscribeNavigate?.();
      unsubscribeClosed?.();
    };
  }, [movePreview]);

  useEffect(() => {
    const validImageIds = new Set(images.map((image) => image.id));
    const nextSelectedImageIds = new Set(
      [...selectedImageIds].filter((imageId) => validImageIds.has(imageId))
    );

    if (!areImageIdSetsEqual(selectedImageIds, nextSelectedImageIds)) {
      setSelectedImageIds(nextSelectedImageIds);
    }

    if (selectionAnchorIdRef.current && !validImageIds.has(selectionAnchorIdRef.current)) {
      selectionAnchorIdRef.current = null;
    }

    if (!selectedImageId || !nextSelectedImageIds.has(selectedImageId)) {
      const remainingImageIds = [...nextSelectedImageIds];
      const nextActiveImageId = remainingImageIds[remainingImageIds.length - 1] ?? null;
      if (nextActiveImageId !== selectedImageId) {
        onSelectedImageChange(nextActiveImageId);
      }
    }

    if (selectedImageId && !validImageIds.has(selectedImageId)) {
      previewIndexRef.current = null;
      setPreviewIndex(null);
      void window.imageEverything?.preview.close();
      onContextMenuClose();
    }
  }, [images, onContextMenuClose, onSelectedImageChange, selectedImageId, selectedImageIds]);

  useEffect(() => () => onContextMenuClose(), [onContextMenuClose]);

  const selectImageByIndex = useCallback((index: number) => {
    if (images.length === 0) {
      return;
    }

    const safeIndex = Math.min(images.length - 1, Math.max(0, index));
    const imageId = images[safeIndex]?.id ?? null;
    setSelectedImageIds(new Set(imageId ? [imageId] : []));
    selectionAnchorIdRef.current = imageId;
    onSelectedImageChange(imageId);
    setScrollTargetIndex(safeIndex);
    onContextMenuClose();
  }, [images, onContextMenuClose, onSelectedImageChange]);

  const handleImageClick = useCallback((event: React.MouseEvent, item: ImageIndexItem) => {
    const itemIndex = images.findIndex((image) => image.id === item.id);
    if (itemIndex < 0) {
      return;
    }

    if (event.shiftKey) {
      const anchorIndex = selectionAnchorIdRef.current
        ? images.findIndex((image) => image.id === selectionAnchorIdRef.current)
        : -1;
      if (anchorIndex >= 0) {
        const nextSelectedImageIds = event.ctrlKey || event.metaKey
          ? new Set(selectedImageIds)
          : new Set<string>();
        const rangeStart = Math.min(anchorIndex, itemIndex);
        const rangeEnd = Math.max(anchorIndex, itemIndex);
        for (let index = rangeStart; index <= rangeEnd; index += 1) {
          nextSelectedImageIds.add(images[index].id);
        }
        setSelectedImageIds(nextSelectedImageIds);
        onSelectedImageChange(item.id);
        onContextMenuClose();
        return;
      }
    }

    if (event.ctrlKey || event.metaKey) {
      const nextSelectedImageIds = new Set(selectedImageIds);
      if (nextSelectedImageIds.has(item.id)) {
        nextSelectedImageIds.delete(item.id);
        const remainingImageIds = [...nextSelectedImageIds];
        const nextActiveImageId = selectedImageId && nextSelectedImageIds.has(selectedImageId)
          ? selectedImageId
          : remainingImageIds[remainingImageIds.length - 1] ?? null;
        setSelectedImageIds(nextSelectedImageIds);
        onSelectedImageChange(nextActiveImageId);
      } else {
        nextSelectedImageIds.add(item.id);
        setSelectedImageIds(nextSelectedImageIds);
        onSelectedImageChange(item.id);
      }
      selectionAnchorIdRef.current = item.id;
      onContextMenuClose();
      return;
    }

    setSelectedImageIds(new Set([item.id]));
    selectionAnchorIdRef.current = item.id;
    onSelectedImageChange(item.id);
    onContextMenuClose();
  }, [images, onContextMenuClose, onSelectedImageChange, selectedImageId, selectedImageIds]);

  const startFileDrag = useCallback((event: React.DragEvent, item: ImageIndexItem) => {
    event.preventDefault();
    const draggedItems = selectedImageIds.has(item.id)
      ? images.filter((image) => selectedImageIds.has(image.id))
      : [item];
    window.imageEverything?.files.startDrag(
      draggedItems.map((draggedItem) => draggedItem.filePath)
    );
  }, [images, selectedImageIds]);

  const openContextMenuForItem = useCallback((
    event: React.MouseEvent,
    item: ImageIndexItem,
    preview: () => void
  ) => {
    const contextSelectionIds = selectedImageIds.has(item.id)
      ? selectedImageIds
      : new Set([item.id]);
    if (!selectedImageIds.has(item.id)) {
      setSelectedImageIds(contextSelectionIds);
    }
    const contextItems = images.filter((image) => contextSelectionIds.has(image.id));
    selectionAnchorIdRef.current = item.id;
    onSelectedImageChange(item.id);
    onContextMenu(event, item, contextItems, preview);
  }, [images, onContextMenu, onSelectedImageChange, selectedImageIds]);

  const clearResultSelection = useCallback(() => {
    const focusedElement = document.activeElement;
    if (
      focusedElement instanceof HTMLElement &&
      focusedElement.closest(".thumb, .unrecognized-item")
    ) {
      focusedElement.blur();
    }

    setSelectedImageIds((currentSelectedImageIds) => (
      currentSelectedImageIds.size === 0 ? currentSelectedImageIds : new Set()
    ));
    selectionAnchorIdRef.current = null;
    onSelectedImageChange(null);
    setScrollTargetIndex(null);
  }, [onSelectedImageChange]);

  useEffect(() => {
    if (handledClearSelectionRequestIdRef.current === clearSelectionRequestId) {
      return;
    }
    handledClearSelectionRequestIdRef.current = clearSelectionRequestId;
    clearResultSelection();
  }, [clearResultSelection, clearSelectionRequestId]);

  const clearSelectionFromPointerEvent = useCallback((event: PointerEvent) => {
    if (event.button !== 0 || !["micro", "mini", "normal"].includes(shellState)) {
      return;
    }

    const target = event.target;
    const targetElement = target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

    if (!targetElement) {
      return;
    }

    const inTile = Boolean(targetElement.closest('[data-result-tile="true"]'));
    const inCapsule = Boolean(targetElement.closest('[data-search-capsule="true"]'));
    const inControls = Boolean(targetElement.closest('[data-window-controls="true"], .cap-settings-toggle'));
    const inMenu = Boolean(targetElement.closest('[data-context-menu="true"], .cap7ce-label-menu'));
    const inSettings = Boolean(targetElement.closest('[data-settings-view="true"]'));
    const willClear = !(inTile || inCapsule || inControls || inMenu || inSettings);

    if (!willClear) {
      return;
    }

    clearResultSelection();
  }, [clearResultSelection, shellState]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      clearSelectionFromPointerEvent(event);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [clearSelectionFromPointerEvent]);

  const moveSelection = useCallback((direction: "left" | "right" | "up" | "down") => {
    if (images.length === 0) {
      return;
    }

    const focusedElement = document.activeElement;
    if (
      focusedElement instanceof HTMLElement &&
      (focusedElement.classList.contains("thumb") || focusedElement.classList.contains("unrecognized-item"))
    ) {
      focusedElement.blur();
    }

    if (selectedImageIndex < 0) {
      selectImageByIndex(0);
      return;
    }

    const columnCount = Math.max(1, gridMetrics.columnCount);
    const currentRow = Math.floor(selectedImageIndex / columnCount);
    const totalRows = Math.ceil(images.length / columnCount);

    if (direction === "up") {
      if (currentRow === 0) return;
      selectImageByIndex(selectedImageIndex - columnCount);
      return;
    }

    if (direction === "down") {
      if (currentRow >= totalRows - 1) return;
      selectImageByIndex(Math.min(images.length - 1, selectedImageIndex + columnCount));
      return;
    }

    if (direction === "left") {
      if (selectedImageIndex === 0) return;
      selectImageByIndex(selectedImageIndex - 1);
      return;
    }

    if (selectedImageIndex >= images.length - 1) return;
    selectImageByIndex(selectedImageIndex + 1);
  }, [gridMetrics.columnCount, images.length, selectImageByIndex, selectedImageIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (spaceReleaseGuardRef.current.shouldSuppressKeyDown(event.code)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (event.ctrlKey && !event.altKey && !event.shiftKey && event.code === "KeyC" && selectedImageIds.size > 0) {
        event.preventDefault();
        if (event.repeat) return;
        const selectedPaths = images
          .filter((image) => selectedImageIds.has(image.id))
          .map((image) => image.filePath);
        void window.imageEverything?.files.copyItems(selectedPaths).then((copiedCount) => {
          onFeedback(copiedCount > 0
            ? t("clipboard.itemsCopied", { count: copiedCount })
            : t("clipboard.copyFailed"));
        }).catch(() => onFeedback(t("clipboard.copyFailed")));
        return;
      }

      if (isPlainSpaceShortcut(event)) {
        event.preventDefault();
        if (event.repeat || selectedImageIndex < 0 || imageContextMenuOpen || keywordEditorOpen) return;
        const focusedElement = document.activeElement;
        if (
          focusedElement instanceof HTMLElement &&
          focusedElement.closest(".thumb, .unrecognized-item")
        ) {
          focusedElement.blur();
        }
        const activeItem = images[selectedImageIndex];
        const selectedItems = images.filter((image) => selectedImageIds.has(image.id));
        if (spaceHoldController.start({
          index: selectedImageIndex,
          items: selectedItems.length > 0 ? selectedItems : [activeItem]
        })) setIsSpaceHolding(true);
        return;
      }

      if (event.key === "Enter" && selectedImageIndex >= 0) {
        event.preventDefault();
        onOpenImage(images[selectedImageIndex]);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelection("left");
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSelection("right");
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection("up");
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection("down");
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (spaceReleaseGuardRef.current.consumeKeyUp(event.code)) {
        event.preventDefault();
        event.stopPropagation();
        cancelPendingSpaceHold();
        return;
      }
      if (event.code !== "Space" || !spaceHoldController.isActive()) return;
      event.preventDefault();
      spaceHoldController.release();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", cancelSpaceHold);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", cancelSpaceHold);
      spaceHoldController.cancel();
    };
  }, [cancelPendingSpaceHold, cancelSpaceHold, imageContextMenuOpen, images, keywordEditorOpen, moveSelection, onFeedback, onOpenImage, selectedImageIds, selectedImageIndex, spaceHoldController]);
  return (
    <main className={`results-view cap-results-view${isUnrecognizedView ? " cap-results-view-unrecognized" : ""}`} data-results-view="true">
      {searchCapsule}
      {isUnrecognizedView ? (
        <VirtualUnrecognizedList
          shellState={shellState}
          images={images}
          selectedImageIds={selectedImageIds}
          isSpaceHolding={isSpaceHolding}
          scrollTargetIndex={scrollTargetIndex}
          initialScrollTop={scrollTop}
          isSearching={isSearching}
          searchError={searchError}
          onSelectImage={handleImageClick}
          onScrollTopChange={onScrollTopChange}
          onScrollTargetHandled={() => setScrollTargetIndex(null)}
          onContextMenu={(event, item) => openContextMenuForItem(event, item, () => openPreviewForItem(item))}
          onOpenImage={onOpenImage}
          onStartDrag={startFileDrag}
          onLayoutChange={updateGridMetrics}
          onOpenSkim={onOpenSkim}
        />
      ) : (
        <VirtualImageGrid
          shellState={shellState}
          images={images}
          selectedImageIds={selectedImageIds}
          isSpaceHolding={isSpaceHolding}
          scrollTargetIndex={scrollTargetIndex}
          initialScrollTop={scrollTop}
          isSearching={isSearching}
          searchError={searchError}
          onSelectImage={handleImageClick}
          onScrollTopChange={onScrollTopChange}
          onScrollTargetHandled={() => setScrollTargetIndex(null)}
          onContextMenu={(event, item) => openContextMenuForItem(event, item, () => openPreviewForItem(item))}
          onOpenImage={onOpenImage}
          onStartDrag={startFileDrag}
          onLayoutChange={updateGridMetrics}
          onOpenSkim={onOpenSkim}
        />
      )}
    </main>
  );
};
