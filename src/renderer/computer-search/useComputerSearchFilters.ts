import { useCallback, useEffect, useMemo, useState } from "react";
import type { SearchState } from "../../shared/types";
import type { SearchFilterDetailDomain } from "../../shared/searchFilterTypes";
import { fileFormatCapabilities } from "../../../electron/formatCapabilities";
import { toComputerSearchArchiveConditions } from "./computerSearchArchiveConditions";

const initial = (): SearchState => ({ query: "", directoryId: "all", fileFormat: "all", sortField: "file_name", sortDirection: "asc" });
const availableFormats = fileFormatCapabilities.filter(format => format.canSearch).map(format => format.extension);
const detailDomains: readonly SearchFilterDetailDomain[] = ["visual", "video", "video-color", "audio", "font", "model", "document", "project", "threeD", "text", "data", "archive"];
// Own one independent Core filter session. Directory searches keep their own existing state.
export const useComputerSearchFilters = (present: boolean) => {
  const [search, setSearch] = useState(initial);
  const clear = useCallback(() => setSearch(initial()), []);
  useEffect(() => { if (!present) clear(); }, [present, clear]);
  const selection = useMemo(() => {
    try { return { conditions: toComputerSearchArchiveConditions(search), invalid: false }; }
    catch { return { conditions: { fileConditions: { extensions: [] } }, invalid: true }; }
  }, [search]);
  return { ...selection, clear, panel: { search, availableFormats, detailDomains, onChange: setSearch, onClear: clear } };
};
