import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SkimLocationShortcut } from "../../shared/types";
import type { CatalogGridMode } from "../../shared/catalogPresentationTypes";
import { t } from "../../../electron/localization";
import { locationIcons, resolveLocationLabel } from "../skim/SkimRootSections";
import diskSvg from "../assets/icons/skim-disk.svg?raw";
import CatalogHomeGroup from "./CatalogHomeGroup";
import type { CatalogHomeEntry } from "../../shared/catalogHomeTypes";
import { useCatalogHomeActions } from "./useCatalogHomeActions";
import CatalogHomeDetails from "./CatalogHomeDetails";
import { useGridSelectionDismissal } from "../results/useGridSelectionDismissal";
import { useCatalogDrives } from "./useCatalogDrives";
import "./CatalogHome.css";
import type { CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import CatalogHomeContextMenu from "./CatalogHomeContextMenu";
import { useDirectoryMetadataMenu } from "../metadata-build/useDirectoryMetadataMenu";
import CatalogTransientFeedback from "./CatalogTransientFeedback";
import CatalogGridScrollbars from "./CatalogGridScrollbars";
import type { FavoriteDirectoryControls } from "../../shared/favoriteDirectoryTypes";

export default function CatalogHome({ onOpen, gridMode, gridSize = 100, foreground = true, active = true, detailsHost, refreshVersion = 0, favorites, ...appearance }: {
  onOpen: (path: string) => void; gridMode: CatalogGridMode; gridSize?: number; foreground?: boolean; refreshVersion?: number;
  favorites?: FavoriteDirectoryControls; active?: boolean; detailsHost?: HTMLElement | null;
} & Partial<CatalogWorkspaceAppearance>) {
  const metadata = useDirectoryMetadataMenu(foreground);
  const [locations, setLocations] = useState<SkimLocationShortcut[]>([]);
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const systemDrives = useCatalogDrives(refreshVersion, retry);
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let live = true;
    setFailed(false);
    const api = window.cap7ce?.skim;
    if (!api) { setFailed(true); return; }
    void api.listLocations().then(value => {
      if (live) setLocations(value.filter(location => location.kind !== "starred"));
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [retry, refreshVersion]);
  const drives = useMemo<CatalogHomeEntry[]>(() => systemDrives.entries.map(entry => ({
    id: entry.path.toUpperCase(), name: `${entry.label?.trim() || t("catalogWorkspace.localDisk")} (${entry.path.slice(0, 2).toUpperCase()})`,
    path: entry.path, icon: diskSvg, kind: "drive"
  })), [systemDrives.entries]);
  const system = useMemo<CatalogHomeEntry[]>(() => locations.filter(location => location.kind !== "computer" && location.path)
    .map(location => ({ id: location.id, path: location.path!, name: resolveLocationLabel(location), icon: locationIcons[location.kind], kind: "folder" })), [locations]);
  const entries = useMemo(() => [...system, ...drives], [system, drives]);
  const actions = useCatalogHomeActions({ entries, active, foreground, appearance, onOpen, menuOpen: !!metadata.target, closeMenu: metadata.close });
  const dismissSelection = useGridSelectionDismissal({ rootRef, foreground, hasSelection: actions.selectedIds.size > 0, menuOpen: !!metadata.target, onClear: actions.clear });
  const group = { rootRef, mode: gridMode, size: gridSize, selectedIds: actions.selectedIds, activeId: actions.activeId,
    onSelect: actions.select, onOpen, onPreview: actions.preview, foreground, onDrag: actions.drag, onDragEnd: () => appearance.onNativeDragStateChange?.(false) };
  const menuEntry = [...system, ...drives].find(entry => entry.path === metadata.target?.path);
  return <><section ref={rootRef} className="cap-catalog-home" onClick={dismissSelection}>
    {(failed || systemDrives.failed) && <button type="button" onClick={() => setRetry(value => value + 1)}>{t("common.retry")}</button>}
    <div className="cap-skim-root-sections">
      <CatalogHomeGroup {...group} title={t("skim.root.systemLocations")} items={system}
        onContextMenu={(event, item) => { actions.selectContext(item); metadata.open(event, item.path); }} />
      <CatalogHomeGroup {...group} title={t("skim.root.thisPc")} items={drives}
        onContextMenu={(event, item) => { actions.selectContext(item); metadata.open(event, item.path); }} />
    </div>
    {metadata.target && menuEntry && <CatalogHomeContextMenu target={metadata.target} entry={menuEntry} entries={actions.selected} onPreview={() => void actions.preview(menuEntry)} onReveal={() => void actions.reveal(menuEntry)} onCopy={() => void actions.copy(actions.selected)} favorites={favorites}
      appearance={{ theme: "dark", appearanceColors: { themeColor: "#7894f8", accentColor: "#67bec1" }, windowMaterial: "mica", ...appearance }} onClose={metadata.close} onOpen={onOpen} onMetadata={path => { void metadata.start(path); }} metadataBusy={metadata.busy} />}
    <CatalogTransientFeedback message={metadata.message || actions.feedback} />
  </section><CatalogGridScrollbars scrollContainerRef={rootRef} />{detailsHost && createPortal(<CatalogHomeDetails entries={actions.selected} foreground={foreground} />, detailsHost)}</>;
}
