// Core stdout is reserved for startup/protocol. Accept only the bounded,
// path-free Catalog diagnostic schema from stderr into the rotating app log.
type Emit = (level: "info" | "warn", event: string, data: Record<string, unknown>) => void;
const events = new Set(["preparation-started", "preparation-stage", "preparation-rebuild", "preparation-retry",
  "preparation-completed", "preparation-cancelled", "preparation-failed", "monitor-interrupt", "monitor-retired", "monitor-failed", "monitor-started"]);
const categories: Record<string, RegExp> = {
  activityId: /^[a-f0-9]{32}$/, driveLetter: /^[A-Z]$/,
  origin: /^(explicit|monitor-startup|monitor-recovery)$/,
  stage: /^(inspect|snapshot-open|snapshot-read-and-stage|directory-paths-and-publish|journal-catch-up)$/,
  reason: /^(journal-replaced|checkpoint-missing|checkpoint-expired|checkpoint-invalidated|checkpoint-ahead|interrupted-build|explicit-rebuild|marked-for-rebuild|initial-build|journal-discontinuity|preparation-failed|reader-wait-unavailable|reader-entry-names-unavailable|reader-monitor-failed)$/,
  kind: /^(initial|rebuild|incremental)$/, operation: /^(discover|select|synchronize|rebuild|explicit)$/
};
const numbers = new Set(["elapsedMilliseconds", "records", "pages", "readerReadMilliseconds",
  "stagingWriteMilliseconds", "directoryPathMilliseconds", "publishMilliseconds", "totalMilliseconds"]);

export function createCatalogDiagnosticConsumer(emit: Emit) {
  let pending = "", oversized = false;
  const read = (line: string) => {
    try {
      const value = JSON.parse(line);
      if (value?.type !== "catalog-diagnostic-v1" || !events.has(value.name)
        || !value.data || typeof value.data !== "object" || Array.isArray(value.data)) return;
      const data: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value.data)) {
        if (item === null && (categories[key] || numbers.has(key))) continue;
        if (categories[key] && typeof item === "string" && categories[key].test(item)) data[key] = item;
        else if (numbers.has(key) && typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= Number.MAX_SAFE_INTEGER) data[key] = item;
        else return; // Reject arbitrary stderr, paths, exception messages and extra fields.
      }
      emit(value.name.endsWith("failed") ? "warn" : "info", `core.catalog.${value.name}`, data);
    } catch { /* Diagnostics must never interrupt Core startup or queries. */ }
  };
  return (chunk: string) => {
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf("\n", start);
      const end = newline < 0 ? chunk.length : newline;
      if (!oversized && pending.length + end - start <= 4096) pending += chunk.slice(start, end);
      else { pending = ""; oversized = true; }
      if (newline < 0) break;
      if (!oversized) read(pending);
      pending = ""; oversized = false; start = newline + 1;
    }
  };
}
