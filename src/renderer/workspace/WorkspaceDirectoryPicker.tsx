import { useEffect, useRef } from "react";
import { t } from "../../../electron/localization";
import StableShellSidebar from "../stable-ui/StableShellSidebar";
import type { StableSidebarProps } from "../stable-ui/stableSidebarTypes";

export default function WorkspaceDirectoryPicker({ sidebar, onSelect, onClose }: { sidebar: StableSidebarProps; onSelect: (id: string) => void; onClose: () => void }) {
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!pickerRef.current?.contains(target) && !target.closest?.(".cap-stable-sidebar-flyout, .cap-workspace-rail")) onClose();
    };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !sidebar.editingDirectoryId) onClose(); };
    document.addEventListener("pointerdown", closeOutside); window.addEventListener("keydown", closeEscape); window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("pointerdown", closeOutside); window.removeEventListener("keydown", closeEscape); window.removeEventListener("resize", onClose); };
  }, [onClose, sidebar.editingDirectoryId]);
  return <div ref={pickerRef} className="cap-workspace-directory-picker" role="dialog" aria-label={t("stableUi.sidebar.addedDirectories")} onClick={(event) => event.stopPropagation()}>
    <StableShellSidebar {...sidebar} directoryOnly skimOpen={false} onToggleSkim={() => {}} onSearchOptionsChange={(search) => { onSelect(search.directoryId); onClose(); }} />
  </div>;
}
