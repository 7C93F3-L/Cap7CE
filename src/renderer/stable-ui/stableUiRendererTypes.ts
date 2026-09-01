import type { ComponentType, CSSProperties, ReactNode, Ref } from "react";
import type { ResolvedThemeMode, SearchState } from "../../shared/types";
import type { StableSidebarProps } from "./stableSidebarTypes";

export interface StableUiRendererProps {
  theme: ResolvedThemeMode; themeStyle: CSSProperties;
  pinned: boolean; pinLabel: string;
  search: SearchState;
  searchInputRef: Ref<HTMLInputElement>;
  inputFeedback: string;
  inputFeedbackIsGuide: boolean;
  resultStatus: ReactNode; resultContent: ReactNode; overlayContent: ReactNode;
  sidebar: StableSidebarProps;
  directoryDropEnabled: boolean;
  onTogglePinned: () => void;
  onSearchChange: (search: SearchState) => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onSearch: () => void;
  onDirectoryDrop: (dataTransfer: DataTransfer) => void;
  onDismissOverlay: () => void;
}

export type StableUiRenderer = ComponentType<StableUiRendererProps>;
