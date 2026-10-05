import type { WorkspaceTabItem } from "../../shared/workspaceTypes";

export const getWorkspaceTabOverflow = (tabs: readonly WorkspaceTabItem[], activeId: string, width: number) => {
  if (tabs.length === 0) return { visible: [], hidden: [] };
  const needsOverflow = tabs.length * 120 > width;
  const capacity = needsOverflow ? Math.max(1, Math.floor((width - 40) / 120)) : tabs.length;
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];
  const visibleIds = new Set([active.id]);
  for (const tab of tabs) {
    if (visibleIds.size >= capacity) break;
    visibleIds.add(tab.id);
  }
  return { visible: tabs.filter((tab) => visibleIds.has(tab.id)), hidden: tabs.filter((tab) => !visibleIds.has(tab.id)) };
};
