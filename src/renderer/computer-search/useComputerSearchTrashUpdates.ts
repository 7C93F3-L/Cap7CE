import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { ComputerSearchItem } from "../../../electron/computerSearchTypes";
import { normalizeWindowsPathKey } from "../filePath";

const eventName = "cap7ce:catalog-trashed";
export const reportComputerSearchTrash = (paths: string[]) => window.dispatchEvent(new CustomEvent(eventName, { detail: paths }));
export function useComputerSearchTrashUpdates(setItems: Dispatch<SetStateAction<ComputerSearchItem[]>>) {
  useEffect(() => {
    const removed = (event: Event) => {
      const paths = (event as CustomEvent<string[]>).detail.map(normalizeWindowsPathKey);
      setItems(items => items.filter(item => {
        const key = normalizeWindowsPathKey(item.path);
        return !paths.some(path => key === path || key.startsWith(path + "\\"));
      }));
    };
    window.addEventListener(eventName, removed);
    return () => window.removeEventListener(eventName, removed);
  }, [setItems]);
}
