import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import type { SkimBreadcrumb, SkimBrowseEntry, SkimBrowseOptions } from "../../shared/types";
import { formatDisplayMessage } from "../formatting";

interface SkimReadControllerOptions {
  browseOptions: SkimBrowseOptions;
  clearFeedback: () => void;
  showFeedback: (message: string) => void;
}

export const useSkimReadController = ({
  browseOptions,
  clearFeedback,
  showFeedback
}: SkimReadControllerOptions) => {
  const [entries, setEntries] = useState<SkimBrowseEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<SkimBreadcrumb[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [visualSessionId, setVisualSessionId] = useState("");
  const taskIdRef = useRef<string | null>(null);
  const visualSessionIdRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    const taskId = taskIdRef.current;
    taskIdRef.current = null;
    if (taskId) {
      void window.cap7ce?.skim.cancel(taskId);
    }
    const activeVisualSessionId = visualSessionIdRef.current;
    visualSessionIdRef.current = null;
    setVisualSessionId("");
    if (activeVisualSessionId) {
      void window.cap7ce?.skim.cancelVisualSession(activeVisualSessionId);
    }
    setIsLoading(false);
  }, []);

  const reset = useCallback(() => {
    setEntries([]);
    setCurrentPath(null);
    setBreadcrumbs([]);
  }, []);

  const load = useCallback(async (nextPath: string | null) => {
    const previousTaskId = taskIdRef.current;
    if (previousTaskId) {
      void window.cap7ce?.skim.cancel(previousTaskId);
    }
    const previousVisualSessionId = visualSessionIdRef.current;
    if (previousVisualSessionId) {
      void window.cap7ce?.skim.cancelVisualSession(previousVisualSessionId);
    }
    visualSessionIdRef.current = null;
    setVisualSessionId("");
    const taskId = window.crypto?.randomUUID?.() ?? `skim-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    taskIdRef.current = taskId;
    await window.cap7ce?.skim.beginVisualSession(taskId);
    setIsLoading(true);
    clearFeedback();
    try {
      const response = await window.cap7ce?.skim.read({
        taskId,
        path: nextPath,
        options: browseOptions
      });
      if (!response || taskIdRef.current !== taskId || response.taskId !== taskId || response.cancelled) {
        return false;
      }
      setEntries(response.entries);
      setCurrentPath(response.currentPath);
      setBreadcrumbs(response.breadcrumbs);
      visualSessionIdRef.current = taskId;
      setVisualSessionId(taskId);
      return true;
    } catch (error) {
      if (taskIdRef.current === taskId) {
        void window.cap7ce?.skim.cancelVisualSession(taskId);
        showFeedback(formatDisplayMessage(error instanceof Error ? error.message : t("skim.readFailed")));
      }
      return false;
    } finally {
      if (taskIdRef.current === taskId) {
        taskIdRef.current = null;
        setIsLoading(false);
      }
    }
  }, [browseOptions, clearFeedback, showFeedback]);

  useEffect(() => () => {
    if (taskIdRef.current) {
      void window.cap7ce?.skim.cancel(taskIdRef.current);
      taskIdRef.current = null;
    }
    if (visualSessionIdRef.current) {
      void window.cap7ce?.skim.cancelVisualSession(visualSessionIdRef.current);
      visualSessionIdRef.current = null;
    }
  }, []);

  return {
    entries,
    currentPath,
    breadcrumbs,
    isLoading,
    visualSessionId,
    load,
    cancel,
    reset
  };
};
