import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { t } from "../../../electron/localization";
import type { AiSearchUpdate, ImageIndexItem, SearchState } from "../../shared/types";
import { mergeAiSearchResults } from "./aiSearchState";

export type AiSearchPhase = Extract<AiSearchUpdate, { type: "status" }>["phase"] | "idle";

export interface UseAiSearchBetaOptions {
  setResults: Dispatch<SetStateAction<ImageIndexItem[]>>;
  onFeedback: (message: string) => void;
}

const filePathKey = (filePath: string) => filePath.toLocaleLowerCase();

export const useAiSearchBeta = ({ setResults, onFeedback }: UseAiSearchBetaOptions) => {
  const [enabled, setEnabled] = useState(false);
  const [phase, setPhase] = useState<AiSearchPhase>("idle");
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const activeSessionIdRef = useRef<string | null>(null);
  const activeScopeRef = useRef<string | null>(null);
  const phaseRef = useRef<AiSearchPhase>("idle");
  const preservedMatchesRef = useRef<ImageIndexItem[]>([]);

  const cancelActive = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    activeSessionIdRef.current = null;
    if (sessionId) void window.cap7ce?.aiSearch?.cancel(sessionId, true);
    activeScopeRef.current = null;
  }, []);

  const pauseActive = useCallback(() => {
    const sessionId = activeSessionIdRef.current;
    if (sessionId) void window.cap7ce?.aiSearch?.cancel(sessionId, false);
  }, []);

  useEffect(() => {
    const unsubscribe = window.cap7ce?.aiSearch?.onUpdate((update) => {
      if (update.sessionId !== activeSessionIdRef.current) return;
      setProgress({ processed: update.processed, total: update.total });
      if (update.type === "batch") {
        const preservedPaths = new Set(preservedMatchesRef.current.map((item) => filePathKey(item.filePath)));
        preservedMatchesRef.current = [
          ...preservedMatchesRef.current,
          ...update.matches.filter((item) => !preservedPaths.has(filePathKey(item.filePath)))
        ];
        setResults((current) => {
          const knownPaths = new Set(current.map((item) => filePathKey(item.filePath)));
          const additions = update.matches.filter((item) => !knownPaths.has(filePathKey(item.filePath)));
          return additions.length > 0 ? [...current, ...additions] : current;
        });
        return;
      }
      setPhase(update.phase);
      phaseRef.current = update.phase;
      if (update.phase === "completed") onFeedback(t("search.aiEnhanceCompleted"));
      if (update.phase === "failed" && update.message) onFeedback(update.message);
      if (update.phase === "completed" || update.phase === "cancelled" || update.phase === "failed") {
        activeSessionIdRef.current = null;
        activeScopeRef.current = null;
      }
    });
    return () => unsubscribe?.();
  }, [onFeedback, setResults]);

  useEffect(() => () => cancelActive(), [cancelActive]);

  const start = useCallback(async (search: SearchState, currentResults: ImageIndexItem[]) => {
    const scopeKey = JSON.stringify({
      query: search.query,
      directoryId: search.directoryId,
      fileFormat: search.fileFormat,
      includedExtensions: search.includedExtensions ?? []
    });
    const canResume = activeSessionIdRef.current !== null
      && activeScopeRef.current === scopeKey
      && phaseRef.current === "paused_user";
    if (!canResume) cancelActive();
    preservedMatchesRef.current = currentResults.filter((item) => item.searchEvidence?.classification === "aiDeepMatch");
    setResults(currentResults);
    setProgress({ processed: 0, total: 0 });
    if (!search.query.trim()) {
      setPhase("idle");
      phaseRef.current = "idle";
      return;
    }
    const sessionId = canResume && activeSessionIdRef.current
      ? activeSessionIdRef.current
      : window.crypto?.randomUUID?.() ?? `ai-search-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    activeSessionIdRef.current = sessionId;
    activeScopeRef.current = scopeKey;
    setPhase("starting");
    phaseRef.current = "starting";
    try {
      const response = await window.cap7ce?.aiSearch?.start({
        sessionId,
        search,
        excludeFilePaths: currentResults.map((item) => item.filePath)
      });
      if (activeSessionIdRef.current !== sessionId) return;
      if (!response?.accepted) {
        activeSessionIdRef.current = null;
        activeScopeRef.current = null;
        setPhase("completed");
        phaseRef.current = "completed";
        setProgress({ processed: 0, total: response?.totalCandidates ?? 0 });
        if (response) onFeedback(t("search.aiEnhanceCompleted"));
      } else {
        setProgress({ processed: 0, total: response.totalCandidates });
      }
    } catch (error) {
      if (activeSessionIdRef.current !== sessionId) return;
      activeSessionIdRef.current = null;
      activeScopeRef.current = null;
      setPhase("failed");
      phaseRef.current = "failed";
      onFeedback(error instanceof Error ? error.message : t("search.aiStartFailed"));
    }
  }, [cancelActive, onFeedback, setResults]);

  const activate = useCallback(() => setEnabled(true), []);
  const deactivate = useCallback(() => {
    setEnabled(false);
    cancelActive();
    setPhase("idle");
    phaseRef.current = "idle";
    setProgress({ processed: 0, total: 0 });
  }, [cancelActive]);

  const mergePreservedResults = useCallback((baseResults: ImageIndexItem[]) => {
    return mergeAiSearchResults(baseResults, preservedMatchesRef.current);
  }, []);
  const busy = phase === "starting" || phase === "running";
  const toggleCurrentSearch = useCallback((search: SearchState, currentResults: ImageIndexItem[]) => {
    if (phaseRef.current === "starting" || phaseRef.current === "running") {
      pauseActive();
    } else if (enabled && phaseRef.current === "paused_user") {
      void start(search, currentResults);
    }
  }, [enabled, pauseActive, start]);

  return { enabled, busy, phase, progress, activate, deactivate, start, toggleCurrentSearch, cancelActive, mergePreservedResults };
};
