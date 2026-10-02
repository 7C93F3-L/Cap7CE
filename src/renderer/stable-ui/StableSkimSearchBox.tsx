import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { t } from "../../../electron/localization";
import StableUiIcon from "./StableUiIcon";
import type { StableSkimSearchControls } from "./stableSkimTypes";

const StableSkimSearchBox = ({ query, scopeLabel, canSubmit, onExit, onQueryChange, onSubmit }:
  StableSkimSearchControls) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); if (canSubmit && query.trim()) onSubmit(); };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onExit();
  };
  return <form className="cap-computer-search-box" onSubmit={submit}>
    <StableUiIcon name="search" />
    <input ref={inputRef} value={query} disabled={!canSubmit}
      placeholder={t("computerSearch.placeholder", { scope: scopeLabel })}
      aria-label={t("computerSearch.placeholder", { scope: scopeLabel })}
      onChange={(event) => onQueryChange(event.currentTarget.value)} onKeyDown={handleKeyDown} />
    {query && <button type="button" title={t("computerSearch.clear")} aria-label={t("computerSearch.clear")}
      onClick={() => { onQueryChange(""); inputRef.current?.focus(); }}><StableUiIcon name="clearSearch" /></button>}
  </form>;
};

export default StableSkimSearchBox;
