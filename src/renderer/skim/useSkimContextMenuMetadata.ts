import { useEffect, useState } from "react";
import type { SkimFolderStats } from "../../shared/types";
import type { SkimContextMenuState } from "./SkimView";

const useSkimContextMenuMetadata = (state: SkimContextMenuState) => {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [folderStats, setFolderStats] = useState<SkimFolderStats | null>(null);

  useEffect(() => {
    setDimensions(null);
    setFolderStats(null);
    let active = true;
    let folderTimer: number | null = null;
    let folderTaskId: string | null = null;
    if (state.item.kind === "folder") {
      folderTimer = window.setTimeout(() => {
        folderTaskId = `file-info:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        void window.cap7ce?.skim.readFileInfoFolderStats({ taskId: folderTaskId, path: state.item.path })
          .then((stats) => { if (active && stats?.status === "completed") setFolderStats(stats); });
      }, 300);
    } else if (state.item.formatCapability?.previewKind === "image") {
      void window.cap7ce?.skim.readFileInfoDimensions(state.item.path)
        .then((value) => { if (active) setDimensions(value ?? null); });
    }
    return () => {
      active = false;
      if (folderTimer !== null) window.clearTimeout(folderTimer);
      if (folderTaskId) void window.cap7ce?.skim.cancelFileInfoFolderStats(folderTaskId);
    };
  }, [state.item]);

  return { dimensions, folderStats };
};

export default useSkimContextMenuMetadata;
