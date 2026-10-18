import { useState } from "react";
import { t } from "../../../../electron/localization";
import type { MetadataSettingsDraft, MetadataScope, MetadataScopeKind } from "./settingsMetadataPolicy";
import { scopeKey } from "./settingsMetadataPolicy";
import Glyph from "./SettingsMetadataGlyph";

export default function SettingsMetadataFolders({ draft, labels, disabled, onAdd, onRemove }: {
  draft: MetadataSettingsDraft; labels: Record<string, string>; disabled: boolean;
  onAdd: (path: string, kind: MetadataScopeKind) => Promise<boolean>; onRemove: (scope: MetadataScope, kind: MetadataScopeKind) => void;
}) {
  const [expanded, setExpanded] = useState(false), [adding, setAdding] = useState<MetadataScopeKind | null>(null), [path, setPath] = useState("");
  const included = draft.includes.filter(s => s.rootFileReference !== null);
  return <section className="build-card folder-card">
    <button type="button" className="folder-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><Glyph name="folder" /><span><strong>{t("metadataBuild.folders")}</strong>
      <small className="muted">{included.length || draft.excludes.length ? t("metadataBuild.folderSummary", { includes: included.length, excludes: draft.excludes.length }) : t("metadataBuild.foldersHint")}</small></span>
      <span className={expanded ? "is-open chevron" : "chevron"}><Glyph name="down" /></span></button>
    {expanded && <fieldset disabled={disabled} className="folder-details">
      {(["includes", "excludes"] as const).map(kind => {
        const scopes = kind === "includes" ? included : draft.excludes;
        return <div className="folder-group" key={kind}>
          <div className="card-heading"><h3>{t(kind === "includes" ? "metadataBuild.onlyFolders" : "metadataBuild.excludeFolders")}</h3>
            <button type="button" className="cap-stable-settings-button" onClick={() => { setAdding(kind); setPath(""); }}>{t("metadataBuild.addFolder")}</button></div>
          <p className="muted">{t(kind === "includes" ? "metadataBuild.onlyHint" : "metadataBuild.excludeHint")}</p>
          {scopes.length ? <ul className="scope-paths">{scopes.map((scope, index) => {
            const label = labels[scopeKey(scope)] ?? t("metadataBuild.savedScope", { count: index + 1 });
            return <li key={scopeKey(scope)}><Glyph name="folder" /><span>{label}</span><button type="button" className="icon-button" aria-label={t("metadataBuild.removeScope", { label })} onClick={() => onRemove(scope, kind)}><Glyph name="close" /></button></li>;
          })}</ul> : <p className="empty-rule muted">{t(kind === "includes" ? "metadataBuild.noOnlyFolders" : "metadataBuild.noExcludedFolders")}</p>}
          {adding === kind && <form className="folder-composer" onSubmit={event => { event.preventDefault(); void onAdd(path, kind).then(added => { if (added) { setAdding(null); setPath(""); } }); }}>
            <label htmlFor="metadata-folder-path">{t("metadataBuild.folderPath")}</label><input id="metadata-folder-path" autoFocus value={path} onChange={event => setPath(event.target.value)} maxLength={32768} placeholder={t("metadataBuild.pathPlaceholder")} />
            <div className="composer-actions"><button type="button" className="cap-stable-settings-button" onClick={() => setAdding(null)}>{t("common.cancel")}</button><button className="cap-stable-settings-button" disabled={!path.trim()}>{t("metadataBuild.add")}</button></div>
          </form>}
        </div>;
      })}
    </fieldset>}
  </section>;
}
