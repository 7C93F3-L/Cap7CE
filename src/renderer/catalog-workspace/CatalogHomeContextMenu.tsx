import { t } from "../../../electron/localization";
import type { CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import type { FavoriteDirectoryControls } from "../../shared/favoriteDirectoryTypes";
import DirectoryMetadataContextMenu from "../metadata-build/DirectoryMetadataContextMenu";
import { normalizeWindowsPathKey } from "../filePath";
import { useCatalogActivity } from "./CatalogActivity";
import type { CatalogHomeEntry } from "./CatalogHomeGroup";

export default function CatalogHomeContextMenu({ target, entry, appearance, onClose, onOpen, onMetadata, metadataBusy, favorites }: {
  target: { x: number; y: number; path: string }; entry: CatalogHomeEntry;
  appearance: Pick<CatalogWorkspaceAppearance, "theme" | "appearanceColors" | "windowMaterial">;
  onClose: () => void; onOpen: (path: string) => void; onMetadata: (path: string) => void; metadataBusy: boolean;
  favorites?: FavoriteDirectoryControls;
}) {
  const activity = useCatalogActivity(), favorite = favorites?.directories.find(item => normalizeWindowsPathKey(item.path) === normalizeWindowsPathKey(entry.path));
  const perform = async (action: "reveal" | "copy" | "favorite") => {
    try {
      const files = window.cap7ce?.files;
      const success = action === "reveal" ? files && await files.open(entry.path) === ""
        : action === "copy" ? files && await files.copyPaths([entry.path]) > 0
        : await (favorite ? favorites?.remove(favorite.id) : favorites?.add(entry.path));
      if (!success) throw Error("home-action-failed");
      if (action === "copy") activity?.notify(t("clipboard.copied"));
    } catch { activity?.notify(t("computerSearch.actionFailed")); }
  };
  return <DirectoryMetadataContextMenu target={target} appearance={appearance} onClose={onClose} onStart={onMetadata} busy={metadataBusy}
    keywordsBusy={activity?.busy} onAutoKeywords={activity ? () => void activity.startBatch(/^[A-Za-z]:\\*$/.test(entry.path)
      ? { driveLetter: entry.path[0].toUpperCase() } : { locationId: entry.id }, entry.name) : undefined}
    basicActions={[
      { id: "open", label: t("skim.openItem"), onSelect: () => onOpen(entry.path) },
      { id: "reveal", label: t("favorites.openExplorer"), onSelect: () => void perform("reveal") },
      { id: "copy", label: t("context.copyPath"), onSelect: () => void perform("copy") },
      ...(favorites ? [{ id: "favorite", label: t(favorite ? "catalogActions.removeFavorite" : "catalogActions.addFavorite"), disabled: favorites.busy, onSelect: () => void perform("favorite") }] : [])
    ]} />;
}
