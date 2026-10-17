import { useEffect } from "react";
import { useCatalogActivity } from "./CatalogActivity";

// Legacy hosts keep their feedback; the unified workspace routes short messages to one grid strip.
export default function CatalogTransientFeedback({ message }: { message: string }) {
  const notify = useCatalogActivity()?.notify;
  useEffect(() => { if (message) notify?.(message); }, [message, notify]);
  return message && !notify ? <div className="cap-computer-search-feedback" role="status">{message}</div> : null;
}
