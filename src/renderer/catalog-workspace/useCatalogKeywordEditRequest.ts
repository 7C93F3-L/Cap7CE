import { useEffect, useRef } from "react";
import { useCatalogActivity } from "./CatalogActivity";
export function useCatalogKeywordEditRequest(key: string, available: boolean, edit: () => void) {
  const activity = useCatalogActivity(), request = activity?.editRequest, action = useRef(edit); action.current = edit;
  useEffect(() => {
    if (available && request?.key === key) { action.current(); activity?.consumeEditRequest(request.id); }
  }, [key, available, request]);
}
