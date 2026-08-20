import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type RefObject
} from "react";
import type React from "react";
import { createPortal } from "react-dom";
import iconSortAscSvg from "../assets/icons/icon-sort-asc.svg?raw";
import iconSortDescSvg from "../assets/icons/icon-sort-desc.svg?raw";
import iconSkimSvg from "../assets/icons/icon-skim.svg?raw";
import SvgIcon from "../components/SvgIcon";
import type {
  DirectoryItem,
  RecognitionStatusFilter,
  SearchLabelVisibilityPreferences,
  SearchState,
  SkimDisplayMode,
  SortDirection,
  SortField
} from "../../shared/types";
import { t, type TranslationKey } from "../../../electron/localization";

export type SearchCapsuleLabelVisibility = SearchLabelVisibilityPreferences;

type MenuPointerPosition = { x: number; y: number };
type ViewportMenuPosition = { left: number; top: number };

const viewportMenuGap = 5;
const clampMenuPositionToViewport = (
  pointerX: number,
  pointerY: number,
  menuWidth: number,
  menuHeight: number
): ViewportMenuPosition => ({
  left: Math.min(Math.max(pointerX, viewportMenuGap), window.innerWidth - menuWidth - viewportMenuGap),
  top: Math.min(Math.max(pointerY, viewportMenuGap), window.innerHeight - menuHeight - viewportMenuGap)
});

const useMeasuredViewportMenuPosition = (
  pointerPosition: MenuPointerPosition | null,
  menuRef: RefObject<HTMLElement | null>,
  measurementKey: string
) => {
  const [measuredPosition, setMeasuredPosition] = useState<(ViewportMenuPosition & { key: string }) | null>(null);

  useLayoutEffect(() => {
    if (!pointerPosition || !menuRef.current) {
      setMeasuredPosition(null);
      return;
    }

    const menuBounds = menuRef.current.getBoundingClientRect();
    const nextPosition = clampMenuPositionToViewport(
      pointerPosition.x,
      pointerPosition.y,
      menuBounds.width,
      menuBounds.height
    );
    setMeasuredPosition({ ...nextPosition, key: measurementKey });
  }, [measurementKey, menuRef, pointerPosition?.x, pointerPosition?.y]);

  return measuredPosition?.key === measurementKey ? measuredPosition : null;
};

const getSortLabels = (): Record<SortField, string> => ({
  file_name: t("sort.field.name"),
  modified_at: t("sort.field.modifiedAt")
});

const getSortDirectionLabels = (): Record<SortDirection, string> => ({
  asc: t("sort.direction.asc"),
  desc: t("sort.direction.desc")
});

const getRecognitionStatusLabels = (): Record<RecognitionStatusFilter, string> => ({
  all: t("filter.allFiles"),
  recognized: t("filter.recognized"),
  unrecognized: t("filter.unrecognized")
});

export type SearchCapsuleDirectoryOption = {
  id: string;
  label: string;
  title?: string;
};

export type SearchCapsuleDirectoryGroup = {
  parentLabel: string;
  collapsedLabel?: string;
  selectedId: string | null;
  options: SearchCapsuleDirectoryOption[];
  onSelect: (id: string) => void;
  onReturnToParent: () => void;
};

export interface Cap7CESearchCapsuleProps {
  search: SearchState;
  directoryName: string;
  directories?: DirectoryItem[];
  labelVisibility: SearchCapsuleLabelVisibility;
  status: React.ReactNode;
  inputFeedback?: string;
  inputFeedbackIsGuide?: boolean;
  autoSearchOnQueryClear?: boolean;
  unified?: boolean;
  leadingContent?: React.ReactNode;
  directoryGroup?: SearchCapsuleDirectoryGroup;
  skimDisplayMode?: SkimDisplayMode;
  enabledLabelGroups?: FilterChipGroup[];
  labelMenuEnabled?: boolean;
  imageContextMenuOpen?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onSearchChange: (search: SearchState) => void;
  onLabelVisibilityChange: (visibility: SearchCapsuleLabelVisibility) => void;
  onSearchOptionsChange?: (search: SearchState) => void;
  onSkimDisplayModeChange?: (mode: SkimDisplayMode) => void;
  onSearch: () => void;
  onImageContextMenuClose?: () => void;
}

export type FilterChipGroup = "skimDisplay" | "directory" | "recognition" | "sort";
export const standardSearchLabelGroups: FilterChipGroup[] = ["skimDisplay", "sort", "directory", "recognition"];

