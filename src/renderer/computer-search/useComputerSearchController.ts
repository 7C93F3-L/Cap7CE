import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComputerSearchCapabilityOptions, ComputerSearchCapabilityResult, ComputerSearchItem, ComputerSearchStatus } from "../../../electron/computerSearchTypes";
import { t } from "../../../electron/localization";

export type ComputerSearchError = "scope-not-indexed" | "scope-offline" | "failed" | null;
export type ComputerSearchCapabilityFeedback = ComputerSearchCapabilityResult["status"] | null;

export const useComputerSearchController = (currentPath: string | null) => {
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState<ComputerSearchStatus | null>(null);
  const [items, setItems] = useState<ComputerSearchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ComputerSearchError>(null);
  const [capabilityBusy, setCapabilityBusy] = useState(false);
  const [capabilityFeedback, setCapabilityFeedback] = useState<ComputerSearchCapabilityFeedback>(null);
  const [capabilityOptions, setCapabilityOptions] = useState<ComputerSearchCapabilityOptions | null>(null);
  const taskRef = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const enterSequence = useRef(0);
  const activeRef = useRef(false);
  const statusRefreshInFlightRef = useRef<Promise<ComputerSearchStatus | null> | null>(null);
  const scopeLabel = useMemo(() => {
    if (!currentPath) return t("skim.computer");
    const trimmed = currentPath.replace(/[\\/]+$/, "");
    const segments = trimmed.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] ?? currentPath;
  }, [currentPath]);

  const refreshStatus = useCallback(async () => {
    const api = window.cap7ce?.computerSearch;
    if (!api) {
      const next: ComputerSearchStatus = { state: "unavailable", reason: "bridge-unavailable",
        searchAvailable: false, catalogRevision: 0, volumes: [] };
      setStatus(next);
      return next;
    }
    if (statusRefreshInFlightRef.current) return statusRefreshInFlightRef.current;
    const request = (async () => {
      try {
        const next = await api.status();
        if (activeRef.current) setStatus(next);
        return next;
      } catch {
        // A busy catalog can transiently miss one status deadline. Keep the last
        // observable state so the active-mode poll can recover on its next pass.
        return null;
      }
    })();
    statusRefreshInFlightRef.current = request;
    void request.finally(() => {
      if (statusRefreshInFlightRef.current === request) statusRefreshInFlightRef.current = null;
    });
    return request;
  }, []);

  const cancelActive = useCallback(() => {
    const taskId = taskRef.current;
    taskRef.current = null;
    if (taskId) void window.cap7ce?.computerSearch.cancel(taskId);
  }, []);

  const exit = useCallback(() => {
    enterSequence.current += 1;
    activeRef.current = false;
    cancelActive();
    setBusy(false);
    setActive(false);
  }, [cancelActive]);

  useEffect(() => {
    if (!active || !status || !["starting", "building", "syncing"].includes(status.state)) return;
    const timer = window.setInterval(() => void refreshStatus(), 1_500);
    return () => window.clearInterval(timer);
  }, [active, refreshStatus, status]);
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      exit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, exit]);
  useEffect(() => () => { activeRef.current = false; cancelActive(); }, [cancelActive]);

  const readError = (value: unknown): ComputerSearchError => {
    const message = String(value);
    return message.includes("scope-offline") ? "scope-offline"
      : message.includes("scope-not-indexed") ? "scope-not-indexed" : "failed";
  };

  const submit = useCallback(async () => {
    const searchQuery = query.trim();
    const api = window.cap7ce?.computerSearch;
    if (!api || !status?.searchAvailable || !searchQuery) return;
    cancelActive();
    const taskId = `computer_search_${Date.now()}_${++requestSequence.current}`;
    taskRef.current = taskId;
    setBusy(true); setError(null); setItems([]); setNextCursor(null); setSubmittedQuery(searchQuery);
    try {
      const page = await api.search({ taskId, query: searchQuery, scopePath: currentPath });
      if (!activeRef.current || taskRef.current !== taskId) return;
      setItems(page.items); setNextCursor(page.nextCursor);
    } catch (cause) {
      if (activeRef.current && taskRef.current === taskId) {
        setError(readError(cause));
        void api.cancel(taskId);
        taskRef.current = null;
      }
    } finally {
      if (activeRef.current) setBusy(false);
    }
  }, [cancelActive, currentPath, query, status?.searchAvailable]);

  const configureCapability = useCallback(async (action: "enable" | "repair") => {
    const api = window.cap7ce?.computerSearch;
    if (!api || capabilityBusy) return;
    setCapabilityBusy(true); setCapabilityFeedback(null);
    try {
      const options = await api.capabilityOptions(); setCapabilityOptions(options);
      if (!options.bundleAvailable) { setCapabilityFeedback("unavailable"); return; }
      const volumeLetters = options.volumes.map((volume) => volume.driveLetter);
      if (volumeLetters.length === 0) { setCapabilityFeedback("unavailable"); return; }
      const result = await api.configureCapability({ action, volumeLetters, removeCatalog: false });
      setCapabilityFeedback(result.reason === "activation-elevation-cancelled" ? null : result.status);
      if (result.status === "completed") {
        setStatus({ state: "starting", searchAvailable: false, catalogRevision: 0, volumes: [] });
        await refreshStatus();
      }
    } catch { setCapabilityFeedback("failed"); }
    finally { if (activeRef.current) setCapabilityBusy(false); }
  }, [capabilityBusy, refreshStatus]);

  const enter = useCallback(() => {
    const sequence = ++enterSequence.current;
    activeRef.current = true;
    setActive(true);
    setItems([]);
    setNextCursor(null);
    setSubmittedQuery("");
    setError(null);
    setCapabilityFeedback(null);
    setStatus({ state: "starting", searchAvailable: false, catalogRevision: 0, volumes: [] });
    void refreshStatus().then((nextStatus) => {
      if (!activeRef.current || enterSequence.current !== sequence || nextStatus?.state !== "not-enabled") return;
      void configureCapability("enable");
    });
  }, [configureCapability, refreshStatus]);

  useEffect(() => {
    if (!capabilityBusy) return;
    const timer = window.setInterval(() => void window.cap7ce?.computerSearch.capabilityOptions()
      .then((options) => { if (activeRef.current) setCapabilityOptions(options); }).catch(() => undefined), 500);
    return () => window.clearInterval(timer);
  }, [capabilityBusy]);

  const loadMore = useCallback(async () => {
    const taskId = taskRef.current;
    const cursor = nextCursor;
    const api = window.cap7ce?.computerSearch;
    if (!api || !taskId || !cursor || busy) return;
    setBusy(true); setError(null);
    try {
      const page = await api.nextPage({ taskId, cursor });
      if (!activeRef.current || taskRef.current !== taskId) return;
      setItems((current) => [...current, ...page.items]); setNextCursor(page.nextCursor);
    } catch (cause) {
      if (activeRef.current && taskRef.current === taskId) setError(readError(cause));
    } finally { if (activeRef.current) setBusy(false); }
  }, [busy, nextCursor]);

  return { active, query, submittedQuery, status, items, nextCursor, busy, error, scopeLabel,
    taskId: taskRef.current,
    canSubmit: Boolean(status?.searchAvailable), capabilityBusy, capabilityFeedback, capabilityOptions,
    enter, exit, setQuery, submit, loadMore, refreshStatus, configureCapability };
};

export type ComputerSearchController = ReturnType<typeof useComputerSearchController>;
