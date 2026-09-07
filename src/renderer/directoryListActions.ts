import type { DirectoryItem } from "../shared/types";

export const moveDirectoryAndRefresh = async (
  id: string,
  direction: "up" | "down",
  refreshDirectories: (directories: DirectoryItem[]) => void
) => {
  const nextDirectories = await window.cap7ce?.directories.move(id, direction);
  if (nextDirectories) refreshDirectories(nextDirectories);
};
