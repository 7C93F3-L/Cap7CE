import { t } from "../../../../electron/localization";
import type { MetadataBuildStatus } from "../../../shared/metadataBuildTypes";
import type { MetadataSettingsDraft } from "./settingsMetadataPolicy";
import Glyph from "./SettingsMetadataGlyph";

export default function SettingsMetadataDrives({ status, draft, disabled, onToggle, onMove, onRefresh }: {
  status: MetadataBuildStatus; draft: MetadataSettingsDraft; disabled: boolean;
  onToggle: (id: string) => void; onMove: (id: string, direction: number) => void; onRefresh: () => void;
}) {
  return <section className="build-card" aria-label={t("metadataBuild.drives")}>
    <div className="card-heading"><h2>{t("metadataBuild.drives")}</h2><span className="muted">{t("metadataBuild.selected", { count: draft.selected.length })}</span></div>
    <p className="muted section-description">{t("metadataBuild.drivesHint")}</p>
    <fieldset disabled={disabled} className="drive-list" aria-label={t("metadataBuild.drives")}>
      {draft.order.map((id, index) => {
        const label = status.volumes.find(v => v.volumeId === id)?.label ?? t("metadataBuild.unavailableDrive");
        const includes = draft.includes.filter(s => s.volumeId === id && s.rootFileReference !== null).length;
        const selected = draft.selected.includes(id);
        return <div className={`drive-row${selected ? "" : " is-unselected"}`} key={id} data-drive={id}>
          <label><input type="checkbox" aria-label={t("metadataBuild.selectDrive", { label })} checked={selected} onChange={() => onToggle(id)} /><Glyph name="drive" /><span className="drive-name">{label}</span></label>
          <span className="drive-scope muted">{t(!selected ? "metadataBuild.excludedDrive" : includes ? "metadataBuild.limitedFolders" : "metadataBuild.wholeDrive", { count: includes })}</span>
          <div className="order-buttons"><button type="button" className="icon-button" aria-label={t("metadataBuild.moveUp", { label })} disabled={index === 0} onClick={() => onMove(id, -1)}><Glyph name="up" /></button>
            <button type="button" className="icon-button" aria-label={t("metadataBuild.moveDown", { label })} disabled={index === draft.order.length - 1} onClick={() => onMove(id, 1)}><Glyph name="down" /></button></div>
        </div>;
      })}
    </fieldset>
    {disabled && <p className="muted scope-lock">{t(status.directoryTask?.pending ? "metadataBuild.directoryLock" : "metadataBuild.locked")}</p>}
    {!draft.selected.length && <p className="task-error" role="status">{t(status.volumes.length ? "metadataBuild.noSelection" : "metadataBuild.noDrives")}</p>}
    {!status.volumes.length && <button type="button" className="cap-stable-settings-button" onClick={onRefresh}>{t("common.refresh")}</button>}
  </section>;
}
