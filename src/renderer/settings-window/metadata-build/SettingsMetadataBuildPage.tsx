import { useEffect, useRef, useState } from "react";
import { t } from "../../../../electron/localization";
import CustomScrollbar from "../../CustomScrollbar";
import { useInertElement } from "../../stable-ui/useInertElement";
import type { SettingsIndexNavigation } from "../useSettingsIndexNavigation";
import { useSettingsMetadataBuild } from "./useSettingsMetadataBuild";
import Glyph from "./SettingsMetadataGlyph";
import SettingsMetadataTask from "./SettingsMetadataTask";
import SettingsMetadataDrives from "./SettingsMetadataDrives";
import SettingsMetadataFolders from "./SettingsMetadataFolders";
import "./SettingsMetadataBuild.css";

export default function SettingsMetadataBuildPage({ navigation }: { navigation: SettingsIndexNavigation }) {
  const build = useSettingsMetadataBuild();
  const scrollRef = useRef<HTMLDivElement>(null), dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const contentRef = useInertElement<HTMLDivElement>(pending !== null);
  useEffect(() => navigation.protect(proceed => { if (build.busy) return; if (build.dirty) setPending(() => proceed); else proceed(); }), [navigation.protect, build.dirty, build.busy]);
  useEffect(() => { if (pending) dialogRef.current?.showModal(); return () => dialogRef.current?.close(); }, [pending]);
  const canSave = Boolean(build.policy?.volumeOrder.length) && !build.locked && !build.conflict;
  return <div className="cap-settings-build">
    <div className="build-body" ref={contentRef}><div className="build-scroll-frame"><main className="cap-stable-settings-content" ref={scrollRef}><div className="cap-stable-settings-content-track build-page">
      <header className="build-heading"><button type="button" className="icon-button" aria-label={t("metadataBuild.back")} onClick={() => navigation.navigate()}><Glyph name="back" /></button><h1>{t("stableSettings.metadataBuild")}</h1></header>
      {!build.status || !build.draft ? <div className="build-card"><p role="status">{t(build.error ? "metadataBuild.loadFailed" : "common.loading")}</p>{build.error && <button type="button" className="cap-stable-settings-button" onClick={() => void build.refresh()}>{t("common.retry")}</button>}</div> : <>
        <SettingsMetadataTask status={build.status} busy={build.busy} dirty={build.dirty} canStart={canSave} onAction={kind => void build.perform(kind)} />
        <SettingsMetadataDrives status={build.status} draft={build.draft} disabled={build.locked} onToggle={build.toggle} onMove={build.move} onRefresh={() => void build.refresh()} />
        <SettingsMetadataFolders draft={build.draft} labels={build.labels} disabled={build.locked} onAdd={build.add} onRemove={build.remove} />
      </>}
    </div></main><CustomScrollbar scrollContainerRef={scrollRef} orientation="vertical" /></div>
      <footer className="build-footer"><span role={build.error || build.conflict ? "alert" : "status"}>{build.conflict ? t("metadataBuild.conflict") : build.error ? t("metadataBuild.actionFailed") : build.message || t(build.dirty ? "metadataBuild.unsaved" : "metadataBuild.unchanged")}</span>
        <div><button type="button" className="cap-stable-settings-button" disabled={!build.dirty || build.busy} onClick={build.reset}>{t("metadataBuild.reset")}</button>
          <button type="button" className="cap-stable-settings-button primary" data-action="save" disabled={!build.dirty || !canSave} onClick={() => void build.perform("savePolicy")}>{t("metadataBuild.save")}</button></div></footer>
    </div>
    {pending && <dialog ref={dialogRef} className="build-leave-dialog" aria-label={t("metadataBuild.leaveTitle")} onCancel={event => { event.preventDefault(); setPending(null); }}>
      <h2>{t("metadataBuild.leaveTitle")}</h2><p>{t(build.error ? "metadataBuild.actionFailed" : "metadataBuild.unsaved")}</p><div>
        <button type="button" className="cap-stable-settings-button" autoFocus disabled={build.busy} onClick={() => setPending(null)}>{t("metadataBuild.keepEditing")}</button>
        <button type="button" className="cap-stable-settings-button" disabled={build.busy} onClick={() => { build.reset(); setPending(null); pending(); }}>{t("metadataBuild.discard")}</button>
        <button type="button" className="cap-stable-settings-button primary" disabled={!canSave} onClick={() => void build.perform("savePolicy").then(saved => { if (saved) { setPending(null); pending(); } })}>{t("metadataBuild.saveBack")}</button>
      </div></dialog>}
  </div>;
}