const filterChipEnterStaggerMs = 120;
const filterChipExitDurationMs = 350;
const filterChipExitStaggerMs = 35;
const filterChipMotionMaxStaggerSteps = 6;

export const Cap7CESearchCapsule = ({ search, directoryName, directories = [], labelVisibility, status, inputFeedback = "", inputFeedbackIsGuide = false, autoSearchOnQueryClear = false, unified = false, leadingContent, directoryGroup, skimDisplayMode = "skim", enabledLabelGroups, labelMenuEnabled = true, imageContextMenuOpen = false, inputRef, onSearchChange, onLabelVisibilityChange, onSearchOptionsChange, onSkimDisplayModeChange, onSearch, onImageContextMenuClose }: Cap7CESearchCapsuleProps) => {
  const [skimDisplayChipsOpen, setSkimDisplayChipsOpen] = useState(false);
  const [directoryChipsOpen, setDirectoryChipsOpen] = useState(false);
  const [recognitionChipsOpen, setRecognitionChipsOpen] = useState(false);
  const [sortChipsOpen, setSortChipsOpen] = useState(false);
  const [closingChipGroup, setClosingChipGroup] = useState<FilterChipGroup | null>(null);
  const [labelMenuPointer, setLabelMenuPointer] = useState<MenuPointerPosition | null>(null);
  const [labelMenuThemeStyle, setLabelMenuThemeStyle] = useState<CSSProperties>({});
  const labelMenuRef = useRef<HTMLDivElement | null>(null);
  const chipGroupCloseTimerRef = useRef<number | null>(null);
  const queryClearSearchTimerRef = useRef<number | null>(null);
  const labelMenuMeasurementKey = labelMenuPointer ? `${labelMenuPointer.x}:${labelMenuPointer.y}` : "closed";

  const clearQueryClearSearchTimer = () => {
    if (queryClearSearchTimerRef.current !== null) {
      window.clearTimeout(queryClearSearchTimerRef.current);
      queryClearSearchTimerRef.current = null;
    }
  };

  const clearChipGroupCloseTimer = () => {
    if (chipGroupCloseTimerRef.current !== null) {
      window.clearTimeout(chipGroupCloseTimerRef.current);
      chipGroupCloseTimerRef.current = null;
    }
  };

  const closeChipGroup = (
    group: FilterChipGroup,
    itemCount: number,
    finishClose: () => void
  ) => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(group);
    const staggerSteps = Math.min(
      filterChipMotionMaxStaggerSteps,
      Math.max(0, itemCount - 1)
    );
    chipGroupCloseTimerRef.current = window.setTimeout(() => {
      chipGroupCloseTimerRef.current = null;
      finishClose();
      setClosingChipGroup((current) => current === group ? null : current);
    }, filterChipExitDurationMs + staggerSteps * filterChipExitStaggerMs);
  };

  const prepareChipGroupOpen = () => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
  };

  const getChipMotionStyle = (index: number, itemCount: number): CSSProperties => ({
    "--cap-chip-delay": `${Math.min(index, filterChipMotionMaxStaggerSteps) * filterChipEnterStaggerMs}ms`,
    "--cap-chip-exit-delay": `${Math.min(
      Math.max(0, itemCount - 1 - index),
      filterChipMotionMaxStaggerSteps
    ) * filterChipExitStaggerMs}ms`
  } as CSSProperties);

  useEffect(() => () => {
    clearChipGroupCloseTimer();
    clearQueryClearSearchTimer();
  }, []);

  useEffect(() => {
    clearQueryClearSearchTimer();
  }, [search.directoryId, search.fileFormat, search.recognitionStatus, search.sortDirection, search.sortField]);

  useEffect(() => {
    if (!skimDisplayChipsOpen && !directoryChipsOpen && !recognitionChipsOpen && !sortChipsOpen && !labelMenuPointer) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      clearChipGroupCloseTimer();
      setClosingChipGroup(null);
      setDirectoryChipsOpen(false);
      setRecognitionChipsOpen(false);
      setSortChipsOpen(false);
      setLabelMenuPointer(null);
    };

    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [directoryChipsOpen, labelMenuPointer, recognitionChipsOpen, skimDisplayChipsOpen, sortChipsOpen]);
  const measuredLabelMenuPosition = useMeasuredViewportMenuPosition(labelMenuPointer, labelMenuRef, labelMenuMeasurementKey);
  const enabledGroups = new Set<FilterChipGroup>(enabledLabelGroups ?? ["directory", "recognition", "sort"]);
  const selectedDirectoryLabel = directoryGroup?.collapsedLabel
    ?? (search.directoryId === "all" ? t("filter.addedDirectories") : directoryName);
  const selectedDirectoryId = directoryGroup?.selectedId ?? (search.directoryId === "all" ? null : search.directoryId);
  const directoryOptions: SearchCapsuleDirectoryOption[] = directoryGroup?.options
    ?? directories
      .filter((directory) => directory.id !== "all")
      .map((directory) => ({ id: directory.id, label: directory.name, title: directory.path }));
  const expandedDirectories = unified && labelVisibility.directory && directoryChipsOpen
    ? directoryOptions
    : [];
  const expandedRecognitionStatuses = unified && recognitionChipsOpen
    ? (["recognized", "unrecognized"] as RecognitionStatusFilter[])
    : [];
  const expandedSkimDisplayModes = unified && labelVisibility.skimDisplay && skimDisplayChipsOpen
    ? (["all", "custom"] as SkimDisplayMode[])
    : [];

  const selectSkimDisplayMode = (mode: SkimDisplayMode) => {
    closeChipGroup("skimDisplay", expandedSkimDisplayModes.length, () => setSkimDisplayChipsOpen(false));
    onSkimDisplayModeChange?.(skimDisplayMode === mode ? "skim" : mode);
  };

  const toggleSkimDisplayChips = () => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
    setDirectoryChipsOpen(false);
    setRecognitionChipsOpen(false);
    setSortChipsOpen(false);
    if (!skimDisplayChipsOpen) {
      prepareChipGroupOpen();
      setSkimDisplayChipsOpen(true);
      return;
    }
    closeChipGroup("skimDisplay", expandedSkimDisplayModes.length, () => setSkimDisplayChipsOpen(false));
    if (skimDisplayMode !== "skim") onSkimDisplayModeChange?.("skim");
  };

  const selectDirectory = (directoryId: string) => {
    if (directoryGroup) {
      closeChipGroup("directory", expandedDirectories.length, () => setDirectoryChipsOpen(false));
      setSkimDisplayChipsOpen(false);
      if (directoryId === directoryGroup.selectedId) directoryGroup.onReturnToParent();
      else directoryGroup.onSelect(directoryId);
      return;
    }
    const nextSearch = {
      ...search,
      directoryId: search.directoryId === directoryId ? "all" : directoryId
    };
    closeChipGroup("directory", expandedDirectories.length, () => setDirectoryChipsOpen(false));
    onSearchChange(nextSearch);
    onSearchOptionsChange?.(nextSearch);
  };

  const selectRecognitionStatus = (recognitionStatus: RecognitionStatusFilter) => {
    const nextSearch = {
      ...search,
      recognitionStatus: search.recognitionStatus === recognitionStatus ? "all" : recognitionStatus
    };
    closeChipGroup("recognition", expandedRecognitionStatuses.length, () => setRecognitionChipsOpen(false));
    onSearchChange(nextSearch);
    onSearchOptionsChange?.(nextSearch);
  };

  const toggleDirectoryChips = () => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
    setRecognitionChipsOpen(false);
    setSortChipsOpen(false);
    setSkimDisplayChipsOpen(false);
    if (!directoryChipsOpen) {
      prepareChipGroupOpen();
      setDirectoryChipsOpen(true);
      return;
    }
    closeChipGroup("directory", expandedDirectories.length, () => setDirectoryChipsOpen(false));
    if (directoryGroup) {
      directoryGroup.onReturnToParent();
    } else if (search.directoryId !== "all") {
      const nextSearch = { ...search, directoryId: "all" };
      onSearchChange(nextSearch);
      onSearchOptionsChange?.(nextSearch);
    }
  };

  const toggleRecognitionChips = () => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
    setDirectoryChipsOpen(false);
    setSortChipsOpen(false);
    setSkimDisplayChipsOpen(false);
    if (!recognitionChipsOpen) {
      prepareChipGroupOpen();
      setRecognitionChipsOpen(true);
      return;
    }
    closeChipGroup("recognition", expandedRecognitionStatuses.length, () => setRecognitionChipsOpen(false));
    if (search.recognitionStatus !== "all") {
      const nextSearch = { ...search, recognitionStatus: "all" as RecognitionStatusFilter };
      onSearchChange(nextSearch);
      onSearchOptionsChange?.(nextSearch);
    }
  };

  const toggleSortChips = () => {
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
    setDirectoryChipsOpen(false);
    setRecognitionChipsOpen(false);
    setSkimDisplayChipsOpen(false);
    if (!sortChipsOpen) {
      prepareChipGroupOpen();
      setSortChipsOpen(true);
      return;
    }
    closeChipGroup("sort", 4, () => setSortChipsOpen(false));
  };

  const selectSortDirection = (sortDirection: SortDirection) => {
    const nextSearch = { ...search, sortDirection };
    onSearchChange(nextSearch);
    onSearchOptionsChange?.(nextSearch);
  };

  const selectSortField = (sortField: SortField) => {
    const nextSearch = { ...search, sortField };
    onSearchChange(nextSearch);
    onSearchOptionsChange?.(nextSearch);
  };

  const updateLabelVisibility = (nextVisibility: SearchCapsuleLabelVisibility) => {
    if (!nextVisibility.directory) {
      setDirectoryChipsOpen(false);
    }
    if (!nextVisibility.recognition) {
      setRecognitionChipsOpen(false);
    }
    if (!nextVisibility.sort) {
      setSortChipsOpen(false);
    }
    if (!nextVisibility.skimDisplay) {
      setSkimDisplayChipsOpen(false);
    }
    clearChipGroupCloseTimer();
    setClosingChipGroup(null);
    setLabelMenuPointer(null);
    onLabelVisibilityChange(nextVisibility);
  };

  const setEnabledLabelVisibility = (visible: boolean) => {
    const nextVisibility = { ...labelVisibility };
    for (const group of enabledGroups) nextVisibility[group] = visible;
    updateLabelVisibility(nextVisibility);
  };

  useLayoutEffect(() => {
    if (imageContextMenuOpen) {
      setLabelMenuPointer(null);
    }
  }, [imageContextMenuOpen]);

  const hideDirectoryLabel = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    updateLabelVisibility({ ...labelVisibility, directory: false });
  };

  const hideSortLabel = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    updateLabelVisibility({ ...labelVisibility, sort: false });
  };

  const hideRecognitionLabel = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    updateLabelVisibility({ ...labelVisibility, recognition: false });
  };

  const hideSkimDisplayLabel = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    updateLabelVisibility({ ...labelVisibility, skimDisplay: false });
  };

  const openLabelMenu = (event: React.MouseEvent<HTMLFormElement>) => {
    if (!labelMenuEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (target.closest(".cap7ce-label-menu")) {
      return;
    }
    const capsuleStyle = window.getComputedStyle(event.currentTarget);
    setLabelMenuThemeStyle({
      "--panel-bg": capsuleStyle.getPropertyValue("--panel-bg").trim(),
      "--border-soft": capsuleStyle.getPropertyValue("--border-soft").trim(),
      "--text-main": capsuleStyle.getPropertyValue("--text-main").trim(),
      "--theme-color": capsuleStyle.getPropertyValue("--theme-color").trim(),
      "--theme-on-color": capsuleStyle.getPropertyValue("--theme-on-color").trim()
    } as CSSProperties);
    onImageContextMenuClose?.();
    setLabelMenuPointer({ x: event.clientX, y: event.clientY });
  };

  const labelMenuStyle: CSSProperties = measuredLabelMenuPosition
    ? {
      ...labelMenuThemeStyle,
      left: measuredLabelMenuPosition.left,
      top: measuredLabelMenuPosition.top,
      visibility: "visible"
    }
    : { ...labelMenuThemeStyle, left: 0, top: 0, visibility: "hidden" };
  const temporaryInputFeedback = inputFeedbackIsGuide ? "" : inputFeedback;
  return (
  <form
    className={`cap7ce-top-capsule cap7ce-search-capsule${unified ? " cap7ce-search-capsule-unified" : ""}${directoryChipsOpen ? " cap7ce-search-capsule-directory-open" : ""}${!enabledGroups.has("skimDisplay") ? " cap7ce-search-capsule-directory-first" : ""}`}
    data-search-capsule="true"
    onPointerDown={(event) => event.stopPropagation()}
    onContextMenu={openLabelMenu}
    onBlur={(event) => {
      const relatedTarget = event.relatedTarget as Node | null;
      if (!event.currentTarget.contains(relatedTarget) && !labelMenuRef.current?.contains(relatedTarget)) {
        clearChipGroupCloseTimer();
        setClosingChipGroup(null);
        setDirectoryChipsOpen(false);
        setRecognitionChipsOpen(false);
        setSortChipsOpen(false);
        setSkimDisplayChipsOpen(false);
        setLabelMenuPointer(null);
      }
    }}
    onSubmit={(event) => {
      event.preventDefault();
      clearQueryClearSearchTimer();
      onSearch();
    }}
  >
    {leadingContent}
    {enabledGroups.has("skimDisplay") && labelVisibility.skimDisplay && (
      <button
        className={`cap7ce-pill cap7ce-skim-display-tag${skimDisplayChipsOpen || skimDisplayMode !== "skim" ? " cap7ce-pill-wide" : " cap7ce-pill-icon"}`}
        type="button"
        title={skimDisplayChipsOpen ? t("skim.display.skimHint") : t("search.hideLabelHint")}
        aria-label={skimDisplayChipsOpen ? t("skim.display.parent") : t(`skim.display.${skimDisplayMode}` as TranslationKey)}
        aria-expanded={skimDisplayChipsOpen}
        data-selected="true"
        onContextMenu={hideSkimDisplayLabel}
        onClick={toggleSkimDisplayChips}
      >
        {skimDisplayChipsOpen || skimDisplayMode === "skim"
          ? <SvgIcon svg={iconSkimSvg} className="cap-svg-icon cap-skim-display-svg-icon" />
          : t(`skim.display.${skimDisplayMode}` as TranslationKey)}
      </button>
    )}
    {expandedSkimDisplayModes.map((mode, index) => (
      <button
        key={mode}
        className={`cap7ce-pill cap7ce-pill-wide cap7ce-skim-display-chip cap7ce-filter-chip-motion${closingChipGroup === "skimDisplay" ? " cap7ce-filter-chip-closing" : ""}`}
        type="button"
        data-selected={skimDisplayMode === mode}
        title={t(`skim.display.${mode}Hint` as TranslationKey)}
        style={getChipMotionStyle(index, expandedSkimDisplayModes.length)}
        onClick={() => selectSkimDisplayMode(mode)}
      >
        {t(`skim.display.${mode}` as TranslationKey)}
      </button>
    ))}
    {enabledGroups.has("sort") && labelVisibility.sort && (
    <button
      className={`cap7ce-pill cap7ce-sort-tag${sortChipsOpen ? " cap7ce-pill-wide" : " cap7ce-pill-icon"}`}
      type="button"
      title={t("search.hideLabelHint")}
      aria-label={sortChipsOpen ? t("sort.parent") : getSortDirectionLabels()[search.sortDirection]}
      aria-expanded={sortChipsOpen}
      onContextMenu={hideSortLabel}
      onClick={toggleSortChips}
    >
      {sortChipsOpen
        ? t("sort.parent")
        : (
          <SvgIcon
            svg={search.sortDirection === "asc" ? iconSortAscSvg : iconSortDescSvg}
            className="cap-svg-icon cap-sort-svg-icon"
          />
        )}
    </button>
    )}
    {sortChipsOpen && (["desc", "asc"] as SortDirection[]).map((sortDirection, index) => (
      <button
        key={sortDirection}
        className={`cap7ce-pill cap7ce-pill-icon cap7ce-sort-chip cap7ce-sort-direction-chip cap7ce-filter-chip-motion${closingChipGroup === "sort" ? " cap7ce-filter-chip-closing" : ""}`}
        type="button"
        title={getSortDirectionLabels()[sortDirection]}
        aria-label={getSortDirectionLabels()[sortDirection]}
        data-selected={search.sortDirection === sortDirection}
        style={getChipMotionStyle(index, 4)}
        onClick={() => selectSortDirection(sortDirection)}
      >
        <SvgIcon
          svg={sortDirection === "asc" ? iconSortAscSvg : iconSortDescSvg}
          className="cap-svg-icon cap-sort-svg-icon"
        />
      </button>
    ))}
    {sortChipsOpen && (["file_name", "modified_at"] as SortField[]).map((sortField, index) => (
      <button
        key={sortField}
        className={`cap7ce-pill cap7ce-pill-wide cap7ce-sort-chip cap7ce-filter-chip-motion${closingChipGroup === "sort" ? " cap7ce-filter-chip-closing" : ""}`}
        type="button"
        data-selected={search.sortField === sortField}
        style={getChipMotionStyle(index + 2, 4)}
        onClick={() => selectSortField(sortField)}
      >
        {getSortLabels()[sortField]}
      </button>
    ))}
    {enabledGroups.has("directory") && labelVisibility.directory && (
    <button
      className="cap7ce-pill cap7ce-pill-wide cap7ce-directory-tag"
      type="button"
      title={t("search.hideLabelHint")}
      aria-expanded={unified ? directoryChipsOpen : undefined}
      data-selected={selectedDirectoryId !== null}
      onContextMenu={hideDirectoryLabel}
      onClick={() => {
        if (unified) {
          toggleDirectoryChips();
        }
      }}
    >
      {unified
        ? directoryChipsOpen
          ? directoryGroup?.parentLabel ?? t("filter.addedDirectories")
          : selectedDirectoryLabel
        : directoryName || t("filter.allDirectories")}
    </button>
    )}
    {expandedDirectories.map((directory, index) => (
      <button
        key={directory.id}
        className={`cap7ce-pill cap7ce-pill-wide cap7ce-directory-chip cap7ce-filter-chip-motion${closingChipGroup === "directory" ? " cap7ce-filter-chip-closing" : ""}`}
        type="button"
        title={directory.title}
        data-selected={selectedDirectoryId === directory.id}
        style={getChipMotionStyle(index, expandedDirectories.length)}
        onClick={() => selectDirectory(directory.id)}
      >
        {directory.label}
      </button>
    ))}
    {unified && enabledGroups.has("recognition") && labelVisibility.recognition && (
    <button
      className="cap7ce-pill cap7ce-pill-wide cap7ce-recognition-tag"
      type="button"
      title={t("search.hideLabelHint")}
      aria-expanded={recognitionChipsOpen}
      data-selected={search.recognitionStatus !== "all"}
      onContextMenu={hideRecognitionLabel}
      onClick={toggleRecognitionChips}
    >
      {recognitionChipsOpen
        ? getRecognitionStatusLabels().all
        : getRecognitionStatusLabels()[search.recognitionStatus]}
    </button>
    )}
    {expandedRecognitionStatuses.map((recognitionStatus, index) => (
      <button
        key={recognitionStatus}
        className={`cap7ce-pill cap7ce-pill-wide cap7ce-recognition-chip cap7ce-filter-chip-motion${closingChipGroup === "recognition" ? " cap7ce-filter-chip-closing" : ""}`}
        type="button"
        title={t("search.filterTitle", { status: getRecognitionStatusLabels()[recognitionStatus] })}
        data-selected={search.recognitionStatus === recognitionStatus}
        style={getChipMotionStyle(index, expandedRecognitionStatuses.length)}
        onClick={() => selectRecognitionStatus(recognitionStatus)}
      >
        {getRecognitionStatusLabels()[recognitionStatus]}
      </button>
    ))}
    <button className="cap7ce-pill cap7ce-pill-icon" type="button" title={t("common.view")}>
      □
    </button>
    <div className="cap7ce-capsule-input-shell">
      <input
        className={`cap7ce-capsule-input${inputFeedbackIsGuide ? " cap-operation-hint" : ""}${temporaryInputFeedback ? " cap-temporary-feedback-active" : ""}`}
        ref={inputRef}
        value={search.query}
        placeholder={inputFeedbackIsGuide ? inputFeedback : ""}
        title={inputFeedback || undefined}
        onChange={(event) => {
          clearQueryClearSearchTimer();
          const nextSearch = { ...search, query: event.target.value };
          const userClearedQuery = autoSearchOnQueryClear
            && search.query.trim().length > 0
            && nextSearch.query.trim().length === 0;
          onSearchChange(nextSearch);
          if (userClearedQuery && onSearchOptionsChange) {
            queryClearSearchTimerRef.current = window.setTimeout(() => {
              queryClearSearchTimerRef.current = null;
              onSearchOptionsChange({ ...nextSearch, query: "" });
            }, 500);
          }
        }}
        aria-label={t("search.inputLabel")}
        autoComplete="off"
      />
      {temporaryInputFeedback && (
        <span className="cap7ce-capsule-input-feedback" title={temporaryInputFeedback}>
          {temporaryInputFeedback}
        </span>
      )}
    </div>
    <div className="cap7ce-capsule-status">{status}</div>
    {labelMenuEnabled && labelMenuPointer && createPortal(
      <div
        ref={labelMenuRef}
        className="cap7ce-label-menu"
        style={labelMenuStyle}
        role="menu"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="cap7ce-menu-motion-surface">
          <button type="button" role="menuitem" onClick={() => setEnabledLabelVisibility(true)}>{t("search.showAllLabels")}</button>
          <button type="button" role="menuitem" onClick={() => setEnabledLabelVisibility(false)}>{t("search.hideAllLabels")}</button>
        </div>
      </div>
    , document.body)}
  </form>
  );
};
