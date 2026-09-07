import { t } from "../../../electron/localization";
import type { DirectoryItem } from "../../shared/types";
import StableSidebarFlyout from "./StableSidebarFlyout";
import "./StableDirectoryFlyout.css";

interface StableDirectoryFlyoutProps {
  anchor: DOMRect;
  directory: DirectoryItem;
  directories: DirectoryItem[];
  onMove: (id: string, direction: "up" | "down") => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const StableDirectoryFlyout = ({ anchor, directory, directories, onMove, onEdit, onDelete, onClose }: StableDirectoryFlyoutProps) => {
  const directoryIndex = directories.findIndex((candidate) => candidate.id === directory.id);
  const runAndClose = (action: () => void) => { action(); onClose(); };
  return <StableSidebarFlyout anchor={anchor} label={directory.name} onClose={onClose}>
    <button type="button" disabled={directoryIndex <= 0} onClick={() => runAndClose(() => onMove(directory.id, "up"))}>{t("stableUi.sidebar.moveDirectoryUp")}</button>
    <button type="button" disabled={directoryIndex < 0 || directoryIndex >= directories.length - 1} onClick={() => runAndClose(() => onMove(directory.id, "down"))}>{t("stableUi.sidebar.moveDirectoryDown")}</button>
    <div className="cap-stable-sidebar-flyout-separator" role="separator" />
    <button type="button" onClick={() => runAndClose(() => onEdit(directory.id))}>{t("stableSettings.rename")}</button>
    <button type="button" className="is-danger" onClick={() => runAndClose(() => onDelete(directory.id))}>{t("common.delete")}</button>
  </StableSidebarFlyout>;
};

export default StableDirectoryFlyout;
