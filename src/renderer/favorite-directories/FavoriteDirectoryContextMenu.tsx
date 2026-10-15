import { t } from "../../../electron/localization";
import type { FavoriteDirectory } from "../../shared/favoriteDirectoryTypes";
import type { CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import ResponsiveFileContextMenu from "../components/ResponsiveFileContextMenu";
import { getFileContextMenuStyle } from "../fileContextMenuShared";

export interface FavoriteContextTarget { directory: FavoriteDirectory; x: number; y: number; trigger: HTMLButtonElement }
export default function FavoriteDirectoryContextMenu({ target, index, count, busy, appearance, onClose, onRename, onRemove, onMove, onReveal, onCopyPath }: {
  target: FavoriteContextTarget; index: number; count: number; busy: boolean;
  appearance: Pick<CatalogWorkspaceAppearance, "theme" | "appearanceColors" | "windowMaterial">;
  onClose: () => void; onRename: () => void; onRemove: () => void;
  onMove: (direction: "up" | "down") => void; onReveal?: () => void; onCopyPath?: () => void;
}) {
  const action = (id: string, label: string, onSelect: () => void, disabled = false) => ({ id, label, onSelect, disabled: busy || disabled });
  return <ResponsiveFileContextMenu x={target.x} y={target.y} {...appearance}
    menuStyle={getFileContextMenuStyle(appearance.theme, appearance.appearanceColors, appearance.windowMaterial)}
    format="" fileName="" detail="" showInfo={false} returnFocus={target.trigger} onClose={onClose} actionGroups={[
      [action("reveal", t("favorites.openExplorer"), () => onReveal?.(), !onReveal),
        action("copy", t("context.copyPath"), () => onCopyPath?.(), !onCopyPath),
        action("rename", t("favorites.renameFolder"), onRename, /^[A-Za-z]:\\?$/.test(target.directory.path))],
      [action("up", t("favorites.up"), () => onMove("up"), index === 0),
        action("down", t("favorites.down"), () => onMove("down"), index === count - 1),
        action("remove", t("catalogActions.removeFavorite"), onRemove)]
    ]} />;
}
