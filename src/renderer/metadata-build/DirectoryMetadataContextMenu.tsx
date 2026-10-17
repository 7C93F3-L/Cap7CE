import type { CatalogWorkspaceAppearance } from "../../shared/catalogWorkspaceTypes";
import { t } from "../../../electron/localization";
import ResponsiveFileContextMenu from "../components/ResponsiveFileContextMenu";
import { getFileContextMenuStyle } from "../fileContextMenuShared";

export default function DirectoryMetadataContextMenu({ target, appearance, onClose, onStart, onAutoKeywords }: {
  target: { x: number; y: number; path: string };
  appearance: Pick<CatalogWorkspaceAppearance, "theme" | "appearanceColors" | "windowMaterial">; onClose: () => void; onStart: (path: string) => void;
  onAutoKeywords?: () => void;
}) {
  return <ResponsiveFileContextMenu x={target.x} y={target.y} theme={appearance.theme}
    menuStyle={getFileContextMenuStyle(appearance.theme, appearance.appearanceColors, appearance.windowMaterial)}
    format="" fileName="" detail="" showInfo={false} onClose={onClose}
    actionGroups={[[{ id: "metadata", label: t("metadataDirectory.action"), onSelect: () => onStart(target.path) },
      ...(onAutoKeywords ? [{ id: "autoKeywords", label: "自动添加关键词", onSelect: onAutoKeywords }] : [])], []]} />;
}
