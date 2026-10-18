import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "../../../electron/localization";
import type { CatalogCommandFavorites, CatalogCommandOperation, CatalogCommandPage } from "../../shared/catalogCommandTypes";
import type { FavoriteDirectory } from "../../shared/favoriteDirectoryTypes";
import type { ParsedQuickCommand } from "../commandParser";
import BottomNoticeBar from "../feedback/BottomNoticeBar";
import { useCatalogActivity } from "../catalog-workspace/CatalogActivity";
import { prepareCatalogCommand } from "./catalogCommandOperation";
import { catalogCommandErrorMessage } from "./catalogCommandErrors";

interface Notice { id: number; message: string; persist: boolean; cancel?: () => void; }
function useCommandRunner(favorites: CatalogCommandFavorites, open: (value: FavoriteDirectory | null) => void) {
  const activity = useCatalogActivity(), latest = useRef({ favorites, open, activity }); latest.current = { favorites, open, activity };
  const lock = useRef(false), serial = useRef(0), [busy, setBusy] = useState(false), [notice, setNotice] = useState<Notice | null>(null);
  const notify = useCallback((message: string, persist = false, cancel?: () => void) => {
    const id = ++serial.current; setNotice({ id, message, persist, cancel }); return id;
  }, []);
  const clear = useCallback((id?: number) => setNotice(value => id === undefined || value?.id === id ? null : value), []);
  useEffect(() => { if (notice && !notice.persist) { const timer = window.setTimeout(() => clear(notice.id), 5000); return () => window.clearTimeout(timer); } }, [notice, clear]);
  const prepare = useCallback((command: ParsedQuickCommand, page: CatalogCommandPage) => prepareCatalogCommand(command, page,
    latest.current.favorites, latest.current.open, () => Boolean(latest.current.activity?.busy)), []);
  const invoke = useCallback(async (operation: CatalogCommandOperation) => {
    if (lock.current) { notify(t("catalogCommand.busy")); return false; }
    lock.current = true; setBusy(true); notify(t("catalogCommand.executing"), true);
    try { notify(await operation.run()); return true; }
    catch (error) { notify(catalogCommandErrorMessage(error)); return false; }
    finally { lock.current = false; setBusy(false); }
  }, [notify]);
  return { busy, isBusy: () => lock.current, notice, notify, clear, prepare, invoke };
}
const CommandRunner = createContext<ReturnType<typeof useCommandRunner> | null>(null);
export const useCatalogCommandRunner = () => useContext(CommandRunner);
export function CatalogCommandProvider({ favorites, open, children }: { favorites: CatalogCommandFavorites; open: (value: FavoriteDirectory | null) => void; children: ReactNode }) {
  const runner = useCommandRunner(favorites, open);
  return <CommandRunner.Provider value={runner}>{children}</CommandRunner.Provider>;
}
export function CatalogCommandNotice() {
  const runner = useCatalogCommandRunner(), notice = runner?.notice;
  return notice ? <BottomNoticeBar className="cap-catalog-command-notice" message={notice.message}
    actions={<button type="button" disabled={runner.busy} aria-label={t("common.close")} onClick={() => { notice.cancel?.(); runner.clear(notice.id); }}>×</button>} /> : null;
}
