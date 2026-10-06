import { useEffect, useState } from "react";
import { t } from "../../../electron/localization";

export default function CatalogDirectoryToolbar({ path, browseChildren, canBack, canForward, canUp, onBack, onForward, onUp, onOpen, onReset, onHome }: {
  path: string | null; browseChildren: boolean; canBack: boolean; canForward: boolean; canUp: boolean;
  onBack: () => void; onForward: () => void; onUp: () => void; onOpen: (path: string) => void; onReset: () => void;
  onHome: () => void;
}) {
  const [draft, setDraft] = useState(path ?? "");
  useEffect(() => setDraft(path ?? ""), [path]);
  return <form className="cap-catalog-directory-toolbar" onSubmit={event => {
    event.preventDefault(); if (draft.trim()) onOpen(draft); else onReset();
  }}>
    <button type="button" disabled={!canBack} aria-label={t("catalogWorkspace.back")} title={t("catalogWorkspace.back")} onClick={onBack}>←</button>
    <button type="button" disabled={!canForward} aria-label={t("catalogWorkspace.forward")} title={t("catalogWorkspace.forward")} onClick={onForward}>→</button>
    <button type="button" disabled={!canUp} aria-label={t("catalogWorkspace.up")} title={t("catalogWorkspace.up")} onClick={onUp}>↑</button>
    <button type="button" aria-label={t("skim.computer")} title={t("skim.computer")} onClick={onHome}>⌂</button>
    <input value={draft} aria-label={t("catalogWorkspace.path")} placeholder={t("catalogWorkspace.path")} title={path ?? ""}
      onChange={event => setDraft(event.currentTarget.value)} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(path ?? ""); }
      }} />
    {browseChildren ? <button type="button" onClick={onReset}>{t("catalogWorkspace.returnScope")}</button>
      : path && <button type="button" onClick={() => onOpen(path)}>{t("catalogWorkspace.browseFolder")}</button>}
  </form>;
}
