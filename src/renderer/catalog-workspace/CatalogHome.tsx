import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SkimLocationShortcut } from "../../shared/types";
import type { CatalogGridMode } from "../../shared/catalogPresentationTypes";
import { t } from "../../../electron/localization";
import { locationIcons, resolveLocationLabel } from "../skim/SkimRootSections";
import diskSvg from "../assets/icons/skim-disk.svg?raw";
import CatalogHomeGroup, { type CatalogHomeEntry } from "./CatalogHomeGroup";
import { useGridSelectionDismissal } from "../results/useGridSelectionDismissal";
import { useCatalogDrives } from "./useCatalogDrives";
import "./CatalogHome.css";

export default function CatalogHome({ onOpen, gridMode, foreground = true, refreshVersion = 0 }: {
  onOpen: (path: string) => void; gridMode: CatalogGridMode; foreground?: boolean; refreshVersion?: number;
}) {
  const [locations, setLocations] = useState<SkimLocationShortcut[]>([]);
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const systemDrives = useCatalogDrives(refreshVersion, retry);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [systemCollapsed, setSystemCollapsed] = useState(false), [drivesCollapsed, setDrivesCollapsed] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const clearSelection = useCallback(() => setSelectedPath(null), []);
  const dismissSelection = useGridSelectionDismissal({ rootRef, foreground, hasSelection: selectedPath !== null, onClear: clearSelection });
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
    path: entry.path, icon: diskSvg
  })), [systemDrives.entries]);
  const system = useMemo<CatalogHomeEntry[]>(() => locations.filter(location => location.kind !== "computer" && location.path)
    .map(location => ({ id: location.id, path: location.path!, name: resolveLocationLabel(location), icon: locationIcons[location.kind] })), [locations]);
  const group = { rootRef, mode: gridMode, selectedPath, onSelect: setSelectedPath, onOpen };
  return <section ref={rootRef} className="cap-catalog-home" onClick={dismissSelection}>
    {(failed || systemDrives.failed) && <button type="button" onClick={() => setRetry(value => value + 1)}>{t("common.retry")}</button>}
    <div className="cap-skim-root-sections">
      <CatalogHomeGroup {...group} title={t("skim.root.systemLocations")} items={system}
        collapsed={systemCollapsed} onToggle={() => setSystemCollapsed(value => !value)} />
      <CatalogHomeGroup {...group} title={t("skim.root.thisPc")} items={drives}
        collapsed={drivesCollapsed} onToggle={() => setDrivesCollapsed(value => !value)} />
    </div>
  </section>;
}
