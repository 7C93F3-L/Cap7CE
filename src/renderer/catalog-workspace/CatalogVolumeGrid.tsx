import type { ComputerSearchVolumeStatus } from "../../../electron/computerSearchTypes";
import { t } from "../../../electron/localization";
import StableUiIcon from "../stable-ui/StableUiIcon";

export default function CatalogVolumeGrid({ volumes, onOpen }: { volumes: readonly ComputerSearchVolumeStatus[]; onOpen: (path: string) => void }) {
  return <section className="cap-catalog-volume-grid" aria-label={t("skim.computer")}>
    {volumes.filter(volume => /^[A-Za-z]:$/.test(volume.displayName)).map(volume => <button key={volume.volumeId}
      type="button" disabled={!volume.queryable} onClick={() => onOpen(`${volume.displayName}\\`)}>
      <StableUiIcon name="folder" /><strong>{volume.displayName}</strong>
      {!volume.queryable && <span>{t("catalogWorkspace.volumeUnavailable")}</span>}
    </button>)}
  </section>;
}
