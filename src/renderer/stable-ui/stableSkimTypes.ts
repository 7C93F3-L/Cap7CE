import type { ReactNode } from "react";
import type { SkimBreadcrumb, SkimDisplayMode, SortDirection, SortField } from "../../shared/types";
export type StableSkimRequests = { toggleId: number; openId: number };
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
  renderContent: (active: boolean) => ReactNode;
  onOpen: () => void;
  onBack: () => void;
  onOpenRoot: () => void;
  onOpenPath: (path: string) => void;
  onDisplayModeChange: (mode: SkimDisplayMode) => void;
  onSortChange: (field: SortField, direction: SortDirection) => void;
}
