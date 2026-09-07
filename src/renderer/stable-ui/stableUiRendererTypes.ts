import type { ComponentType, CSSProperties, ReactNode, Ref } from "react";
import type { ResolvedThemeMode, SearchState, WindowMaterial } from "../../shared/types";
import type { StableSidebarProps } from "./stableSidebarTypes";
import type { StableSkimProps } from "./stableSkimTypes";

export interface StableUiRendererProps {
  theme: ResolvedThemeMode; themeStyle: CSSProperties; windowMaterial: WindowMaterial;
  pinned: boolean; pinLabel: string;
  search: SearchState;
  searchInputRef: Ref<HTMLInputElement>;
  inputFeedback: string;
  inputFeedbackIsGuide: boolean;
  resultStatus: ReactNode; resultContent: (active: boolean) => ReactNode; overlayContent: ReactNode;
  sidebar: StableSidebarProps;
  skim: StableSkimProps;
  directoryDropEnabled: boolean;
  onTogglePinned: () => void;
  onSearchChange: (search: SearchState) => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onSearch: () => void;
  onDirectoryDrop: (dataTransfer: DataTransfer) => void;
  onDismissOverlay: () => void;
}

export type StableUiRenderer = ComponentType<StableUiRendererProps>;
