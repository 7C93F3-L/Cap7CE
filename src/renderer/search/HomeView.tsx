import type { DirectoryItem, SearchState } from "../../shared/types";
import {
  Cap7CESearchCapsule,
  type SearchCapsuleLabelVisibility
} from "./Cap7CESearchCapsule";

export interface HomeViewProps {
  search: SearchState;
  directoryName: string;
  directories: DirectoryItem[];
  labelVisibility: SearchCapsuleLabelVisibility;
  onSearchChange: (search: SearchState) => void;
  onLabelVisibilityChange: (visibility: SearchCapsuleLabelVisibility) => void;
  onSearchOptionsChange: (search: SearchState) => void;
  onSearch: () => void;
}

export const HomeView = (props: HomeViewProps) => (
  <main className="home-view cap-home-view">
    <Cap7CESearchCapsule
      search={props.search}
      directoryName={props.directoryName}
      directories={props.directories}
      labelVisibility={props.labelVisibility}
      status="ready"
      unified
      onSearchChange={props.onSearchChange}
      onLabelVisibilityChange={props.onLabelVisibilityChange}
      onSearchOptionsChange={props.onSearchOptionsChange}
      onSearch={props.onSearch}
    />
    <div className="cap-home-signature">
      <span>Cap7CE</span>
      <small>Cap7CE</small>
    </div>
  </main>
);
