import { useRef, type FormEvent, type Ref } from "react";
import type { SearchState } from "../../shared/types";
import { t } from "../../../electron/localization";
import StableUiIcon from "./StableUiIcon";
interface StableSearchInputProps {
  search: SearchState;
  inputRef: Ref<HTMLInputElement>;
  inputFeedback: string;
  onSearchChange: (search: SearchState) => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onSearch: (search: SearchState) => void;
}
const StableSearchInput = ({ search, inputRef, inputFeedback, onSearchChange, onSearchOptionsChange, onSearch }: StableSearchInputProps) => {
  const composingRef = useRef(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (composingRef.current) return;
    const submittedQuery = event.currentTarget.querySelector("input")?.value ?? search.query;
    onSearch({ ...search, query: submittedQuery });
  };
  return (
    <form className="cap-stable-search-slot" role="search" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <StableUiIcon name="search" className="cap-stable-search-icon" />
      <input
        ref={inputRef}
        value={search.query}
        placeholder={inputFeedback || t("search.inputLabel")}
        title={inputFeedback || undefined}
        aria-label={t("search.inputLabel")}
        autoComplete="off"
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={() => { composingRef.current = false; }}
        onChange={(event) => {
          const nextSearch = { ...search, query: event.target.value };
          const clearedQuery = search.query.trim().length > 0 && nextSearch.query.trim().length === 0;
          onSearchChange(nextSearch);
          if (clearedQuery) onSearchOptionsChange(nextSearch);
        }}
      />
      {search.query.length > 0 && <button className="cap-stable-search-clear" type="button" title={t("search.clearQuery")} aria-label={t("search.clearQuery")} onPointerDown={(event) => event.preventDefault()} onClick={(event) => { const nextSearch = { ...search, query: "" }; onSearchChange(nextSearch); onSearchOptionsChange(nextSearch); event.currentTarget.form?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }); }}><StableUiIcon name="clearSearch" className="cap-stable-search-clear-icon" /></button>}
    </form>
  );
};
export default StableSearchInput;
