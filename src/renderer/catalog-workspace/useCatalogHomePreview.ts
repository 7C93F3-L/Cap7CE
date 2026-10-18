import { useCallback, useEffect, useMemo, useRef } from "react";
import { getActiveLanguage, t } from "../../../electron/localization";
import type { CatalogHomeEntry } from "../../shared/catalogHomeTypes";
import type { CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import { createPreviewRequestGuard } from "../previewRequestGuard";

export function useCatalogHomePreview(entries: CatalogHomeEntry[], active: boolean, appearance: Partial<CatalogWorkspaceAppearance>,
  select: (entry: CatalogHomeEntry) => void, notify: (message: string) => void) {
  const guard = useMemo(createPreviewRequestGuard, []), owned = useRef<string | null>(null);
  const latest = useRef({ entries, active, select }); latest.current = { entries, active, select };
  useEffect(() => { if (!active) { guard.invalidate(); owned.current = null; } return () => { guard.invalidate(); owned.current = null; }; }, [active, guard]);
  const open = useCallback(async (entry: CatalogHomeEntry) => {
    if (!latest.current.active) return;
    const request = guard.begin();
    try {
      const info = await window.cap7ce?.skim?.inspect?.({ path: entry.path, kind: "folder" });
      if (!guard.isCurrent(request)) return;
      if (!info) throw Error("unavailable");
      const sessionId = `catalog-home:${crypto.randomUUID()}`;
      owned.current = entry.path;
      const opened = await window.cap7ce?.preview.open({ sessionId, itemId: entry.path, filePath: info.path,
        fileName: entry.name, fileSize: info.size, modifiedAt: info.modifiedAt, previewUrl: "", thumbnailUrl: "",
        provider: entry.kind === "drive" ? "fileInfo" : "folderInfo", info: { ...info, name: entry.name }, skimActive: true,
        theme: appearance.theme ?? "dark", language: getActiveLanguage(),
        appearanceColors: appearance.appearanceColors ?? { themeColor: "#7894f8", accentColor: "#67bec1" } });
      if (!guard.isCurrent(request)) return;
      if (!opened) { owned.current = null; throw Error("unavailable"); }
      if (entry.kind === "folder") void window.cap7ce?.skim?.startFolderStats?.({ sessionId, path: info.path }).catch(() => notify(t("catalogHome.actionFailed")));
    } catch { if (guard.isCurrent(request)) notify(t("catalogHome.actionFailed")); }
  }, [appearance.theme, appearance.appearanceColors, guard, notify]);
  useEffect(() => {
    const navigate = window.cap7ce?.preview?.onNavigate?.(direction => {
      const current = latest.current, index = current.entries.findIndex(entry => entry.path === owned.current);
      const next = current.entries[index + direction];
      if (!current.active || index < 0 || !next) return;
      current.select(next); void open(next);
    });
    const closed = window.cap7ce?.preview?.onClosed?.(() => { guard.invalidate(); owned.current = null; });
    return () => { navigate?.(); closed?.(); };
  }, [guard, open]);
  return open;
}
