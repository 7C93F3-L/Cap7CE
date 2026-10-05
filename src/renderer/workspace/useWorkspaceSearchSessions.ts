import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ImageIndexItem, SearchState, SkimDisplayPreferences } from "../../shared/types";
import type { WorkspaceSearchBridge } from "../../shared/workspaceTypes";
import type { useAiSearchBeta } from "../ai-search/useAiSearchBeta";
import type { useRandomBrowse } from "../explore/useRandomBrowse";
import { createInitialResultGridScrollMemory, type ResultGridScrollMemory } from "../virtualGridLayout";
import { useWorkspaceTabs } from "./useWorkspaceTabs";
import { workspaceTabsReducer, type WorkspaceSnapshot, type WorkspaceTab, type WorkspaceTabsAction } from "./workspaceTabs";

interface SessionOptions {
  search: SearchState; initialSearch: SearchState; display: SkimDisplayPreferences;
  setSearch: Dispatch<SetStateAction<SearchState>>; setDisplay: Dispatch<SetStateAction<SkimDisplayPreferences>>;
  random: ReturnType<typeof useRandomBrowse<ImageIndexItem>>; ai: ReturnType<typeof useAiSearchBeta>;
  results: ImageIndexItem[]; setResults: Dispatch<SetStateAction<ImageIndexItem[]>>;
  formats: string[]; setFormats: Dispatch<SetStateAction<string[]>>;
  error: string; setError: Dispatch<SetStateAction<string>>; searching: boolean;
  scroll: MutableRefObject<ResultGridScrollMemory>; submitted: MutableRefObject<SearchState>;
  initialized: MutableRefObject<boolean>; setSelectedId: Dispatch<SetStateAction<string | null>>;
  cancel: () => void; refresh: (search: SearchState, display: SkimDisplayPreferences) => void;
}
type SessionCache = { results: ImageIndexItem[]; formats: string[]; error: string; submitted: SearchState; ai: ReturnType<SessionOptions["ai"]["capture"]> };
const directoryIdFor = (tab: WorkspaceTab) => tab.kind === "skim" ? "all" : tab.directoryId;

export const useWorkspaceSearchSessions = (options: SessionOptions) => {
  const makeInitial = (id: string): WorkspaceSnapshot => ({ search: { ...structuredClone(options.initialSearch), directoryId: id, sortField: options.search.sortField, sortDirection: options.search.sortDirection }, displayMode: options.display.searchMode, randomBrowse: { enabled: false, seed: 0, batchNumber: 0 }, scroll: createInitialResultGridScrollMemory(), selectedIds: [] });
  const { state, dispatch } = useWorkspaceTabs(makeInitial("all"));
  const current = useRef(state); current.current = state;
  const activeDirectory = useRef("all");
  const selectedIds = useRef<string[]>([]);
  const cache = useRef(new Map<string, SessionCache>());
  const dirty = useRef(new Set<string>());
  const generation = useRef(0);
  const [viewKey, setViewKey] = useState("all:0");
  const apply = (action: WorkspaceTabsAction) => { current.current = workspaceTabsReducer(current.current, action); dispatch(action); };
  const capture = () => {
    const id = activeDirectory.current;
    const tab = current.current.tabs.find((item) => directoryIdFor(item) === id && item.kind !== "skim");
    if (!tab) return;
    apply({ type: "snapshot", id: tab.id, snapshot: { search: options.search, displayMode: options.display.searchMode, randomBrowse: { enabled: options.random.enabled, seed: options.random.seed, batchNumber: options.random.batchNumber }, scroll: options.scroll.current, selectedIds: selectedIds.current } });
    cache.current.set(id, { results: options.results, formats: options.formats, error: options.error, submitted: structuredClone(options.submitted.current), ai: options.ai.capture() });
    if (options.searching) dirty.current.add(id);
  };
  const restore = (tab: WorkspaceTab, activate = true) => {
    if (tab.kind === "skim") return;
    options.cancel();
    const id = tab.directoryId, snapshot = tab.snapshot, saved = cache.current.get(id);
    activeDirectory.current = id; selectedIds.current = [...snapshot.selectedIds];
    options.scroll.current = structuredClone(snapshot.scroll);
    options.submitted.current = structuredClone(saved?.submitted ?? snapshot.search);
    options.initialized.current = true;
    options.setSearch(structuredClone(snapshot.search));
    options.setDisplay((display) => ({ ...display, searchMode: snapshot.displayMode }));
    options.random.restore(snapshot.randomBrowse);
    options.ai.restore(saved?.ai ?? { enabled: false, phase: "idle", progress: { processed: 0, total: 0 }, matches: [] });
    options.setResults(saved?.results ?? []); options.setFormats(saved?.formats ?? []); options.setError(saved?.error ?? "");
    options.setSelectedId(snapshot.selectedIds[0] ?? null);
    setViewKey(`${id}:${++generation.current}`);
    if (activate) apply({ type: "activate", id: tab.id });
    const needsRefresh = dirty.current.delete(id);
    if (!saved || needsRefresh) options.refresh(options.submitted.current, { ...options.display, searchMode: snapshot.displayMode });
  };
  const selectDirectory = (id: string) => {
    const tabId = id === "all" ? "all" : `directory:${id}`;
    if (current.current.activeId === tabId) return;
    capture();
    apply({ type: "open-directory", directoryId: id, initial: makeInitial(id) });
    const tab = current.current.tabs.find((item) => item.id === tabId);
    if (tab) restore(tab);
  };
  const openSkim = () => {
    if (current.current.activeId === "skim") return;
    capture(); options.cancel();
    const saved = options.ai.capture(); options.ai.restore(saved);
    apply({ type: "open-skim" });
  };
  const select = (id: string) => {
    const tab = current.current.tabs.find((item) => item.id === id);
    if (tab?.kind === "skim") openSkim(); else if (tab) selectDirectory(tab.directoryId);
  };
  const close = (id: string) => {
    if (id === "all") return;
    const tab = current.current.tabs.find((item) => item.id === id);
    if (!tab) return;
    capture(); const previousActive = current.current.activeId;
    apply({ type: "close", id });
    if (tab.kind !== "skim") { cache.current.delete(tab.directoryId); dirty.current.delete(tab.directoryId); }
    if (previousActive === id) {
      const next = current.current.tabs.find((item) => item.id === current.current.activeId);
      if (next?.kind === "skim") { options.cancel(); options.ai.restore(options.ai.capture()); }
      else if (next) restore(next);
    } else if (tab.kind !== "skim" && tab.directoryId === activeDirectory.current) restore(current.current.tabs[0], false);
  };
  const owner = generation.current;
  const bridge: WorkspaceSearchBridge = {
    identities: state.tabs, activeId: state.activeId, activeDirectoryId: activeDirectory.current, viewKey,
    selectDirectory, select, close, openSkim,
    selectionMemory: { ids: selectedIds.current, onChange: (ids) => { if (generation.current === owner) selectedIds.current = [...ids]; } }
  };
  return { ...bridge, invalidate: () => { for (const id of cache.current.keys()) dirty.current.add(id); dirty.current.add(activeDirectory.current); } };
};
