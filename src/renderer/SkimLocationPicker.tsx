import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { AppView, SkimLocationShortcut, SkimLocationShortcutKind } from "../shared/types";
import { t } from "../../electron/localization";
import CustomScrollbar from "./CustomScrollbar";
import computerSvg from "./assets/icons/skim-location-computer.svg?raw";
import desktopSvg from "./assets/icons/skim-location-desktop.svg?raw";
import documentsSvg from "./assets/icons/skim-location-documents.svg?raw";
import downloadsSvg from "./assets/icons/skim-location-downloads.svg?raw";
import exitSvg from "./assets/icons/skim-location-exit.svg?raw";
import musicSvg from "./assets/icons/skim-location-music.svg?raw";
import picturesSvg from "./assets/icons/skim-location-pictures.svg?raw";
import starredFolderSvg from "./assets/icons/skim-location-starred-folder.svg?raw";
import systemFoldersSvg from "./assets/icons/skim-location-system-folders.svg?raw";
import videosSvg from "./assets/icons/skim-location-videos.svg?raw";

const locationIcons: Record<SkimLocationShortcutKind, string> = {
  computer: computerSvg,
  desktop: desktopSvg,
  downloads: downloadsSvg,
  documents: documentsSvg,
  pictures: picturesSvg,
  music: musicSvg,
  videos: videosSvg,
  starred: starredFolderSvg
};

const locationLabels: Partial<Record<SkimLocationShortcutKind, Parameters<typeof t>[0]>> = {
  computer: "skim.computer",
  desktop: "skim.locationPicker.desktop",
  downloads: "skim.locationPicker.downloads",
  documents: "skim.locationPicker.documents",
  pictures: "skim.locationPicker.pictures",
  music: "skim.locationPicker.music",
  videos: "skim.locationPicker.videos",
  starred: "skim.locationPicker.starred"
};

const PickerSvgIcon = ({ svg, className }: { svg: string; className: string }) => (
  <span
    className={className}
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: svg }}
  />
);

const resolveLocationLabel = (location: SkimLocationShortcut) => (
  location.name?.trim() || t(locationLabels[location.kind] ?? "skim.locationPicker.starred")
);

interface SkimLocationPickerProps {
  activeView: AppView;
  locations: SkimLocationShortcut[];
  inSkim: boolean;
  closing: boolean;
  systemLocationsCollapsed: boolean;
  onSelect: (path: string | null) => void;
  onDismiss: () => void;
  onExit: () => void;
  onToggleSystemLocations: () => void;
  menuStyle?: CSSProperties;
  onRemoveSidebarFolder: (path: string) => void;
}

type LocationContextMenu = { x: number; y: number; path: string };

const SkimLocationPicker = ({ activeView, locations, inSkim, closing, systemLocationsCollapsed, onSelect, onDismiss, onExit, onToggleSystemLocations, menuStyle, onRemoveSidebarFolder }: SkimLocationPickerProps) => {
  const pickerRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<LocationContextMenu | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setContextMenuPosition(null);
      return;
    }
    const bounds = contextMenuRef.current.getBoundingClientRect();
    setContextMenuPosition({
      left: Math.max(5, Math.min(contextMenu.x, window.innerWidth - bounds.width - 5)),
      top: Math.max(5, Math.min(contextMenu.y, window.innerHeight - bounds.height - 5))
    });
  }, [contextMenu]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || pickerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-skim-location-toggle='true']")) return;
      if (target instanceof Element && target.closest("[data-skim-location-context-menu='true']")) return;
      onDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (contextMenu) {
        setContextMenu(null);
        return;
      }
      onDismiss();
    };
    const handleViewportChange = () => onDismiss();

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("blur", handleViewportChange);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("blur", handleViewportChange);
    };
  }, [contextMenu, onDismiss]);

  return (
    <aside
      ref={pickerRef}
      className={`cap-skim-location-picker cap-skim-location-picker-${activeView}${closing ? " cap-skim-location-picker-closing" : ""}`}
      aria-label={t("skim.locationPicker.open")}
    >
      <div className="cap-skim-location-picker-surface">
        <div className="cap-skim-location-scroll-frame cap-scroll-viewport-frame cap-scroll-viewport-frame-vertical">
          <div className="cap-skim-location-list cap-main-scroll-viewport" ref={scrollRef}>
            {locations.map((location) => {
              const label = resolveLocationLabel(location);
              return (
                <button
                  className="cap-skim-location-entry"
                  type="button"
                  key={location.id}
                  title={location.path ?? label}
                  aria-label={label}
                  onClick={() => onSelect(location.path)}
                  onContextMenu={location.kind === "starred" && location.path ? (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setContextMenu({ x: event.clientX, y: event.clientY, path: location.path! });
                  } : undefined}
                >
                  <PickerSvgIcon svg={locationIcons[location.kind]} className="cap-svg-icon cap-skim-location-entry-icon" />
                  <span className="cap-skim-location-entry-name">{label}</span>
                </button>
              );
            })}
          </div>
          <CustomScrollbar scrollContainerRef={scrollRef} orientation="vertical" />
        </div>
        <div className="cap-skim-location-footer">
          <button
            className="cap-window-button cap-skim-location-footer-button"
            type="button"
            title={inSkim ? t("skim.exit") : t("skim.locationPicker.close")}
            aria-label={inSkim ? t("skim.exit") : t("skim.locationPicker.close")}
            onClick={onExit}
          >
            <PickerSvgIcon svg={exitSvg} className="cap-svg-icon cap-window-svg-icon" />
          </button>
          <button
            className="cap-window-button cap-skim-location-footer-button"
            type="button"
            title={systemLocationsCollapsed ? t("skim.locationPicker.showSystemFolders") : t("skim.locationPicker.hideSystemFolders")}
            aria-label={systemLocationsCollapsed ? t("skim.locationPicker.showSystemFolders") : t("skim.locationPicker.hideSystemFolders")}
            aria-pressed={systemLocationsCollapsed}
            onClick={onToggleSystemLocations}
          >
            <PickerSvgIcon svg={systemFoldersSvg} className="cap-svg-icon cap-window-svg-icon" />
          </button>
        </div>
      </div>
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="context-menu cap7ce-menu-motion-surface cap-skim-location-context-menu"
          data-skim-location-context-menu="true"
          style={{
            ...menuStyle,
            left: contextMenuPosition?.left ?? contextMenu.x,
            top: contextMenuPosition?.top ?? contextMenu.y,
            visibility: contextMenuPosition ? "visible" : "hidden"
          }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const targetPath = contextMenu.path;
              setContextMenu(null);
              onRemoveSidebarFolder(targetPath);
            }}
          >
            {t("skim.sidebar.remove")}
          </button>
        </div>,
        document.body
      )}
    </aside>
  );
};

export default SkimLocationPicker;
