import { useEffect, useRef, useState } from "react";
import { t } from "../../../../electron/localization";
import { useMetadataBuild } from "../../metadata-build/useMetadataBuild";
import { createMetadataSettingsDraft, defaultMetadataPolicy, metadataDraftPolicy, scopeKey, type MetadataSettingsDraft, type MetadataScope, type MetadataScopeKind } from "./settingsMetadataPolicy";

export function useSettingsMetadataBuild() {
  const [visible, setVisible] = useState(document.visibilityState !== "hidden");
  useEffect(() => { const update = () => setVisible(document.visibilityState !== "hidden"); document.addEventListener("visibilitychange", update); return () => document.removeEventListener("visibilitychange", update); }, []);
  const build = useMetadataBuild(true, visible);
  const [draft, setDraft] = useState<MetadataSettingsDraft | null>(null), [base, setBase] = useState("");
  const [labels, setLabels] = useState<Record<string, string>>({}), [message, setMessage] = useState("");
  const [scopeBusy, setScopeBusy] = useState(false), lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const policy = draft ? metadataDraftPolicy(draft) : null;
  const dirty = Boolean(policy && JSON.stringify(policy) !== base);
  const source = build.status ? JSON.stringify(defaultMetadataPolicy(build.status)) : "";
  const conflict = dirty && Boolean(base && source !== base);
  const running = Boolean(build.status && !["idle", "paused", "completed", "failed"].includes(build.status.progress.phase));
  const directoryPending = Boolean(build.status?.directoryTask?.pending);
  const busy = build.busy || scopeBusy;
  const locked = busy || running || directoryPending;
  useEffect(() => {
    if (build.status && !dirty && !busy) { setDraft(createMetadataSettingsDraft(build.status)); setBase(source); }
  }, [source, dirty, busy, build.status?.volumes.map(v => v.volumeId).join("|")]);
  const change = (update: (value: MetadataSettingsDraft) => MetadataSettingsDraft) => {
    if (locked) return; build.clearError(); setMessage(""); setDraft(value => value ? update(value) : value);
  };
  const toggle = (id: string) => change(value => ({ ...value, selected: value.selected.includes(id) ? value.selected.filter(v => v !== id) : [...value.selected, id] }));
  const move = (id: string, direction: number) => change(value => {
    const order = [...value.order], index = order.indexOf(id), next = index + direction;
    if (next < 0 || next >= order.length) return value;
    [order[index], order[next]] = [order[next], order[index]]; return { ...value, order };
  });
  const reset = () => { if (build.status && !busy) { build.clearError(); setDraft(createMetadataSettingsDraft(build.status)); setBase(source); setMessage(""); } };
  const perform = async (kind: "savePolicy" | "start" | "pause" | "resume" | "cancelDirectories") => {
    if (lock.current || busy || ((kind === "savePolicy" || kind === "start") && (!policy?.volumeOrder.length || conflict))) return false;
    lock.current = true; setMessage("");
    try {
      const next = await build.action(kind, policy);
      if (!next || !alive.current) return false;
      if (kind === "savePolicy" || kind === "start") { setDraft(createMetadataSettingsDraft(next)); setBase(JSON.stringify(defaultMetadataPolicy(next))); }
      if (kind === "savePolicy") setMessage(t("metadataBuild.saved"));
      return true;
    } finally { lock.current = false; }
  };
  const add = async (path: string, kind: MetadataScopeKind) => {
    if (locked || lock.current || !draft) return false;
    setScopeBusy(true); lock.current = true; build.clearError(); setMessage("");
    try {
      const resolved = await window.cap7ce!.metadataBuild.resolveScope(path.trim());
      if (!alive.current) return false;
      const scope = { volumeId: resolved.volumeId, rootFileReference: resolved.rootFileReference }, key = scopeKey(scope);
      if (scope.rootFileReference === null || draft[kind === "includes" ? "excludes" : "includes"].some(s => scopeKey(s) === key)
        || draft.includes.length + draft.excludes.length >= 256) throw new Error("invalid-scope");
      const values = kind === "includes" ? draft.includes.filter(s => s.volumeId !== scope.volumeId || s.rootFileReference !== null) : draft.excludes;
      setDraft({ ...draft, order: draft.order.includes(scope.volumeId) ? draft.order : [...draft.order, scope.volumeId],
        selected: [...new Set([...draft.selected, scope.volumeId])],
        [kind]: values.some(s => scopeKey(s) === key) ? values : [...values, scope] });
      setLabels(previous => ({ ...previous, [key]: resolved.label })); return true;
    } catch { if (alive.current) setMessage(t("metadataBuild.scopeFailed")); return false; }
    finally { lock.current = false; if (alive.current) setScopeBusy(false); }
  };
  const remove = (scope: MetadataScope, kind: MetadataScopeKind) => change(value => {
    const remaining = value[kind].filter(s => scopeKey(s) !== scopeKey(scope));
    if (kind === "includes" && !remaining.some(s => s.volumeId === scope.volumeId)) remaining.push({ volumeId: scope.volumeId, rootFileReference: null });
    return { ...value, [kind]: remaining };
  });
  return { ...build, draft, policy, dirty, conflict, running, directoryPending, busy, locked, message, labels: { ...build.status?.scopeLabels, ...labels }, toggle, move, reset, perform, add, remove };
}
export type SettingsMetadataBuild = ReturnType<typeof useSettingsMetadataBuild>;
