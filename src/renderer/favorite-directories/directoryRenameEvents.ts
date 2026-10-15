import { useEffect, useRef } from "react";
import type { DirectoryRename } from "../../shared/directoryRenameTypes";

const eventName = "cap7ce:directory-renamed";
export function notifyDirectoryRename(change: DirectoryRename) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: change }));
}
export function useDirectoryRename(callback: (change: DirectoryRename) => void) {
  const ref = useRef(callback); ref.current = callback;
  useEffect(() => {
    const listener = (event: Event) => ref.current((event as CustomEvent<DirectoryRename>).detail);
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, []);
}
