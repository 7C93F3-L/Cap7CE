import { useEffect, useState, type MouseEvent } from "react";
import { useDirectoryMetadataAction } from "./useDirectoryMetadataAction";

export function useDirectoryMetadataMenu(foreground: boolean) {
  const [target, setTarget] = useState<{ x: number; y: number; path: string } | null>(null);
  const action = useDirectoryMetadataAction();
  useEffect(() => { if (!foreground) setTarget(null); }, [foreground]);
  return { ...action, target, close: () => setTarget(null), open(event: MouseEvent, path: string) {
    event.preventDefault(); event.stopPropagation(); setTarget({ x: event.clientX, y: event.clientY, path });
  } };
}
