import { useEffect, useRef, useState } from "react";
import { t } from "../../../electron/localization";
import type { CatalogCommandOperation, CatalogCommandPage } from "../../shared/catalogCommandTypes";
import { parseCatalogCommand } from "./catalogCommandRegistry";
import { parseQuickCommand } from "../commandParser";
import { useCatalogCommandRunner } from "./CatalogCommandProvider";
import { catalogCommandErrorMessage } from "./catalogCommandErrors";

export function useCatalogCommandInput({ path, query, searchMode, active = true, page, onQuery, onSubmit, onOpen }: {
  path: string | null; query: string; searchMode: boolean; active?: boolean; page?: CatalogCommandPage;
  onQuery: (value: string) => void; onSubmit: (value?: string) => void; onOpen: (value: string) => void;
}) {
  const runner = useCatalogCommandRunner(), [editing, setEditing] = useState(false), [draft, setDraft] = useState(path ?? ""), [search, setSearch] = useState(query);
  const [answer, setAnswer] = useState(""), [awaiting, setAwaiting] = useState(false), pending = useRef<{ operation: CatalogCommandOperation; raw: string } | null>(null);
  const generation = useRef(0), submitting = useRef(false), noticeId = useRef<number | undefined>(), previousPath = useRef(path), latest = useRef({ path, query, searchMode, search, runner });
  latest.current = { path, query, searchMode, search, runner };
  const restore = () => { setSearch(latest.current.query); setDraft(latest.current.path ?? ""); setEditing(false); setAnswer(""); setAwaiting(false); };
  const cancel = (feedback = true, resetScope = false) => {
    const hadPending = Boolean(pending.current), savedDraft = latest.current.search; pending.current = null; generation.current++;
    if (noticeId.current !== undefined) latest.current.runner?.clear(noticeId.current); noticeId.current = undefined; restore();
    if (!hadPending && !resetScope && parseCatalogCommand(savedDraft).type === "search") setSearch(savedDraft);
    if (feedback && hadPending) latest.current.runner?.notify(t("command.cancelled"));
  };
  useEffect(() => { cancel(true, previousPath.current !== path); previousPath.current = path;
    return () => { generation.current++; if (noticeId.current !== undefined) latest.current.runner?.clear(noticeId.current); }; }, [path, searchMode, active]);
  useEffect(() => { if (!submitting.current && !pending.current) setSearch(query); }, [query]);
  useEffect(() => window.cap7ce?.window?.onShellStateChanged?.(state => { if (state === "standby") cancel(); }), []);
  const retain = (raw: string) => { pending.current = null; setAwaiting(false); setAnswer(""); searchMode ? setSearch(raw) : (setDraft(raw), setEditing(true)); };
  const submit = async () => {
    if (submitting.current || runner?.isBusy()) return;
    const raw = awaiting ? answer : searchMode ? search : draft, own = generation.current;
    if (!active) return;
    submitting.current = true;
    try {
      if (pending.current) {
        const value = raw.trim().toLowerCase(), request = pending.current;
        if (value === "n") { cancel(); return; }
        if (value !== "y") { noticeId.current = runner?.notify(t("command.enterYesOrNo"), true, () => cancel()); return; }
        pending.current = null; setAwaiting(false);
        const ok = await runner!.invoke(request.operation);
        if (own === generation.current) ok ? restore() : retain(request.raw);
        return;
      }
      const candidate = parseCatalogCommand(raw);
      if (runner && page && candidate.type !== "search") {
        const preferences = await window.cap7ce?.preferences.get();
        if (own !== generation.current) return;
        const parsed = parseCatalogCommand(raw, preferences?.commandEnabled !== false);
        if (parsed.type === "missing-argument" || parsed.type === "unknown") {
          runner.notify(parsed.type === "unknown" ? parsed.command.domain === "ai" || parseQuickCommand(raw).type === "valid" ? t("catalogCommand.retired") : t("command.invalid", { command: parsed.command.raw }) : t("command.missingArgument", { message: parsed.message })); return;
        }
        if (parsed.type === "valid") {
          const operation = runner.prepare(parsed.command, page);
          if (operation.confirmation) {
            pending.current = { operation, raw }; setAnswer(""); setAwaiting(true); setEditing(true);
            noticeId.current = runner.notify(operation.confirmation, true, () => cancel());
          } else {
            const ok = await runner.invoke(operation);
            if (own === generation.current) ok ? restore() : retain(raw);
          }
          return;
        }
      }
      if (searchMode) onSubmit(raw); else if (raw.trim()) { onOpen(raw); setEditing(false); }
    } catch (error) { if (own === generation.current) runner?.notify(catalogCommandErrorMessage(error)); }
    finally { submitting.current = false; }
  };
  return { editing, awaiting, busy: Boolean(runner?.busy), searchValue: awaiting ? answer : search, pathValue: awaiting ? answer : draft,
    edit: () => { setDraft(path ?? ""); setEditing(true); },
    blur: () => { if (!pending.current && !runner?.busy && parseCatalogCommand(draft).type === "search") setEditing(false); },
    change: (value: string) => { if (runner?.isBusy()) return; if (awaiting) setAnswer(value); else { generation.current++; if (searchMode) { setSearch(value); if (!runner || !value) onQuery(value); } else setDraft(value); } },
    escape: () => { if (pending.current || parseCatalogCommand(searchMode ? search : draft).type !== "search" || !searchMode) cancel(); else { setSearch(""); onQuery(""); } },
    cancel, submit };
}
