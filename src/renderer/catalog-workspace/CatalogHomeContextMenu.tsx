import { t } from "../../../electron/localization";
import type { CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import type { FavoriteDirectoryControls } from "../../shared/favoriteDirectoryTypes";
import type { CatalogHomeEntry } from "../../shared/catalogHomeTypes";
import DirectoryMetadataContextMenu from "../metadata-build/DirectoryMetadataContextMenu";
import { normalizeWindowsPathKey } from "../filePath";
import { fileContextShortcutLabels } from "../fileContextActions";
import { useCatalogActivity } from "./CatalogActivity";

export default function CatalogHomeContextMenu({ target, entry, entries, appearance, onClose, onOpen, onPreview, onReveal, onCopy, onMetadata, metadataBusy, favorites }: {
  target: { x: number; y: number; path: string }; entry: CatalogHomeEntry; entries: CatalogHomeEntry[];
  appearance: Pick<CatalogWorkspaceAppearance, "theme" | "appearanceColors" | "windowMaterial">;
  onClose: () => void; onOpen: (path: string) => void; onPreview: () => void; onReveal: () => void; onCopy: () => void;
  onMetadata: (path: string) => void; metadataBusy: boolean; favorites?: FavoriteDirectoryControls;
}) {
  const activity = useCatalogActivity(), single = entries.length === 1;
  const favorite = favorites?.directories.find(item => normalizeWindowsPathKey(item.path) === normalizeWindowsPathKey(entry.path));
  const toggleFavorite = async () => {
    try { if (!await (favorite ? favorites?.remove(favorite.id) : favorites?.add(entry.path))) throw Error("unavailable"); }
    catch { activity?.notify(t("catalogHome.actionFailed")); }
  };
  return <DirectoryMetadataContextMenu target={target} appearance={appearance} onClose={onClose} onStart={onMetadata} busy={metadataBusy}
    showMetadata={single} keywordsBusy={activity?.busy} onAutoKeywords={activity && single ? () => void activity.startBatch(entry.kind === "drive"
      ? { driveLetter: entry.path[0].toUpperCase() } : { locationId: entry.id }, entry.name) : undefined}
    basicActions={[
      { id: "open", label: t("skim.openItem"), shortcut: fileContextShortcutLabels.open, onSelect: () => onOpen(entry.path) },
      { id: "preview", label: t("skim.preview"), shortcut: fileContextShortcutLabels.primaryView, onSelect: onPreview },
      { id: "reveal", label: t("skim.openPath"), shortcut: fileContextShortcutLabels.showInFolder, onSelect: onReveal },
      { id: "copy", label: t(entries.length > 1 ? "context.copySelectedPaths" : "context.copyPath", { count: entries.length }), shortcut: fileContextShortcutLabels.copyPaths, onSelect: onCopy },
      ...(favorites && single ? [{ id: "favorite", label: t(favorite ? "catalogActions.removeFavorite" : "catalogActions.addFavorite"), disabled: favorites.busy, onSelect: () => void toggleFavorite() }] : [])
    ]} />;
}
