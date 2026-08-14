import { useEffect, useRef } from "react";
import type { AppView, SkimLocationShortcut, SkimLocationShortcutKind } from "../shared/types";
import { t } from "../../electron/localization";
import CustomScrollbar from "./CustomScrollbar";
import computerSvg from "./assets/icons/skim-location-computer.svg?raw";
import documentsSvg from "./assets/icons/skim-location-documents.svg?raw";
import downloadsSvg from "./assets/icons/skim-location-downloads.svg?raw";
import exitSvg from "./assets/icons/skim-location-exit.svg?raw";
import musicSvg from "./assets/icons/skim-location-music.svg?raw";
import picturesSvg from "./assets/icons/skim-location-pictures.svg?raw";
import starredFolderSvg from "./assets/icons/skim-location-starred-folder.svg?raw";
import videosSvg from "./assets/icons/skim-location-videos.svg?raw";

const locationIcons: Record<SkimLocationShortcutKind, string> = {
  computer: computerSvg,
  downloads: downloadsSvg,
  documents: documentsSvg,
  pictures: picturesSvg,
  music: musicSvg,
  videos: videosSvg,
  starred: starredFolderSvg
};

const locationLabels: Partial<Record<SkimLocationShortcutKind, Parameters<typeof t>[0]>> = {
  computer: "skim.computer",
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
  onSelect: (path: string | null) => void;
  onDismiss: () => void;
  onExit: () => void;
}

const SkimLocationPicker = ({ activeView, locations, inSkim, closing, onSelect, onDismiss, onExit }: SkimLocationPickerProps) => {
  const pickerRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || pickerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-skim-location-toggle='true']")) return;
      onDismiss();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
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
  }, [onDismiss]);

  return (
    <aside
      ref={pickerRef}
      className={`cap-skim-location-picker cap-skim-location-picker-${activeView}${closing ? " cap-skim-location-picker-closing" : ""}`}
      aria-label={t("skim.locationPicker.open")}
    >
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
              >
                <PickerSvgIcon svg={locationIcons[location.kind]} className="cap-svg-icon cap-skim-location-entry-icon" />
                <span className="cap-skim-location-entry-name">{label}</span>
              </button>
            );
          })}
        </div>
        <CustomScrollbar scrollContainerRef={scrollRef} orientation="vertical" />
      </div>
      <button
        className="cap-skim-location-exit"
        type="button"
        title={inSkim ? t("skim.exit") : t("skim.locationPicker.close")}
        aria-label={inSkim ? t("skim.exit") : t("skim.locationPicker.close")}
        onClick={onExit}
      >
        <PickerSvgIcon svg={exitSvg} className="cap-svg-icon cap-skim-location-exit-icon" />
      </button>
    </aside>
  );
};

export default SkimLocationPicker;
