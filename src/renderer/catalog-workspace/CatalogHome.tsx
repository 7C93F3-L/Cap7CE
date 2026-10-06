import { useEffect, useMemo, useState } from "react";
import type { ComputerSearchVolumeStatus } from "../../../electron/computerSearchTypes";
import type { SkimBrowseEntry, SkimLocationShortcut } from "../../shared/types";
import { t } from "../../../electron/localization";
import SkimRootSections from "../skim/SkimRootSections";

export default function CatalogHome({ volumes, onOpen }: {
  volumes: readonly ComputerSearchVolumeStatus[]; onOpen: (path: string) => void;
}) {
  const [locations, setLocations] = useState<SkimLocationShortcut[]>([]);
  const [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [systemCollapsed, setSystemCollapsed] = useState(false), [drivesCollapsed, setDrivesCollapsed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    const api = window.cap7ce?.skim;
    if (!api) { setFailed(true); return; }
    void api.listLocations().then(value => {
      if (live) setLocations(value.filter(location => location.kind !== "starred"));
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [retry]);
  const drives = useMemo<SkimBrowseEntry[]>(() => volumes.filter(volume => /^[A-Za-z]:$/.test(volume.displayName)).map(volume => ({
    kind: "drive", name: volume.displayName, path: `${volume.displayName}\\`, extension: "", size: null,
    modifiedAt: null, withinAddedDirectory: false, hidden: false, status: volume.queryable ? "ready" : "error"
  })), [volumes]);
  return <section className="cap-catalog-home cap-skim-grid-virtualized">
    {failed && <button type="button" onClick={() => setRetry(value => value + 1)}>{t("common.retry")}</button>}
    <SkimRootSections catalogTiles drives={drives} locations={locations} selectedPath={selectedPath}
      systemLocationsCollapsed={systemCollapsed} starredLocationsCollapsed={true} drivesCollapsed={drivesCollapsed}
      onSelectPath={setSelectedPath} onOpenPath={onOpen} onToggleSystemLocations={() => setSystemCollapsed(value => !value)}
      onToggleDrives={() => setDrivesCollapsed(value => !value)} onToggleStarredLocations={() => {}} onStarredContextMenu={() => {}} />
  </section>;
}
