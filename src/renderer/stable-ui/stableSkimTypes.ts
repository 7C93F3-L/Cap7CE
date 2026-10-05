import type { ReactNode } from "react";
import type { AppearanceColors, ResolvedThemeMode, SkimBreadcrumb, SkimDisplayMode, SortDirection, SortField, WindowMaterial } from "../../shared/types";
export type StableSkimRequests = { toggleId: number; openId: number };
export interface StableSkimSearchControls {
  active: boolean;
  query: string;
  scopeLabel: string;
  canSubmit: boolean;
  busy: boolean;
  onEnter: () => void;
  onExit: () => void;
  onQueryChange: (query: string) => void;
  onSubmit: () => void;
}
export interface StableSkimProps {
  requests: StableSkimRequests;
  currentPath: string | null;
  breadcrumbs: SkimBreadcrumb[];
  isLoading: boolean;
  feedback: string;
  entryCount: number;
  displayMode: SkimDisplayMode;
  sortField: SortField;
  sortDirection: SortDirection;
  theme: ResolvedThemeMode; appearanceColors: AppearanceColors; windowMaterial: WindowMaterial;
  renderContent: (active: boolean) => ReactNode;
  onOpen: () => void;
  onOpenRoot: () => void;
  onOpenPath: (path: string) => void;
  onDisplayModeChange: (mode: SkimDisplayMode) => void;
  onSortChange: (field: SortField, direction: SortDirection) => void;
  onNativeDragStateChange: (active: boolean) => void;
}

export type StableSkimSlotProps = Omit<StableSkimProps, "renderContent" | "onOpen"> & {
  content: ReactNode;
  foreground?: boolean;
  onToggleSkim: () => void;
};
