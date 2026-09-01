import type { ReactNode } from "react";
import type { SkimBreadcrumb, SkimDisplayMode, SortDirection, SortField } from "../../shared/types";

export interface StableSkimProps {
  currentPath: string | null;
  breadcrumbs: SkimBreadcrumb[];
  isLoading: boolean;
  feedback: string;
  entryCount: number;
  displayMode: SkimDisplayMode;
  sortField: SortField;
  sortDirection: SortDirection;
  renderContent: (active: boolean) => ReactNode;
  onOpen: () => void;
  onBack: () => void;
  onOpenRoot: () => void;
  onOpenPath: (path: string) => void;
  onDisplayModeChange: (mode: SkimDisplayMode) => void;
  onSortChange: (field: SortField, direction: SortDirection) => void;
}
