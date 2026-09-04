import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { t, type TranslationKey } from "../../../electron/localization";
import type { SkimBrowseEntry, SkimLocationShortcut, SkimLocationShortcutKind } from "../../shared/types";
import { MiddleEllipsisFileName, TwoLineMiddleEllipsisFileName } from "../components/MiddleEllipsisFileName";
import SvgIcon from "../components/SvgIcon";
import computerSvg from "../assets/icons/skim-location-computer.svg?raw";
import diskSvg from "../assets/icons/skim-disk.svg?raw";
import desktopSvg from "../assets/icons/skim-location-desktop.svg?raw";
import documentsSvg from "../assets/icons/skim-location-documents.svg?raw";
import downloadsSvg from "../assets/icons/skim-location-downloads.svg?raw";
import musicSvg from "../assets/icons/skim-location-music.svg?raw";
import picturesSvg from "../assets/icons/skim-location-pictures.svg?raw";
import starredFolderSvg from "../assets/icons/skim-location-starred-folder.svg?raw";
import videosSvg from "../assets/icons/skim-location-videos.svg?raw";
import "./SkimRootSections.css";

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

const locationLabels: Partial<Record<SkimLocationShortcutKind, TranslationKey>> = {
  desktop: "skim.locationPicker.desktop",
  downloads: "skim.locationPicker.downloads",
  documents: "skim.locationPicker.documents",
  pictures: "skim.locationPicker.pictures",
  music: "skim.locationPicker.music",
  videos: "skim.locationPicker.videos",
  starred: "skim.locationPicker.starred"
};

const resolveLocationLabel = (location: SkimLocationShortcut) => (
  location.name?.trim() || t(locationLabels[location.kind] ?? "skim.locationPicker.starred")
);

interface SkimRootSectionsProps {
  drives: SkimBrowseEntry[];
  locations: SkimLocationShortcut[];
  systemLocationsCollapsed: boolean;
  starredLocationsCollapsed: boolean;
  drivesCollapsed: boolean;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  onOpenPath: (path: string) => void;
  onToggleSystemLocations: () => void;
  onToggleStarredLocations: () => void;
  onToggleDrives: () => void;
  onStarredContextMenu: (event: MouseEvent<HTMLButtonElement>, location: SkimLocationShortcut) => void;
}

export const countSkimRootLocations = (locations: SkimLocationShortcut[]) => (
  locations.filter((location) => location.kind !== "computer").length
);

interface RootTileProps {
  path: string;
  label: string;
  secondaryLabel?: string;
  icon: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void;
}

const RootTile = ({ path, label, secondaryLabel, icon, selected, onSelect, onOpen, onContextMenu }: RootTileProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onOpen();
  };

  return (
    <button
      className={`cap-skim-entry cap-skim-root-entry${selected ? " selected active" : ""}`}
      type="button"
      title={path}
      aria-label={secondaryLabel ? `${label} ${secondaryLabel}` : label}
      aria-pressed={selected}
      onClick={(event) => { event.stopPropagation(); onSelect(); }}
      onDoubleClick={onOpen}
      onKeyDown={handleKeyDown}
      onContextMenu={onContextMenu}
    >
      <span className="cap-skim-entry-visual"><SvgIcon svg={icon} className="cap-svg-icon cap-skim-entry-icon" /></span>
      <TwoLineMiddleEllipsisFileName fileName={label} className="cap-skim-entry-name" />
      {secondaryLabel && <MiddleEllipsisFileName fileName={secondaryLabel} className="cap-skim-entry-path" />}
    </button>
  );
};

const RootGroup = ({ title, collapsed, onToggle, children }: { title: string; collapsed: boolean; onToggle: () => void; children: ReactNode }) => (
  <section className={`cap-skim-root-group${collapsed ? " is-collapsed" : ""}`}>
    <button className="cap-skim-root-group-header" type="button" title={`${collapsed ? t("common.expand") : t("common.collapse")} ${title}`}
      aria-expanded={!collapsed} onClick={(event) => { event.stopPropagation(); onToggle(); }}>
      <span>{title}</span><span className="cap-skim-root-group-chevron" aria-hidden="true">{collapsed ? "›" : "⌄"}</span>
    </button>
    {!collapsed && <div className="cap-skim-root-group-grid">{children}</div>}
  </section>
);

const SkimRootSections = ({ drives, locations, systemLocationsCollapsed, starredLocationsCollapsed, drivesCollapsed, selectedPath, onSelectPath, onOpenPath, onToggleSystemLocations, onToggleStarredLocations, onToggleDrives, onStarredContextMenu }: SkimRootSectionsProps) => {
  const systemLocations = locations.filter((location) => location.kind !== "computer" && location.kind !== "starred");
  const starredLocations = locations.filter((location) => location.kind === "starred" && location.path);
  const locationTile = (location: SkimLocationShortcut, starred = false) => {
    if (!location.path) return null;
    const label = resolveLocationLabel(location);
    return <RootTile key={location.id} path={location.path} label={label} icon={locationIcons[location.kind]}
      selected={selectedPath === location.path} onSelect={() => onSelectPath(location.path!)} onOpen={() => onOpenPath(location.path!)}
      onContextMenu={starred ? (event) => onStarredContextMenu(event, location) : undefined} />;
  };

  return (
    <div className="cap-skim-root-sections">
      <RootGroup title={t("skim.root.systemLocations")} collapsed={systemLocationsCollapsed} onToggle={onToggleSystemLocations}>
        {systemLocations.map((location) => locationTile(location))}
      </RootGroup>
      {starredLocations.length > 0 && <RootGroup title={t("skim.root.starredFolders")} collapsed={starredLocationsCollapsed} onToggle={onToggleStarredLocations}>
        {starredLocations.map((location) => locationTile(location, true))}
      </RootGroup>}
      <RootGroup title={t("skim.root.thisPc")} collapsed={drivesCollapsed} onToggle={onToggleDrives}>
        {drives.map((drive) => <RootTile key={drive.path} path={drive.path} label={drive.label || drive.name}
          secondaryLabel={drive.label ? drive.name : undefined} icon={diskSvg} selected={selectedPath === drive.path}
          onSelect={() => onSelectPath(drive.path)} onOpen={() => onOpenPath(drive.path)} />)}
      </RootGroup>
    </div>
  );
};

export default SkimRootSections;
