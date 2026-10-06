import { t } from "../../../electron/localization";
import StableUiIcon from "../stable-ui/StableUiIcon";
import type { Ref } from "react";

export default function CatalogQueryToolbar({ name, query, enabled, busy, onChange, onSubmit, inputRef }: {
  name: string; query: string; enabled: boolean; busy: boolean;
  onChange: (query: string) => void; onSubmit: () => void;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return <form className="cap-computer-search-box cap-catalog-query" aria-busy={busy} onSubmit={event => { event.preventDefault(); if (enabled) onSubmit(); }}>
    <StableUiIcon name="search" />
    <input ref={inputRef} value={query} disabled={!enabled} placeholder={t("computerSearch.placeholder", { scope: name })}
      aria-label={t("computerSearch.placeholder", { scope: name })} onChange={event => onChange(event.currentTarget.value)}
      onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onChange(""); } }} />
    {query && <button type="button" title={t("computerSearch.clear")} aria-label={t("computerSearch.clear")}
      onClick={() => onChange("")}><StableUiIcon name="clearSearch" /></button>}
  </form>;
}
