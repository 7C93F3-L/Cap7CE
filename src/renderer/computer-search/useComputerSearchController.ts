import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComputerSearchCapabilityOptions, ComputerSearchCapabilityResult, ComputerSearchItem, ComputerSearchStatus } from "../../../electron/computerSearchTypes";
import { getActiveLanguage, t } from "../../../electron/localization";
import type { ComputerSearchConditions } from "../../shared/computerSearchFactTypes";
import { readComputerSearchReplacement } from "./computerSearchResultRefresh";
import { createComputerSearchTaskIdGenerator } from "./computerSearchTaskIdentity";

export type ComputerSearchError = "scope-not-indexed" | "scope-offline" | "failed" | null;
export type ComputerSearchCapabilityFeedback = ComputerSearchCapabilityResult["status"] | null;

export const useComputerSearchController = (currentPath: string | null, foreground = true, conditions?: ComputerSearchConditions, onExit?: () => void, persistent = false, browseChildren = false) => {
  const conditionKey = JSON.stringify(conditions ?? {});
  const selectedConditions = useMemo(() => JSON.parse(conditionKey) as ComputerSearchConditions, [conditionKey]);
  const [active, setActive] = useState(false);
  const [nextTaskId] = useState<ReturnType<typeof createComputerSearchTaskIdGenerator>>(createComputerSearchTaskIdGenerator);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [status, setStatus] = useState<ComputerSearchStatus | null>(null);
  const [items, setItems] = useState<ComputerSearchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [interactionBlocked, setInteractionBlocked] = useState(false);
  const busyRef = useRef(busy);
  const interactionRef = useRef(interactionBlocked);
  const foregroundRef = useRef(foreground);
  busyRef.current = busy;
  interactionRef.current = interactionBlocked;
  foregroundRef.current = foreground;
  const [error, setError] = useState<ComputerSearchError>(null);
  const [capabilityBusy, setCapabilityBusy] = useState(false);
  const [capabilityFeedback, setCapabilityFeedback] = useState<ComputerSearchCapabilityFeedback>(null);
  const [capabilityOptions, setCapabilityOptions] = useState<ComputerSearchCapabilityOptions | null>(null);
  const taskRef = useRef<string | null>(null);
  const replacementTaskRef = useRef<string | null>(null);
  const requestSequence = useRef(0);
  const enterSequence = useRef(0);
  const activeRef = useRef(false);
  const statusRefreshInFlightRef = useRef<Promise<ComputerSearchStatus | null> | null>(null);
  const scopeLabel = useMemo(() => {
    if (!currentPath) return t("skim.computer");
    const trimmed = currentPath.replace(/[\\/]+$/, "");
    const segments = trimmed.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] ?? currentPath;
  }, [currentPath, getActiveLanguage()]);

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

  const cancelReplacement = useCallback(() => {
    const taskId = replacementTaskRef.current;
    replacementTaskRef.current = null;
    if (taskId) void window.cap7ce?.computerSearch.cancel(taskId);
  }, []);
  const cancelActive = useCallback(() => {
    cancelReplacement();
    const taskId = taskRef.current;
    taskRef.current = null;
    if (taskId) void window.cap7ce?.computerSearch.cancel(taskId);
  }, [cancelReplacement]);
  useEffect(() => { if (!foreground) cancelReplacement(); }, [foreground, cancelReplacement]);

  const exit = useCallback(() => {
    if (persistent) return;
    enterSequence.current += 1;
    activeRef.current = false;
    cancelActive();
    setBusy(false);
    setActive(false);
    onExit?.();
  }, [cancelActive, onExit, persistent]);

  useEffect(() => {
    if (!foreground || !active || !status || !["starting", "building", "syncing"].includes(status.state)) return;
    const timer = window.setInterval(() => void refreshStatus(), 1_500);
    return () => window.clearInterval(timer);
  }, [active, foreground, refreshStatus, status]);
  useEffect(() => {
    if (!active || !foreground || persistent) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      exit();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, foreground, exit, persistent]);
  useEffect(() => () => { activeRef.current = false; cancelActive(); }, [cancelActive]);

  const readError = (value: unknown): ComputerSearchError => {
    const message = String(value);
    return message.includes("scope-offline") ? "scope-offline"
      : message.includes("scope-not-indexed") ? "scope-not-indexed" : "failed";
  };

  const submit = useCallback(async () => {
    const searchQuery = query.trim();
    const api = window.cap7ce?.computerSearch;
    if (!api || !status?.searchAvailable) return;
    cancelActive();
    const sequence = ++requestSequence.current;
    const taskId = nextTaskId("search");
    taskRef.current = taskId;
    setBusy(true); setHasSubmitted(true); setError(null); setItems([]); setNextCursor(null); setSubmittedQuery(searchQuery);
    try {
      const page = await api.search({ taskId, query: searchQuery, scopePath: currentPath,
        ...(browseChildren && currentPath !== null && !searchQuery ? { scopeKind: "direct-children" as const } : {}),
        ...(selectedConditions.facts ? { facts: selectedConditions.facts } : {}),
        ...(selectedConditions.fileConditions ? { fileConditions: selectedConditions.fileConditions } : {}) });
      if (!activeRef.current || taskRef.current !== taskId) return;
      setItems(page.items); setNextCursor(page.nextCursor);
    } catch (cause) {
      if (activeRef.current && taskRef.current === taskId) {
        setError(readError(cause));
        void api.cancel(taskId);
        taskRef.current = null;
      }
    } finally {
      if (activeRef.current && requestSequence.current === sequence) setBusy(false);
    }
  }, [cancelActive, currentPath, query, status?.searchAvailable, selectedConditions, nextTaskId, browseChildren]);
  const refreshResults = useCallback(async (): Promise<"applied" | "failed" | "deferred"> => {
    const api = window.cap7ce?.computerSearch;
    if (!api || !activeRef.current || !foregroundRef.current || !hasSubmitted
      || busyRef.current || interactionRef.current || replacementTaskRef.current) return "deferred";
    const oldTaskId = taskRef.current;
    const sequence = requestSequence.current;
    const taskId = nextTaskId("refresh");
    replacementTaskRef.current = taskId;
    const isCurrent = () => activeRef.current && foregroundRef.current && !interactionRef.current
      && !busyRef.current && requestSequence.current === sequence && replacementTaskRef.current === taskId;
    try {
      const page = await readComputerSearchReplacement(api, { taskId, query: submittedQuery, scopePath: currentPath,
        ...(browseChildren && currentPath !== null && !submittedQuery ? { scopeKind: "direct-children" as const } : {}),
        facts: selectedConditions.facts, ...(selectedConditions.fileConditions ? { fileConditions: selectedConditions.fileConditions } : {}) },
      items.length, isCurrent);
      if (!page || !isCurrent()) return "deferred";
      replacementTaskRef.current = null;
      taskRef.current = taskId;
      setItems(page.items); setNextCursor(page.nextCursor); setError(null);
      if (oldTaskId) void api.cancel(oldTaskId);
      return "applied";
    } catch { return isCurrent() ? "failed" : "deferred"; }
    finally {
      if (replacementTaskRef.current === taskId) replacementTaskRef.current = null;
      if (taskRef.current !== taskId) void api.cancel(taskId);
    }
  }, [hasSubmitted, selectedConditions, submittedQuery, currentPath, items.length, nextTaskId, browseChildren]);
  useEffect(() => {
    requestSequence.current++;
    setHasSubmitted(false);
    setInteractionBlocked(false);
    cancelActive();
    setBusy(false);
  }, [currentPath, cancelActive, conditionKey, browseChildren]);
  useEffect(() => {
    if (!active || !foreground || !status?.searchAvailable || busy) return;
    if (!hasSubmitted || (!query.trim() && submittedQuery)) void submit();
  }, [active, foreground, status?.searchAvailable, busy, hasSubmitted, query, submittedQuery, submit]);

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

  const enter = useCallback((activateCapability = true) => {
    const sequence = ++enterSequence.current;
    activeRef.current = true;
    setActive(true);
    setItems([]);
    setNextCursor(null);
    setSubmittedQuery("");
    setHasSubmitted(false);
    setError(null);
    setCapabilityFeedback(null);
    setStatus({ state: "starting", searchAvailable: false, catalogRevision: 0, volumes: [] });
    void refreshStatus().then((nextStatus) => {
      if (!activeRef.current || enterSequence.current !== sequence || nextStatus?.state !== "not-enabled" || !activateCapability) return;
      void configureCapability("enable");
    });
  }, [configureCapability, refreshStatus]);
  useEffect(() => {
    if (persistent && foreground && !active) enter(false);
  }, [persistent, foreground, active, enter]);

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
    cancelReplacement();
    setBusy(true); setError(null);
    try {
      const page = await api.nextPage({ taskId, cursor });
      if (!activeRef.current || taskRef.current !== taskId) return;
      setItems((current) => [...current, ...page.items]); setNextCursor(page.nextCursor);
    } catch (cause) {
      if (activeRef.current && taskRef.current === taskId) setError(readError(cause));
    } finally { if (activeRef.current && taskRef.current === taskId) setBusy(false); }
  }, [busy, nextCursor, cancelReplacement]);

  return { active, query, submittedQuery, hasSubmitted, status, items, nextCursor, busy, error, scopeLabel,
    taskId: taskRef.current,
    canSubmit: Boolean(status?.searchAvailable), capabilityBusy, capabilityFeedback, capabilityOptions,
    enter, exit, setQuery, submit, loadMore, refreshStatus, configureCapability,
    refreshResults, interactionBlocked, setInteractionBlocked };
};

export type ComputerSearchController = ReturnType<typeof useComputerSearchController>;
