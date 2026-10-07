export interface CatalogWorkspaceContext {
  id: string;
  kind: "search" | "browse";
  scopePath: string | null;
  name: string;
  displayName?: string;
}
export interface CatalogWorkspaceState {
  contexts: CatalogWorkspaceContext[];
  activeId: string;
  nextId: number;
  openLimitReached: boolean;
  homeName: string;
}
import type { AppearanceColors, ResolvedThemeMode, WindowMaterial } from "./types";

export interface CatalogWorkspaceAppearance {
  theme: ResolvedThemeMode;
  appearanceColors: AppearanceColors;
  windowMaterial: WindowMaterial;
  onNativeDragStateChange: (active: boolean) => void;
}

export interface CatalogContextActions {
  currentPath: string | null;
  browseChildren: boolean;
  openBrowser: (path: string | null) => void;
  toggleBrowser: () => void;
  focusSearch: () => void;
  refresh: () => Promise<boolean>;
  cycleFavorite?: () => void;
}
