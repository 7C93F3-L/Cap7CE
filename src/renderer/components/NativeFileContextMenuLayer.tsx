import { useEffect, useRef } from "react";
import type { NativeFileContextMenuAction, NativeFileContextMenuRequest } from "../../../electron/nativeFileContextMenuTypes";

interface NativeFileContextMenuLayerProps {
  request: NativeFileContextMenuRequest;
  onAction: (action: NativeFileContextMenuAction) => void;
  onClose: () => void;
}

const NativeFileContextMenuLayer = ({ request, onAction, onClose }: NativeFileContextMenuLayerProps) => {
  const requestStartedRef = useRef(false);
  const activeRef = useRef(false);
  useEffect(() => {
    activeRef.current = true;
    if (requestStartedRef.current) return () => { activeRef.current = false; };
    requestStartedRef.current = true;
    const api = window.cap7ce?.fileContextMenu;
    if (!api) { onClose(); return undefined; }
    const finish = (action: NativeFileContextMenuAction | null) => {
      if (!activeRef.current) return;
      onClose();
      if (action) onAction(action);
    };
    void api.open(request).then(finish, () => finish(null));
    return () => { activeRef.current = false; };
  }, [request]);
  return null;
};

export default NativeFileContextMenuLayer;
