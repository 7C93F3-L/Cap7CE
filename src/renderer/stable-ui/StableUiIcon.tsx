import type { SortDirection } from "../../shared/types";
import aiEnhanceIcon from "../../../resources/icons/icon-stable-ai-enhance.svg?raw";
import aiEnhanceActiveIcon from "../../../resources/icons/icon-stable-ai-enhance-active.svg?raw";
import clearSearchIcon from "../../../resources/icons/icon-stable-clear-search.svg?raw";
import folderIcon from "../../../resources/icons/icon-stable-folder.svg?raw";
import folderSelectedIcon from "../../../resources/icons/icon-stable-folder-selected.svg?raw";
import scopeIcon from "../../../resources/icons/icon-stable-search-scope.svg?raw";
import scopeActiveIcon from "../../../resources/icons/icon-stable-search-scope-active.svg?raw";
import searchIcon from "../../../resources/icons/icon-stable-search.svg?raw";
import settingsIcon from "../../../resources/icons/icon-stable-settings.svg?raw";
import settingsActiveIcon from "../../../resources/icons/icon-stable-settings-active.svg?raw";
import skimIcon from "../../../resources/icons/icon-stable-skim.svg?raw";
import skimActiveIcon from "../../../resources/icons/icon-stable-skim-active.svg?raw";
import sortAscIcon from "../../../resources/icons/icon-sort-asc.svg?raw";
import sortDescIcon from "../../../resources/icons/icon-sort-desc.svg?raw";
import SvgIcon from "../components/SvgIcon";

export type StableUiIconName = "ai" | "clearSearch" | "folder" | "scope" | "search" | "settings" | "skim" | "sort";

const StableUiIcon = ({ name, active = false, sortDirection = "asc", className = "cap-stable-sidebar-icon" }: {
  name: StableUiIconName;
  active?: boolean;
  sortDirection?: SortDirection;
  className?: string;
}) => {
  const svg = name === "ai" ? (active ? aiEnhanceActiveIcon : aiEnhanceIcon)
    : name === "clearSearch" ? clearSearchIcon
      : name === "folder" ? (active ? folderSelectedIcon : folderIcon)
      : name === "scope" ? (active ? scopeActiveIcon : scopeIcon)
        : name === "settings" ? (active ? settingsActiveIcon : settingsIcon)
          : name === "skim" ? (active ? skimActiveIcon : skimIcon)
            : name === "sort" ? (sortDirection === "asc" ? sortAscIcon : sortDescIcon)
              : searchIcon;
  return <SvgIcon svg={svg} className={`cap-svg-icon ${className}`} />;
};

export default StableUiIcon;
